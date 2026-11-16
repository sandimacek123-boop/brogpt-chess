import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, Settings } from './settings';
import { SortAudio } from '../audio/audio';

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: (keys?: (keyof Settings)[]) => void;
  audio: SortAudio;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const audioRef = useRef<SortAudio | null>(null);
  if (!audioRef.current) audioRef.current = new SortAudio();

  useEffect(() => {
    const id = setTimeout(() => saveSettings(settings), 200);
    return () => clearTimeout(id);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback((keys?: (keyof Settings)[]) => {
    setSettings((s) => {
      if (!keys) return { ...DEFAULT_SETTINGS };
      const next = { ...s };
      for (const k of keys) (next as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, update, reset, audio: audioRef.current! }), [settings, update, reset]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings outside provider');
  return c;
}
