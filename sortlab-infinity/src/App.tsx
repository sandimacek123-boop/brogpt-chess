import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './state/SettingsContext';
import { VisualizerController } from './engine/visualizer';
import { IconClose, IconMenu, IconMute, IconSound } from './ui/icons';
import VisualizerPage from './pages/VisualizerPage';
import { readRoute, Route, ROUTES } from './router';

const BattlePage = lazy(() => import('./pages/BattlePage'));
const AlgorithmsPage = lazy(() => import('./pages/AlgorithmsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b5cff]/70" aria-label="SortLab Infinity home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" x2="1">
            <stop offset="0" stopColor="#ff3b5c" />
            <stop offset=".35" stopColor="#ffd23b" />
            <stop offset=".65" stopColor="#3bffb0" />
            <stop offset="1" stopColor="#7b5cff" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="#0f0f16" stroke="rgba(255,255,255,.08)" />
        <g fill="url(#lg)">
          <rect x="5" y="22" width="3" height="5" rx="1" />
          <rect x="10" y="18" width="3" height="9" rx="1" />
          <rect x="15" y="14" width="3" height="13" rx="1" />
          <rect x="20" y="10" width="3" height="17" rx="1" />
          <rect x="25" y="5" width="3" height="22" rx="1" />
        </g>
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink-100">
        SortLab <span className="text-rainbow">Infinity</span>
      </span>
    </a>
  );
}

function SoundToggle() {
  const { settings, update, audio } = useSettings();
  return (
    <button
      type="button"
      onClick={() => {
        const next = !settings.soundEnabled;
        if (next) {
          audio.unlock();
          setTimeout(() => audio.tone(0.6, { ...settings, soundEnabled: true }, 0.15), 30);
        }
        update({ soundEnabled: next });
      }}
      aria-pressed={settings.soundEnabled}
      aria-label={settings.soundEnabled ? 'Mute sound' : 'Enable sound'}
      title={settings.soundEnabled ? 'Mute sound' : 'Enable sound'}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b5cff]/70 ${
        settings.soundEnabled ? 'border-[#7b5cff]/50 bg-[#7b5cff]/20 text-white' : 'border-white/10 bg-white/[0.03] text-ink-300 hover:text-ink-100'
      }`}
    >
      {settings.soundEnabled ? <IconSound /> : <IconMute />}
    </button>
  );
}

function Shell() {
  const { settings, audio } = useSettings();
  const [route, setRoute] = useState<Route>(readRoute);
  const [menu, setMenu] = useState(false);
  const ctrlRef = useRef<VisualizerController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new VisualizerController(settings, audio);

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      setMenu(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    ctrlRef.current!.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (route !== 'visualizer') ctrlRef.current!.pause();
  }, [route]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {ROUTES.map((r) => (
              <a
                key={r.id}
                href={r.id === 'visualizer' ? '#/' : `#/${r.id}`}
                aria-current={route === r.id ? 'page' : undefined}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b5cff]/70 ${
                  route === r.id ? 'bg-white/[0.08] text-white' : 'text-ink-300 hover:text-ink-100'
                }`}
              >
                {r.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <SoundToggle />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-ink-100 md:hidden"
              aria-label={menu ? 'Close menu' : 'Open menu'}
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              {menu ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </div>
        <div className="rainbow-line h-px w-full opacity-40" />
        {menu && (
          <nav aria-label="Mobile" className="fade-up border-b border-white/[0.06] bg-ink-950 px-4 pb-4 md:hidden">
            {ROUTES.map((r) => (
              <a
                key={r.id}
                href={r.id === 'visualizer' ? '#/' : `#/${r.id}`}
                aria-current={route === r.id ? 'page' : undefined}
                className={`block rounded-xl px-4 py-3.5 text-base font-medium ${route === r.id ? 'bg-white/[0.08] text-white' : 'text-ink-300'}`}
              >
                {r.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
        <Suspense fallback={<div className="py-24 text-center text-ink-400">Loading…</div>}>
          {route === 'visualizer' && <VisualizerPage controller={ctrlRef.current!} />}
          {route === 'battle' && <BattlePage />}
          {route === 'algorithms' && <AlgorithmsPage />}
          {route === 'settings' && <SettingsPage />}
        </Suspense>
      </main>
      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-ink-400">
        SortLab Infinity · every statistic is measured from a real run · computation runs in a Web Worker
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  );
}
