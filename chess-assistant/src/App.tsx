import { useEffect, useState } from 'react';
import { navigate, readRoute, Route, ROUTES, StoreProvider, useStore } from './state/store';
import PlayPage from './pages/PlayPage';
import AnalyzePage from './pages/AnalyzePage';
import ReviewPage from './pages/ReviewPage';
import { engine } from './engine/instance';

function Logo() {
  return (
    <button type="button" onClick={() => navigate('play')} className="flex items-center gap-3 focus-visible:outline-none" aria-label="BroGPT Chess home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#14131d" stroke="rgba(255,255,255,.08)" />
        <g fill="#e9e6ff">
          <rect x="7" y="7" width="6" height="6" rx="1" />
          <rect x="19" y="7" width="6" height="6" rx="1" />
          <rect x="13" y="13" width="6" height="6" rx="1" />
          <rect x="7" y="19" width="6" height="6" rx="1" />
          <rect x="19" y="19" width="6" height="6" rx="1" />
        </g>
        <circle cx="16" cy="16" r="2.4" fill="#8b7bff" />
      </svg>
      <span className="font-display text-[15px] font-semibold tracking-tight text-white">
        BroGPT <span className="font-normal text-ink-300">Chess</span>
      </span>
    </button>
  );
}

function EngineStatus() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    engine
      .init()
      .then(() => setState('ready'))
      .catch(() => setState('failed'));
  }, []);
  const color = state === 'ready' ? '#4fd18b' : state === 'failed' ? '#eb5757' : '#f2c94c';
  return (
    <span className="flex items-center gap-2 text-[12px] text-ink-400" title={engine.failed ?? undefined}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      {state === 'ready' ? engine.name : state === 'failed' ? 'Engine unavailable' : 'Loading engine…'}
    </span>
  );
}

function SoundToggle() {
  const { sound, setSound } = useStore();
  return (
    <button
      type="button"
      onClick={() => setSound(!sound)}
      aria-pressed={sound}
      className={`h-9 rounded-full border px-3.5 text-[12px] font-medium transition ${sound ? 'border-accent/50 bg-accent/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-ink-300 hover:text-white'}`}
    >
      {sound ? 'Sound on' : 'Sound off'}
    </button>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1024);
  const [gateOff, setGateOff] = useState(false);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    const rs = () => setNarrow(window.innerWidth < 1024);
    window.addEventListener('hashchange', on);
    window.addEventListener('resize', rs);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('resize', rs);
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-ink-950/70 backdrop-blur-xl">
        <div className="relative mx-auto flex h-16 max-w-[1500px] items-center justify-between px-8">
          <Logo />
          <nav aria-label="Main" className="glass absolute left-1/2 flex -translate-x-1/2 gap-1 rounded-full p-1">
            {ROUTES.map((r) => (
              <a
                key={r.id}
                href={`#/${r.id}`}
                aria-current={route === r.id ? 'page' : undefined}
                className={`rounded-full px-5 py-1.5 text-[13px] font-medium transition ${route === r.id ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white'}`}
              >
                {r.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <EngineStatus />
            <SoundToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-8 pb-10 pt-6">
        {route === 'play' && <PlayPage />}
        {route === 'analyze' && <AnalyzePage />}
        {route === 'review' && <ReviewPage />}
      </main>
      {narrow && !gateOff && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink-950 px-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Made for a computer</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-300">BroGPT Chess is a desktop app. Open it in a window at least 1024 px wide.</p>
          <button type="button" onClick={() => setGateOff(true)} className="mt-8 text-[13px] text-ink-400 underline underline-offset-4 hover:text-white">
            Continue anyway
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
