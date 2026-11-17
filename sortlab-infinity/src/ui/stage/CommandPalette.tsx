import { useEffect, useMemo, useRef, useState } from 'react';
import { ALGORITHMS, CATEGORIES } from '../../algorithms';
import { IconSearch } from '../icons';

/** ⌘K-style searchable algorithm picker with keyboard navigation and a detail pane. */
export default function CommandPalette({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const scored = ALGORITHMS.map((a) => {
      const name = a.name.toLowerCase();
      let score = 0;
      if (!t) score = 1;
      else if (name.startsWith(t)) score = 4;
      else if (name.split(/[\s—–-]+/).some((w) => w.startsWith(t))) score = 3;
      else if (name.includes(t)) score = 2;
      else if (a.category.toLowerCase().includes(t) || a.description.toLowerCase().includes(t)) score = 1;
      return { a, score };
    }).filter((x) => x.score > 0);
    if (t) scored.sort((x, y) => y.score - x.score);
    else scored.sort((x, y) => CATEGORIES.indexOf(x.a.category) - CATEGORIES.indexOf(y.a.category));
    return scored.map((x) => x.a);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
    const i = results.findIndex((a) => a.id === current);
    if (i >= 0) setSel(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const active = results[Math.min(sel, results.length - 1)];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose} role="presentation">
      <div
        className="glass-strong pop-in flex h-[min(620px,72vh)] w-[min(980px,92vw)] overflow-hidden rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose an algorithm"
      >
        <div className="flex min-w-0 flex-1 flex-col border-r border-white/[0.06]">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-5">
            <IconSearch className="text-ink-400" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSel((s) => Math.min(results.length - 1, s + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSel((s) => Math.max(0, s - 1));
                } else if (e.key === 'Enter' && active) onPick(active.id);
                else if (e.key === 'Escape') onClose();
              }}
              placeholder="Search 103 algorithms…"
              aria-label="Search algorithms"
              className="h-16 flex-1 bg-transparent font-display text-[19px] tracking-tight text-white outline-none placeholder:text-ink-500"
            />
            <kbd>esc</kbd>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto p-2" role="listbox" aria-label="Algorithms">
            {results.map((a, i) => {
              const showHeader = !q.trim() && (i === 0 || results[i - 1].category !== a.category);
              return (
                <div key={a.id}>
                  {showHeader && <div className="kicker px-3 pb-1.5 pt-4">{a.category}</div>}
                  <button
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={i === sel}
                    onMouseMove={() => setSel(i)}
                    onClick={() => onPick(a.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                      i === sel ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.id === current ? 'bg-accent shadow-[0_0_10px_#8b7bff]' : 'bg-transparent'}`} />
                    <span className={`flex-1 truncate text-[14px] ${i === sel ? 'text-white' : 'text-ink-200'}`}>{a.name}</span>
                    {a.slow && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">slow</span>}
                    <span className="w-28 shrink-0 text-right font-mono text-[11px] text-ink-400">{a.average}</span>
                  </button>
                </div>
              );
            })}
            {results.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-400">No algorithm matches “{q}”.</div>}
          </div>
          <div className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-3 text-[11px] text-ink-400">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>enter</kbd> select
            </span>
            <span className="ml-auto">{results.length} results</span>
          </div>
        </div>
        {active && (
          <aside className="hidden w-[340px] shrink-0 flex-col p-7 md:flex">
            <div className="kicker">{active.category}</div>
            <h3 key={active.id} className="title-swap mt-2 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
              {active.name}
            </h3>
            <p className="mt-4 line-clamp-[9] text-[13px] leading-relaxed text-ink-300">{active.description}</p>
            <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 pt-6 text-[12px]">
              {[
                ['Best', active.best],
                ['Average', active.average],
                ['Worst', active.worst],
                ['Space', active.space],
                ['Stable', active.stable ? 'Yes' : 'No'],
                ['Max n', active.maxN.toLocaleString('en-US')],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="truncate font-mono text-ink-100" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}
