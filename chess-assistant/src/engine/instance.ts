import { Engine } from './engine';

/** One shared engine for the whole app (each page stops its searches when it unmounts). */
export const engine = new Engine(new URL('engine/stockfish.js', document.baseURI).href);
