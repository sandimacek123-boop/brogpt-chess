import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './state/SettingsContext';
import { VisualizerController } from './engine/visualizer';
import { IconMute, IconSound } from './ui/icons';
import VisualizerPage from './pages/VisualizerPage';
import { readRoute, Route, ROUTES } from './router';
import { prefersReducedMotion } from './state/settings';

const BattlePage = lazy(() => import('./pages/BattlePage'));
const AlgorithmsPage = lazy(() => import('./pages/AlgorithmsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const LABELS: Record<Route, string> = { visualizer: 'Visualizer', battle: 'Battle', algorithms: 'Library', settings: 'Settings' };

function Logo() {
  return (
    <a href="#/" className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70" aria-label="SortLab Infinity home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden className="transition duration-500 group-hover:drop-shadow-[0_0_10px_rgba(139,123,255,0.8)]">
        <defs>
          <linearGradient id="lg" x1="0" x2="1">
            <stop offset="0" stopColor="#ff3b5c" />
            <stop offset=".35" stopColor="#ffd23b" />
            <stop offset=".65" stopColor="#3bffb0" />
            <stop offset="1" stopColor="#7b5cff" />
          </linearGradient>
        </defs>
        <g fill="url(#lg)">
          <rect x="3" y="22" width="3.4" height="7" rx="1.2" />
          <rect x="8.6" y="17" width="3.4" height="12" rx="1.2" />
          <rect x="14.2" y="12" width="3.4" height="17" rx="1.2" />
          <rect x="19.8" y="7" width="3.4" height="22" rx="1.2" />
          <rect x="25.4" y="2" width="3.4" height="27" rx="1.2" />
        </g>
      </svg>
      <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-white">
        SortLab <span className="font-normal text-ink-300">Infinity</span>
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
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        settings.soundEnabled
          ? 'border-accent/50 bg-accent/20 text-white shadow-[0_0_24px_-6px_rgba(139,123,255,0.8)]'
          : 'border-white/[0.08] bg-white/[0.03] text-ink-300 hover:text-white'
      }`}
    >
      {settings.soundEnabled ? <IconSound width={15} height={15} /> : <IconMute width={15} height={15} />}
      {settings.soundEnabled ? 'Sound on' : 'Sound off'}
    </button>
  );
}

function Nav({ route }: { route: Route }) {
  return (
    <header className="ui-layer slide-down pointer-events-none fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-[76px] max-w-[1800px] items-center justify-between px-10">
        <div className="pointer-events-auto">
          <Logo />
        </div>
        <nav aria-label="Main" className="glass pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full p-1">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={r.id === 'visualizer' ? '#/' : `#/${r.id}`}
              aria-current={route === r.id ? 'page' : undefined}
              className={`relative rounded-full px-5 py-2 text-[13px] font-medium transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                route === r.id ? 'bg-white text-ink-950 shadow-[0_0_24px_-6px_rgba(255,255,255,0.6)]' : 'text-ink-300 hover:text-white'
              }`}
            >
              {LABELS[r.id]}
            </a>
          ))}
        </nav>
        <div className="pointer-events-auto flex items-center gap-2">
          <SoundToggle />
        </div>
      </div>
    </header>
  );
}

/** Cinematic title sequence, shown once per browser session. */
function Intro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2100);
    const t2 = setTimeout(onDone, 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);
  const letters = 'SORTLAB'.split('');
  return (
    <div
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-ink-950 transition-opacity duration-[800ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
      onClick={() => {
        setLeaving(true);
        setTimeout(onDone, 500);
      }}
      role="presentation"
    >
      <div className="flex font-display text-[clamp(64px,9vw,148px)] font-semibold leading-none tracking-[-0.01em] text-white">
        {letters.map((c, i) => (
          <span key={i} className="title-swap inline-block" style={{ animationDelay: `${120 + i * 70}ms` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="mt-6 h-px w-[min(560px,60vw)] origin-left rainbow-line" style={{ animation: 'sweep 1.1s cubic-bezier(.22,1,.36,1) 0.65s both' }} />
      <div className="fade-up mt-6 font-display text-[13px] font-medium uppercase tracking-[0.6em] text-ink-300" style={{ animationDelay: '0.95s' }}>
        Infinity
      </div>
      <div className="fade-up absolute bottom-10 text-[11px] tracking-[0.3em] text-ink-500 uppercase" style={{ animationDelay: '1.3s' }}>
        103 algorithms · 20 visualizations
      </div>
    </div>
  );
}

/** SortLab is designed for large screens; small viewports get a polished notice. */
function DesktopGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink-950 px-8 text-center">
      <svg width="54" height="54" viewBox="0 0 32 32" aria-hidden className="mb-8">
        <defs>
          <linearGradient id="lg2" x1="0" x2="1">
            <stop offset="0" stopColor="#ff3b5c" />
            <stop offset=".35" stopColor="#ffd23b" />
            <stop offset=".65" stopColor="#3bffb0" />
            <stop offset="1" stopColor="#7b5cff" />
          </linearGradient>
        </defs>
        <g fill="url(#lg2)">
          <rect x="3" y="22" width="3.4" height="7" rx="1.2" />
          <rect x="8.6" y="17" width="3.4" height="12" rx="1.2" />
          <rect x="14.2" y="12" width="3.4" height="17" rx="1.2" />
          <rect x="19.8" y="7" width="3.4" height="22" rx="1.2" />
          <rect x="25.4" y="2" width="3.4" height="27" rx="1.2" />
        </g>
      </svg>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Made for the big screen</h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-300">
        SortLab Infinity is a desktop experience. Open it on a computer with a window at least 1024 px wide for the full cinematic stage.
      </p>
      <button type="button" onClick={onContinue} className="mt-8 text-[13px] text-ink-400 underline decoration-white/20 underline-offset-4 hover:text-white">
        Continue anyway
      </button>
    </div>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1024);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

function readFlag(key: string) {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function setFlag(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

function Shell() {
  const { settings, audio } = useSettings();
  const [route, setRoute] = useState<Route>(readRoute);
  const ctrlRef = useRef<VisualizerController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new VisualizerController(settings, audio);
  const narrow = useNarrow();
  const [gateDismissed, setGateDismissed] = useState(() => readFlag('sortlab:gate'));
  const [intro, setIntro] = useState(() => !readFlag('sortlab:intro') && !prefersReducedMotion(settings));

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    ctrlRef.current!.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (route !== 'visualizer') {
      ctrlRef.current!.pause();
      document.body.classList.remove('ui-hidden');
    }
  }, [route]);

  useEffect(() => {
    if (!intro) ctrlRef.current!.playIntro();
  }, [intro]);

  return (
    <div className="min-h-screen">
      {intro && (
        <Intro
          onDone={() => {
            setFlag('sortlab:intro');
            setIntro(false);
          }}
        />
      )}
      {narrow && !gateDismissed && (
        <DesktopGate
          onContinue={() => {
            setFlag('sortlab:gate');
            setGateDismissed(true);
          }}
        />
      )}
      <Nav route={route} />
      <Suspense fallback={<div className="py-48 text-center text-ink-400">Loading…</div>}>
        {route === 'visualizer' && <VisualizerPage controller={ctrlRef.current!} />}
        {route !== 'visualizer' && (
          <main className="mx-auto max-w-[1500px] px-10 pb-24 pt-32">
            {route === 'battle' && <BattlePage />}
            {route === 'algorithms' && <AlgorithmsPage />}
            {route === 'settings' && <SettingsPage />}
          </main>
        )}
      </Suspense>
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
