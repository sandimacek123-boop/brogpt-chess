import { Capacitor } from '@capacitor/core';

/** True when running inside the Android (Capacitor) app rather than a browser. */
export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.readAsDataURL(blob);
  });
}

/**
 * Android WebViews ignore <a download>, so in the app the video is written to the
 * app cache and handed to the system share sheet (save to Files, Photos, Drive, …).
 */
export async function saveAndShareNative(blob: Blob, name: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await blobToBase64(blob);
  const res = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
  await Share.share({ title: name, dialogTitle: 'Save or share your recording', files: [res.uri] });
}
