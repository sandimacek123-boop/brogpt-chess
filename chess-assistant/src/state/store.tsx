import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { setSoundEnabled } from '../sound';

export type Route = 'analyze' | 'play' | 'review';
export const ROUTES: { id: Route; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'review', label: 'Review' },
];

export function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === h)?.id ?? 'play') as Route;
}
export function navigate(r: Route) {
  window.location.hash = `/${r}`;
}

interface Store {
  /** PGN handed to the Review page by Play / Analyze. */
  reviewPgn: string | null;
  setReviewPgn: (p: string | null) => void;
  /** PGN or FEN handed to the Analyze page. */
  analyzeInput: { pgn?: string; fen?: string; ply?: number } | null;
  setAnalyzeInput: (x: { pgn?: string; fen?: string; ply?: number } | null) => void;
  sound: boolean;
  setSound: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
export { load };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [reviewPgn, setReviewPgn] = useState<string | null>(null);
  const [analyzeInput, setAnalyzeInput] = useState<Store['analyzeInput']>(null);
  const [sound, setSound] = useState<boolean>(() => load('brogpt-chess:sound', true));
  useEffect(() => {
    setSoundEnabled(sound);
    save('brogpt-chess:sound', sound);
  }, [sound]);
  return <Ctx.Provider value={{ reviewPgn, setReviewPgn, analyzeInput, setAnalyzeInput, sound, setSound }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
