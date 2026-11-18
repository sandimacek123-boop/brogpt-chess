import { Suspense, lazy, useEffect } from 'react';
import { useApp } from '../state/store';
import { player } from '../state/player';
import { SPEED_PRESETS } from '../state/player';
import { BrandMark, Icon } from './components';
import { Visualizer, toggleSound, shuffleNewSeed } from './Visualizer';
import { Cinematic } from './Cinematic';
import type { Page } from '../state/settings';
import { buildShareUrl } from '../state/share';

const Battle = lazy(() => import('./Battle').then((m) => ({ default: m.Battle })));
const Lab = lazy(() => import('./Lab').then((m) => ({ default: m.Lab })));
const Studio = lazy(() => import('./Studio').then((m) => ({ default: m.Studio })));
const Benchmark = lazy(() => import('./Benchmark').then((m) => ({ default: m.Benchmark })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));

const TABS: { id: Page; label: string }[] = [
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'battle', label: 'Battle' },
  { id: 'lab', label: 'Algorithm Lab' },
  { id: 'studio', label: 'Cinematic Studio' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'settings', label: 'Settings' },
];

import { isDesktop, isAndroid } from '../platform';
export { isDesktop };

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor');
}

function matches(e: KeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  if (binding === 'Space') return e.code === 'Space';
  if (binding === '+') return e.key === '+' || e.key === '=';
  return e.key.toLowerCase() === binding.toLowerCase();
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useApp.getState();
      const sc = st.settings.shortcuts;
      const onViz = st.page === 'visualizer' || st.cinematic;
      const act = (name: string) => matches(e, sc[name]);
      if (act('escape')) {
        if (st.cinematic) st.setCinematic(false);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
      if (act('battle')) return st.setPage('battle');
      if (act('mute')) return void toggleSound();
      if (!onViz) return;
      if (act('playPause')) {
        e.preventDefault();
        player.toggle();
      } else if (act('restart')) player.restart();
      else if (act('shuffle')) shuffleNewSeed();
      else if (act('fullscreen')) window.dispatchEvent(new Event('sortclaude:fullscreen'));
      else if (act('stepBack')) {
        e.preventDefault();
        player.stepBackward(e.shiftKey ? 10 : 1);
      } else if (act('stepForward')) {
        e.preventDefault();
        player.stepForward(e.shiftKey ? 10 : 1);
      } else if (act('speedUp') || act('speedDown')) {
        const cur = st.settings.sorting.speed;
        const idx = SPEED_PRESETS.findIndex((p) => p.value >= cur);
        const next = SPEED_PRESETS[Math.max(0, Math.min(SPEED_PRESETS.length - 1, (idx < 0 ? 3 : idx) + (act('speedUp') ? 1 : -1)))];
        st.update('sorting', { speed: next.value, useCustomRate: false });
        st.toast(`Speed ${next.label}`);
      } else if (act('cinematic')) st.setCinematic(!st.cinematic);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const cinematic = useApp((s) => s.cinematic);
  const uiScale = useApp((s) => s.settings.general.uiScale);
  const sidebarWidth = useApp((s) => s.settings.general.sidebarWidth);
  const reduced = useApp((s) => s.settings.general.reducedMotion);
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const toast = useApp((s) => s.toast);
  useShortcuts();

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar', `${sidebarWidth}px`);
    (document.body.style as any).zoom = String(uiScale);
    document.body.classList.toggle('reduced-motion', reduced);
    document.body.classList.toggle('native-android', isAndroid());
  }, [uiScale, sidebarWidth, reduced]);

  useEffect(() => {
    const onHash = () => {
      const m = location.hash.match(/^#\/(\w+)/);
      if (m && TABS.some((t) => t.id === m[1]) && m[1] !== useApp.getState().page) useApp.setState({ page: m[1] as Page });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          <BrandMark />
          SortClaude <span className="ver">5.5</span>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={page === t.id} className={`tab ${page === t.id ? 'active' : ''}`} onClick={() => setPage(t.id)} data-tab={t.id}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="nav-spacer" />
        <div className="nav-actions">
          {!isDesktop() && !isAndroid() && (
            <button
              className="btn ghost"
              title="Copy a shareable link to this configuration"
              onClick={() => {
                const url = buildShareUrl();
                navigator.clipboard?.writeText(url).then(() => toast('Share link copied.', 'success'), () => toast(url, 'info'));
              }}
            >
              {Icon.link}Share
            </button>
          )}
        </div>
      </nav>
      <main className="page" key={page}>
        <Suspense fallback={<div className="empty"><span className="spinner" /></div>}>
          {page === 'visualizer' && <Visualizer />}
          {page === 'battle' && <Battle />}
          {page === 'lab' && <Lab />}
          {page === 'studio' && <Studio />}
          {page === 'benchmark' && <Benchmark />}
          {page === 'settings' && <SettingsPage />}
        </Suspense>
      </main>
      {cinematic && <Cinematic />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
