/**
 * Self-healing font registration.
 * Fonts are declared in CSS via @fontsource. Some Windows font stacks (observed under Wine) fail
 * the stylesheet @font-face load while the JS FontFace API works. After startup we check every
 * UI font and register any face that is not usable through FontFace — a no-op where CSS worked.
 */
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import grotesk500 from '@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2?url';
import grotesk600 from '@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2?url';
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import mono500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';

const FACES: { family: string; url: string; weight: string; check: string; range?: string }[] = [
  { family: 'Inter Variable', url: interLatin, weight: '100 900', check: '500 13px "Inter Variable"' },
  { family: 'Inter Variable', url: interLatinExt, weight: '100 900', check: '500 13px "Inter Variable"', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Space Grotesk', url: grotesk500, weight: '500', check: '500 16px "Space Grotesk"' },
  { family: 'Space Grotesk', url: grotesk600, weight: '600', check: '600 16px "Space Grotesk"' },
  { family: 'JetBrains Mono', url: mono400, weight: '400', check: '400 12px "JetBrains Mono"' },
  { family: 'JetBrains Mono', url: mono500, weight: '500', check: '500 12px "JetBrains Mono"' },
];

export async function ensureFonts(): Promise<number> {
  if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') return 0;
  // let the CSS-declared faces try first
  try {
    await Promise.all(FACES.map((f) => document.fonts.load(f.check, 'Ag')));
  } catch {
    /* fall through to the check */
  }
  let repaired = 0;
  for (const f of FACES) {
    const usable = [...document.fonts].some((ff) => ff.family.replace(/"/g, '') === f.family && ff.weight === f.weight && ff.status === 'loaded');
    if (usable) continue;
    try {
      const face = new FontFace(f.family, `url(${new URL(f.url, document.baseURI).href}) format("woff2")`, { weight: f.weight, style: 'normal', display: 'swap', ...(f.range ? { unicodeRange: f.range } : {}) });
      await face.load();
      document.fonts.add(face);
      repaired++;
    } catch {
      /* the system fallback font stays in use */
    }
  }
  return repaired;
}
