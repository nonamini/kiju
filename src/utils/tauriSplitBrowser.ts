/**
 * Bridge for Tauri v2 Multiwebview native browsing in the Split-Screen Study Reference Pane.
 * When running inside the Tauri desktop app, uses native child WebView commands so users
 * can browse arbitrary external sites (including YouTube channels) without iframe limits.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

export interface SplitBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TauriInternalsLike {
  invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

function getTauriInvoke():
  | (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>)
  | null {
  if (typeof window === 'undefined') return null;
  const internals = (
    window as unknown as { __TAURI_INTERNALS__?: TauriInternalsLike }
  ).__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function') {
    return internals.invoke;
  }
  return null;
}

export function isTauriSplitBrowserAvailable(): boolean {
  return getTauriInvoke() !== null;
}

export async function openTauriSplitBrowser(
  url: string,
  bounds: SplitBrowserBounds
): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('tauri_split_browser_open', {
      url,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  } catch (err) {
    console.warn('[TauriSplitBrowser] open failed:', err);
  }
}

export async function updateTauriSplitBrowserBounds(
  bounds: SplitBrowserBounds
): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('tauri_split_browser_bounds', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  } catch {
    // Ignore transient resize errors
  }
}

export async function hideTauriSplitBrowser(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('tauri_split_browser_hide');
  } catch {
    // Ignore hide errors when closing
  }
}

export async function closeTauriSplitBrowser(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('tauri_split_browser_close');
  } catch {
    // Ignore close errors
  }
}
