/** Converts a Uint8Array to a base64-encoded string. Uses chunked processing to avoid O(n²) string copies. */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    let chunk = "";
    for (let j = i; j < end; j++) {
      chunk += String.fromCharCode(bytes[j]);
    }
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
}

/** Converts a base64-encoded string to a Uint8Array. Uses chunked processing to avoid O(n²) string copies. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  const chunkSize = 4096;
  for (let i = 0; i < binary.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, binary.length);
    for (let j = i; j < end; j++) {
      bytes[j] = binary.charCodeAt(j);
    }
  }
  return bytes;
}
