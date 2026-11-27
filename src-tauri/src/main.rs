#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{
    LogicalPosition, LogicalSize, Manager, State, Url, WebviewBuilder, WebviewUrl,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
struct ProbeResult {
    name: String,
    author: String,
}

#[derive(Serialize)]
struct PollResult {
    lines: Vec<String>,
    exited: bool,
}

struct SessionQueue {
    lines: VecDeque<String>,
    exited: bool,
}

struct UsiSession {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Child>>,
    queue: Arc<(Mutex<SessionQueue>, Condvar)>,
}

#[derive(Default)]
struct UsiState {
    sessions: Mutex<HashMap<String, Arc<UsiSession>>>,
    next_id: Mutex<u64>,
}

fn spawn_usi_child(exe_path: &PathBuf) -> Result<Child, String> {
    if !exe_path.exists() {
        return Err(format!("Executable not found: {}", exe_path.display()));
    }
    let parent = exe_path
        .parent()
        .ok_or_else(|| "Invalid executable directory".to_string())?;

    let mut cmd = Command::new(exe_path);
    cmd.current_dir(parent)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn()
        .map_err(|e| format!("Failed to launch USI executable: {e}"))
}

#[tauri::command]
async fn tauri_usi_pick_file() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .add_filter("USI Executable", &["exe", "bin", "*"])
        .pick_file()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string())
}

#[tauri::command]
async fn tauri_usi_probe(exe_path: String) -> Result<ProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(exe_path.trim());
        let mut child = spawn_usi_child(&path)?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open engine stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open engine stdout".to_string())?;

        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });

        stdin
            .write_all(b"usi\n")
            .and_then(|()| stdin.flush())
            .map_err(|e| format!("Failed to send usi command: {e}"))?;

        let mut name = String::new();
        let mut author = String::new();
        let deadline = Instant::now() + Duration::from_millis(4500);

        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                let _ = stdin.write_all(b"quit\n");
                let _ = child.kill();
                return Err("Timed out waiting for usiok response".to_string());
            }

            match rx.recv_timeout(remaining) {
                Ok(raw) => {
                    let clean = raw.trim();
                    if let Some(rest) = clean.strip_prefix("id name ") {
                        name = rest.trim().to_string();
                    } else if let Some(rest) = clean.strip_prefix("id author ") {
                        author = rest.trim().to_string();
                    } else if clean == "usiok" {
                        let _ = stdin.write_all(b"quit\n");
                        let _ = stdin.flush();
                        let _ = child.kill();
                        let _ = child.wait();
                        let fallback_name = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Custom USI Engine")
                            .to_string();
                        return Ok(ProbeResult {
                            name: if name.is_empty() { fallback_name } else { name },
                            author: if author.is_empty() {
                                "Unknown Author".to_string()
                            } else {
                                author
                            },
                        });
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let _ = child.kill();
                    return Err("Timed out waiting for usiok response".to_string());
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let _ = child.wait();
                    return Err("USI engine exited before usiok".to_string());
                }
            }
        }
    })
    .await
    .map_err(|e| format!("Probe task join error: {e}"))?
}

#[tauri::command]
fn tauri_usi_start(state: State<'_, UsiState>, exe_path: String) -> Result<String, String> {
    let path = PathBuf::from(exe_path.trim());
    let mut child = spawn_usi_child(&path)?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture engine stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture engine stdout".to_string())?;

    let session_id = {
        let mut next = state.next_id.lock().map_err(|_| "State lock poisoned")?;
        *next += 1;
        format!("usi-session-{}", *next)
    };

    let queue = Arc::new((
        Mutex::new(SessionQueue {
            lines: VecDeque::new(),
            exited: false,
        }),
        Condvar::new(),
    ));

    let session = Arc::new(UsiSession {
        stdin: Arc::new(Mutex::new(Some(stdin))),
        child: Arc::new(Mutex::new(child)),
        queue: Arc::clone(&queue),
    });

    {
        let mut sessions = state.sessions.lock().map_err(|_| "State lock poisoned")?;
        sessions.insert(session_id.clone(), Arc::clone(&session));
    }

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut guard) = queue.0.lock() {
                guard.lines.push_back(line);
                queue.1.notify_all();
            }
        }
        if let Ok(mut guard) = queue.0.lock() {
            guard.exited = true;
            queue.1.notify_all();
        }
    });

    Ok(session_id)
}

