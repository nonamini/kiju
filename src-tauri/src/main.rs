#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

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

fn main() {
    tauri::Builder::default()
        .manage(UsiState::default())
        .invoke_handler(tauri::generate_handler![
            tauri_usi_pick_file,
            tauri_usi_probe,
            tauri_usi_start,
            tauri_usi_poll,
            tauri_usi_send,
            tauri_usi_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
