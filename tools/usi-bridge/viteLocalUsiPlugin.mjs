/**
 * Vite dev server middleware for direct local USI executable (.exe) integration (#143).
 * Exposes `/__usi_local/*` endpoints in local workstation dev mode so users on Windows/macOS
 * can select local USI binaries via a native file dialog and run them without installing Rust
 * or launching a separate WebSocket bridge process.
 * Strictly English code and comments (Rule 1).
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function pickFileNative() {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const psScript = [
        '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$f=New-Object System.Windows.Forms.Form',
        '$f.TopMost=$true',
        '$d=New-Object System.Windows.Forms.OpenFileDialog',
        "$d.Filter='USI Executable (*.exe)|*.exe|All Files (*.*)|*.*'",
        'if($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.FileName}',
        '$f.Dispose()',
      ].join('; ');

      const proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-Sta', '-Command', psScript],
        { windowsHide: true }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `File picker exited with code ${String(code)}`));
          return;
        }
        const selected = stdout.trim();
        resolve(selected || null);
      });
      return;
    }

    if (process.platform === 'darwin') {
      const proc = spawn('osascript', [
        '-e',
        'POSIX path of (choose file with prompt "Select USI Engine Executable")',
      ]);
      let stdout = '';
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('exit', () => {
        const selected = stdout.trim();
        resolve(selected || null);
      });
      return;
    }

    reject(new Error('Native file dialog is only supported on Windows and macOS'));
  });
}

function probeLocalUsi(exePath, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const resolved = path.resolve(exePath);
    if (!fs.existsSync(resolved)) {
      reject(new Error(`Executable not found: ${resolved}`));
      return;
    }

    const proc = spawn(resolved, [], {
      cwd: path.dirname(resolved),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let settled = false;
    let detectedName = '';
    let detectedAuthor = '';

    const cleanup = () => {
      clearTimeout(timer);
      try {
        if (proc.stdin.writable) {
          proc.stdin.write('quit\n');
        }
      } catch {
        // Ignore teardown errors
      }
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
        }
      }, 200);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Timed out waiting for USI usiok response'));
      }
    }, timeoutMs);

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const clean = line.trim();
      if (clean.startsWith('id name ')) {
        detectedName = clean.slice('id name '.length).trim();
      } else if (clean.startsWith('id author ')) {
        detectedAuthor = clean.slice('id author '.length).trim();
      } else if (clean === 'usiok') {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({
            name: detectedName || path.basename(resolved),
            author: detectedAuthor || 'Unknown Author',
          });
        }
      }
    });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Engine exited unexpectedly (code=${String(code)})`));
      }
    });

    if (proc.stdin.writable) {
      proc.stdin.write('usi\n');
    }
  });
}

export function localUsiDevPlugin() {
  const sessions = new Map();

  const stopSession = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    session.closed = true;
    try {
      if (session.proc.stdin.writable) {
        session.proc.stdin.write('quit\n');
      }
    } catch {
      // Ignore write error on teardown
    }
    setTimeout(() => {
      if (!session.proc.killed) {
        session.proc.kill();
      }
    }, 200);
    if (session.res && !session.res.writableEnded) {
      try {
        session.res.end();
      } catch {
        // Ignore end error
      }
    }
  };

  return {
    name: 'local-usi-dev-bridge',
    configureServer(server) {
      server.httpServer?.on('close', () => {
        for (const id of Array.from(sessions.keys())) {
          stopSession(id);
        }
      });

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '';
        if (!rawUrl.startsWith('/local-usi/')) {
          next();
          return;
        }

        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
        const pathname = parsedUrl.pathname;

        try {
          if (pathname === '/local-usi/pick-file' && req.method === 'POST') {
            const exePath = await pickFileNative();
            sendJson(res, 200, { ok: true, exePath });
            return;
          }

          if (pathname === '/local-usi/probe' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const exePath = typeof body.exePath === 'string' ? body.exePath.trim() : '';
            if (!exePath) {
              sendJson(res, 400, { ok: false, error: 'exePath is required' });
              return;
            }
            const info = await probeLocalUsi(exePath);
            sendJson(res, 200, { ok: true, ...info });
            return;
          }

          if (pathname === '/local-usi/start' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const exePath = typeof body.exePath === 'string' ? body.exePath.trim() : '';
            if (!exePath) {
              sendJson(res, 400, { ok: false, error: 'exePath is required' });
              return;
            }
            const resolved = path.resolve(exePath);
            if (!fs.existsSync(resolved)) {
              sendJson(res, 404, { ok: false, error: `Executable not found: ${resolved}` });
              return;
            }

            const sessionId = crypto.randomUUID();
            const proc = spawn(resolved, [], {
              cwd: path.dirname(resolved),
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
            });

            const session = {
              id: sessionId,
              proc,
              res: null,
              buffer: [],
              closed: false,
            };
            sessions.set(sessionId, session);

            const emitLine = (line) => {
              if (session.closed) return;
              const frame = `data: ${JSON.stringify({ line })}\n\n`;
              if (session.res && !session.res.writableEnded) {
                session.res.write(frame);
              } else {
                session.buffer.push(frame);
              }
            };

            const stdoutRl = readline.createInterface({ input: proc.stdout });
            stdoutRl.on('line', emitLine);

            proc.on('error', (err) => {
              if (session.res && !session.res.writableEnded) {
                session.res.write(
                  `event: engine_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
                );
              }
              stopSession(sessionId);
            });

            proc.on('exit', () => {
              stopSession(sessionId);
            });

            sendJson(res, 200, { ok: true, sessionId });
            return;
          }

          if (pathname === '/local-usi/stream' && req.method === 'GET') {
            const sessionId = parsedUrl.searchParams.get('sessionId') ?? '';
            const session = sessions.get(sessionId);
            if (!session) {
              res.statusCode = 404;
              res.end('Unknown session');
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            session.res = res;

            while (session.buffer.length > 0) {
              res.write(session.buffer.shift());
            }

            req.on('close', () => {
              stopSession(sessionId);
            });
            return;
          }

          if (pathname === '/local-usi/send' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
            const command = typeof body.command === 'string' ? body.command : '';
            const session = sessions.get(sessionId);
            if (!session || session.closed) {
              sendJson(res, 404, { ok: false, error: 'Session not active' });
              return;
            }
            if (command && session.proc.stdin.writable) {
              session.proc.stdin.write(`${command}\n`);
            }
            sendJson(res, 200, { ok: true });
            return;
          }

          if (pathname === '/local-usi/stop' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
            stopSession(sessionId);
            sendJson(res, 200, { ok: true });
            return;
          }

          sendJson(res, 404, { ok: false, error: 'Not found' });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    },
  };
}