#[tauri::command]
async fn tauri_usi_poll(
    state: State<'_, UsiState>,
    session_id: String,
) -> Result<PollResult, String> {
    let session = {
        let sessions = state.sessions.lock().map_err(|_| "State lock poisoned")?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "Unknown USI session".to_string())?
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        let (lock, cvar) = &*session.queue;
        let mut guard = lock.lock().map_err(|_| "Queue lock poisoned".to_string())?;
        if guard.lines.is_empty() && !guard.exited {
            let (next_guard, _) = cvar
                .wait_timeout(guard, Duration::from_millis(250))
                .map_err(|_| "Queue wait failed".to_string())?;
            guard = next_guard;
        }
        let lines: Vec<String> = guard.lines.drain(..).collect();
        let exited = guard.exited;
        Ok::<PollResult, String>(PollResult { lines, exited })
    })
    .await
    .map_err(|e| format!("Poll task join error: {e}"))??;

    if result.exited {
        if let Ok(mut sessions) = state.sessions.lock() {
            sessions.remove(&session_id);
        }
    }

    Ok(result)
}

#[tauri::command]
fn tauri_usi_send(
    state: State<'_, UsiState>,
    session_id: String,
    command: String,
) -> Result<(), String> {
    let session = {
        let sessions = state.sessions.lock().map_err(|_| "State lock poisoned")?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "Unknown USI session".to_string())?
    };

    let mut guard = session
        .stdin
        .lock()
        .map_err(|_| "Stdin lock poisoned".to_string())?;
    let stdin = guard
        .as_mut()
        .ok_or_else(|| "Engine stdin closed".to_string())?;

    stdin
        .write_all(format!("{command}\n").as_bytes())
        .and_then(|()| stdin.flush())
        .map_err(|e| format!("Failed to write to USI stdin: {e}"))
}

#[tauri::command]
fn tauri_usi_stop(state: State<'_, UsiState>, session_id: String) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().map_err(|_| "State lock poisoned")?;
        sessions.remove(&session_id)
    };

    if let Some(sess) = session {
        if let Ok(mut stdin_guard) = sess.stdin.lock() {
            if let Some(mut stdin) = stdin_guard.take() {
                let _ = stdin.write_all(b"quit\n");
                let _ = stdin.flush();
            }
        }
        if let Ok(mut child) = sess.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    Ok(())
}

const SPLIT_BROWSER_LABEL: &str = "split_ref_browser";

#[tauri::command]
fn tauri_split_browser_open(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let parsed_url = Url::parse(url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    let pos = LogicalPosition::new(x.max(0.0), y.max(0.0));
    let size = LogicalSize::new(width.max(1.0), height.max(1.0));

    if let Some(webview) = app.get_webview(SPLIT_BROWSER_LABEL) {
        let _ = webview.set_position(pos);
        let _ = webview.set_size(size);
        webview
            .navigate(parsed_url)
            .map_err(|e| format!("Failed to navigate split browser: {e}"))?;
        let _ = webview.show();
        return Ok(());
    }

    let main_window = app
        .get_window("main")
        .or_else(|| app.windows().into_values().next())
        .ok_or_else(|| "Main window not found".to_string())?;

    let builder = WebviewBuilder::new(SPLIT_BROWSER_LABEL, WebviewUrl::External(parsed_url))
        .auto_resize();
    main_window
        .add_child(builder, pos, size)
        .map_err(|e| format!("Failed to create child WebView: {e}"))?;
    Ok(())
}

#[tauri::command]
fn tauri_split_browser_bounds(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(SPLIT_BROWSER_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(x.max(0.0), y.max(0.0)));
        let _ = webview.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)));
        let _ = webview.show();
    }
    Ok(())
}

