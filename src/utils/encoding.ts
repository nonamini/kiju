/**
 * Encoding utility for detecting and decoding KIF files.
 * Supports UTF-8 and Shift-JIS (CP932) using standard TextDecoder.
 */

export interface DecodedKif {
  text: string;
  encoding: 'utf-8' | 'shift-jis';
}

/**
 * Automatically detects UTF-8 vs Shift-JIS and decodes the buffer.
 *
 * @param buffer ArrayBuffer or Uint8Array representing the raw file bytes
 * @returns Decoded text and the detected encoding
 */
export function decodeKifBuffer(buffer: ArrayBuffer | Uint8Array): DecodedKif {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  try {
    // Attempt strict UTF-8 decoding. Throws on invalid byte sequences.
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    // Fall back to Shift-JIS for legacy Shogi KIF files.
    const sjisDecoder = new TextDecoder('shift-jis');
    const text = sjisDecoder.decode(bytes);
    return { text, encoding: 'shift-jis' };
  }
}
