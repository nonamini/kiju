/**
 * Dual-runtime Local USI Executable (.exe) Adapter (#143).
 * Communicates with user-selected native USI engine executables via:
 *   1) Native Tauri desktop runtime commands (`window.__TAURI_INTERNALS__.invoke`)
 *   2) Local Vite workstation dev server middleware (`/local-usi/*` + SSE stream)
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

export interface LocalUsiProbeResult {
  name: string;
  author: string;
}

export interface LocalUsiSessionHandle {
  send: (command: string) => void;
  close: () => void;
}

interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriWindow extends Window {
  __TAURI_INTERNALS__?: TauriInternals;
}

function getTauriInternals(): TauriInternals | null {
  if (typeof window === 'undefined') return null;
  const win = window as TauriWindow;
  if (win.__TAURI_INTERNALS__ && typeof win.__TAURI_INTERNALS__.invoke === 'function') {
    return win.__TAURI_INTERNALS__;
  }
  return null;
}

/**
 * Returns true when executing inside the Tauri desktop shell.
 */
export function isTauriRuntime(): boolean {
  return getTauriInternals() !== null;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Local USI runtime is unavailable in static web hosting. Use the desktop app or local dev server.'
    );
  }
  const data = (await res.json()) as { ok?: boolean; error?: string } & T;
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

/**
 * Opens an OS native file picker dialog to select a local USI executable (.exe).
 * Returns null if the user cancels the dialog.
 */
export async function pickLocalUsiExecutable(): Promise<string | null> {
  const tauri = getTauriInternals();
  if (tauri) {
    const selected = await tauri.invoke<string | null>('tauri_usi_pick_file');
    return selected && selected.trim().length > 0 ? selected.trim() : null;
  }

  const res = await postJson<{ exePath?: string | null }>('/local-usi/pick-file', {});
  return res.exePath && res.exePath.trim().length > 0 ? res.exePath.trim() : null;
}

/**
 * Launches a local USI executable momentarily, sends `usi`, and extracts `id name` and `id author`.
 */
export async function probeLocalUsiExecutable(
  exePath: string
): Promise<LocalUsiProbeResult> {
  const trimmed = exePath.trim();
  if (!trimmed) {
    throw new Error('Executable path is required');
  }

  const tauri = getTauriInternals();
  if (tauri) {
    const res = await tauri.invoke<{ name?: string; author?: string }>(
      'tauri_usi_probe',
      { exePath: trimmed }
    );
    return {
      name: res.name || 'Custom Local USI',
      author: res.author || 'Unknown Author',
    };
  }

  const res = await postJson<{ name?: string; author?: string }>('/local-usi/probe', {
    exePath: trimmed,
  });
  return {
    name: res.name || 'Custom Local USI',
    author: res.author || 'Unknown Author',
  };
}

/**
 * Spawns a persistent local USI executable session and streams stdout lines to `onLine`.
 */
export async function startLocalUsiSession(
  exePath: string,
  onLine: (line: string) => void,
  onError: (message: string) => void
): Promise<LocalUsiSessionHandle> {
  const trimmed = exePath.trim();
  if (!trimmed) {
    throw new Error('Executable path is required');
  }

  const tauri = getTauriInternals();
  if (tauri) {
    const sessionId = await tauri.invoke<string>('tauri_usi_start', {
      exePath: trimmed,
    });
    let closed = false;
    let sendChain = Promise.resolve();

    const pollLoop = async () => {
      while (!closed) {
        try {
          const result = await tauri.invoke<{ lines: string[]; exited: boolean }>(
            'tauri_usi_poll',
            { sessionId }
          );
          for (const line of result.lines) {
            if (!closed) {
              onLine(line);
            }
          }
          if (result.exited) {
            if (!closed) {
              closed = true;
              onError('Local USI engine process exited');
            }
            return;
          }
        } catch (err) {
          if (!closed) {
            closed = true;
            onError(err instanceof Error ? err.message : String(err));
          }
          return;
        }
      }
    };

    void pollLoop();

    return {
      send: (command: string) => {
        if (closed || !command.trim()) return;
        sendChain = sendChain
          .then(() =>
            tauri.invoke('tauri_usi_send', { sessionId, command }).then(() => undefined)
          )
          .catch((err) => {
            if (!closed) {
              onError(err instanceof Error ? err.message : String(err));
            }
          });
      },
      close: () => {
        if (closed) return;
        closed = true;
        void tauri.invoke('tauri_usi_stop', { sessionId }).catch(() => undefined);
      },
    };
  }

  // Vite dev middleware transport (/local-usi/* + SSE)
  const started = await postJson<{ sessionId: string }>('/local-usi/start', {
    exePath: trimmed,
  });
  const sessionId = started.sessionId;
  let closed = false;
  let sendChain = Promise.resolve();

  const eventSource = new EventSource(
    `/local-usi/stream?sessionId=${encodeURIComponent(sessionId)}`
  );

  eventSource.onmessage = (event: MessageEvent<string>) => {
    if (closed) return;
    try {
      const parsed = JSON.parse(event.data) as { line?: string };
      if (typeof parsed.line === 'string') {
        onLine(parsed.line);
      }
    } catch {
      // Ignore malformed SSE payload
    }
  };

  eventSource.onerror = () => {
    if (!closed) {
      closed = true;
      eventSource.close();
      onError('Local USI engine stream disconnected');
    }
  };

  return {
    send: (command: string) => {
      if (closed || !command.trim()) return;
      sendChain = sendChain
        .then(() => postJson('/local-usi/send', { sessionId, command }).then(() => undefined))
        .catch((err) => {
          if (!closed) {
            onError(err instanceof Error ? err.message : String(err));
          }
        });
    },
    close: () => {
      if (closed) return;
      closed = true;
      eventSource.close();
      void fetch('/local-usi/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined);
    },
  };
}