#[tauri::command]
fn tauri_split_browser_hide(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(SPLIT_BROWSER_LABEL) {
        let _ = webview.hide();
    }
    Ok(())
}

#[tauri::command]
fn tauri_split_browser_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(SPLIT_BROWSER_LABEL) {
        let _ = webview.close();
    }
    Ok(())
}

fn percent_encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for byte in input.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            other => {
                out.push('%');
                out.push_str(&format!("{other:02X}"));
            }
        }
    }
    out
}

fn percent_decode_component(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let raw = input.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(hex_str) = std::str::from_utf8(&raw[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if raw[i] == b'+' {
            bytes.push(b' ');
            i += 1;
            continue;
        }
        bytes.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }
}

#[tauri::command]
async fn tauri_google_auth_loopback(login_base_url: String) -> Result<String, String> {
    let trimmed = login_base_url.trim().to_string();
    if !trimmed.starts_with("https://")
        && !trimmed.starts_with("http://localhost")
        && !trimmed.starts_with("http://127.0.0.1")
    {
        return Err("Invalid login URL".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind loopback auth listener: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to inspect loopback port: {e}"))?
            .port();
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Failed to configure nonblocking listener: {e}"))?;

        let callback_url = format!("http://127.0.0.1:{port}/callback");
        let sep = if trimmed.contains('?') { '&' } else { '?' };
        let auth_url = format!(
            "{trimmed}{sep}tauri_callback={}",
            percent_encode_component(&callback_url)
        );
        open_url_in_system_browser(&auth_url)?;

        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            if Instant::now() >= deadline {
                return Err("Timed out waiting for browser authentication".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buf = [0_u8; 32768];
                    let bytes_read = stream.read(&mut buf).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..bytes_read]);
                    let first_line = request.lines().next().unwrap_or("");
                    let target = first_line.split_whitespace().nth(1).unwrap_or("/");
                    let (path, query) = target.split_once('?').unwrap_or((target, ""));

                    if path != "/callback" {
                        let not_found =
                            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(not_found.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    let mut id_token: Option<String> = None;
                    let mut auth_error: Option<String> = None;
                    for pair in query.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            let val = percent_decode_component(v);
                            if k == "id_token" && !val.is_empty() {
                                id_token = Some(val);
                            } else if k == "error" && !val.is_empty() {
                                auth_error = Some(val);
                            }
                        }
                    }

                    let body = if id_token.is_some() {
                        "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><body style=\"background:#020617;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center\"><div><h2>ログイン完了しました</h2><p>このブラウザタブを閉じて、棋樹（Kiju）アプリへ戻ってください。</p></div></body></html>"
                    } else {
                        "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><body style=\"background:#020617;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center\"><div><h2>認証を完了できませんでした</h2><p>アプリへ戻って再度お試しください。</p></div></body></html>"
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if let Some(err) = auth_error {
                        return Err(err);
                    }
                    if let Some(token) = id_token {
                        return Ok(token);
                    }
                    return Err("Callback received without Google ID token".to_string());
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(err) => {
                    return Err(format!("Loopback listener failed: {err}"));
                }
            }
        }
    })
    .await
    .map_err(|e| format!("Loopback auth task panicked: {e}"))?
}

fn main() {
    tauri::Builder::default()
        .manage(UsiState::default())
        .invoke_handler(tauri::generate_handler![
            tauri_usi_pick_file,
            tauri_usi_probe,
            tauri_usi_start,
            tauri_usi_poll,
            tauri_usi_send,
            tauri_usi_stop,
            tauri_split_browser_open,
            tauri_split_browser_bounds,
            tauri_split_browser_hide,
            tauri_split_browser_close,
            tauri_google_auth_loopback
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
