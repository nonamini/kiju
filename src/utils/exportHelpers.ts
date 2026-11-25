/**
 * Browser-friendly Export Helpers for KIF files.
 * Provides clipboard copying and file downloading capabilities.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

/**
 * Copies KIF text string to the user's system clipboard.
 *
 * @param kifText Formatted KIF text
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function copyKifToClipboard(kifText: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(kifText);
    return true;
  } catch (error) {
    console.error('Failed to copy KIF to clipboard:', error);
    return false;
  }
}

/**
 * Triggers a browser file download of KIF text with UTF-8 encoding.
 *
 * @param kifText Formatted KIF text
 * @param filename Default filename (e.g. "repertoire_tree.kif")
 */
export function downloadKifFile(
  kifText: string,
  filename: string = 'repertoire_tree.kif'
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  try {
    const blob = new Blob([kifText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename.endsWith('.kif') ? filename : `${filename}.kif`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to download KIF file:', error);
    return false;
  }
}
