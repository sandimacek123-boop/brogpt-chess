import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { App } from './ui/App';
import { applyUrlConfig } from './state/share';

applyUrlConfig();

// Read-only handle used by automated tests and power users (no privileged APIs).
import('./state/player').then(({ player }) => import('./state/simulation').then(({ useSim }) => {
  (window as any).__SORTCLAUDE__ = {
    get pos() { return player.tl?.pos ?? 0; },
    get total() { return player.tl?.total ?? 0; },
    get done() { return player.tl?.done ?? false; },
    keysAt: () => (player.tl ? Array.from(player.tl.ids, (id) => player.tl!.keys[id]) : []),
    initialKeys: () => Array.from(useSim.getState().initialKeys ?? []),
    counters: () => player.tl?.getCounters() ?? null,
  };
}));
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
