// Copies the single-threaded Stockfish 17.1 "lite" WASM build into public/engine so it
// can be loaded as a classic Web Worker (no SharedArrayBuffer / COOP+COEP needed).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'src');
const out = join(root, 'public', 'engine');
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => /^stockfish-17\.1-lite-single-[0-9a-f]+\.(js|wasm)$/.test(f));
if (files.length !== 2) throw new Error(`Expected the lite single-threaded engine (.js + .wasm), found: ${files.join(', ')}`);
for (const f of files) {
  // keep the original base name so the loader finds its .wasm next to it
  const target = f.endsWith('.js') ? 'stockfish.js' : 'stockfish.wasm';
  copyFileSync(join(src, f), join(out, target));
}
console.log('engine copied:', files.join(', '));
