/** Runtime platform detection shared by web, Electron and Android (Capacitor). */
export const isDesktop = (): boolean => !!(window as any).sortclaude?.isDesktop;
export const isAndroid = (): boolean => {
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android';
};

/**
 * Android: a WebView cannot "download". Files are written to the app cache in chunks (large
 * videos never become one giant string) and handed to the Android share sheet, from where the
 * user can save to Files/Gallery/Drive or post directly.
 */
export async function saveBlobAndroid(blob: Blob, filename: string): Promise<string | null> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const path = `exports/${filename}`;
  const CHUNK = 3 * 512 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const b64 = (u8: Uint8Array) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  await Filesystem.writeFile({ path, directory: Directory.Cache, data: b64(bytes.subarray(0, CHUNK)), recursive: true });
  for (let off = CHUNK; off < bytes.length; off += CHUNK) {
    await Filesystem.appendFile({ path, directory: Directory.Cache, data: b64(bytes.subarray(off, off + CHUNK)) });
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or share' });
  } catch (e) {
    // user dismissed the sheet: the file still exists in the app cache
    if (!/cancel/i.test(String((e as Error).message))) throw e;
  }
  return filename;
}
