import { useMemo, useState } from 'react';
import { ALGORITHMS, CATEGORIES, Category } from '../algorithms';
import { useSettings } from '../state/SettingsContext';
import { navigate } from '../router';
import { fmtInt } from '../ui/controls';
import { IconArrowRight, IconSearch } from '../ui/icons';
import MiniPreview from '../ui/MiniPreview';

export default function AlgorithmsPage() {
  const { update, settings } = useSettings();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | Category>('all');
  const [stableOnly, setStableOnly] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ALGORITHMS.filter(
      (a) =>
        (cat === 'all' || a.category === cat) &&
        (!stableOnly || a.stable) &&
        (!t || a.name.toLowerCase().includes(t) || a.description.toLowerCase().includes(t) || (a.notes ?? '').toLowerCase().includes(t)),
    );
  }, [q, cat, stableOnly]);

  return (
    <div>
      <header className="fade-up">
        <div className="kicker">The library</div>
        <h1 className="mt-4 font-display text-[clamp(56px,6vw,96px)] font-semibold leading-[0.92] tracking-[-0.045em] text-white">
          {ALGORITHMS.length} algorithms.
          <br />
          <span className="text-ink-500">Every one verified.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-300">
          From bubble sort to GrailSort. Each implementation is tested on eleven input patterns, replayed operation by operation, and checked for the stability it claims. Hover a
          card to watch it sort.
        </p>
      </header>

      <div className="fade-up sticky top-[84px] z-30 mt-12" style={{ animationDelay: '0.15s' }}>
        <div className="glass flex items-center gap-4 rounded-2xl p-2 pl-5">
          <IconSearch className="text-ink-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, idea or author…"
            aria-label="Search algorithms"
            className="h-11 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-ink-500"
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-ink-300 hover:text-white">
            <input type="checkbox" checked={stableOnly} onChange={(e) => setStableOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#8b7bff]" />
            Stable only
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
          {(['all', ...CATEGORIES] as const).map((c) => {
            const count = c === 'all' ? ALGORITHMS.length : ALGORITHMS.filter((a) => a.category === c).length;
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setCat(c)}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition duration-300 ${
                  on ? 'border-white bg-white text-ink-950' : 'border-white/[0.08] bg-ink-950/60 text-ink-300 backdrop-blur hover:border-white/20 hover:text-white'
                }`}
              >
                {c === 'all' ? 'All' : c} <span className={on ? 'text-ink-500' : 'text-ink-500'}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 2xl:grid-cols-4">
        {list.map((a, i) => (
          <article
            key={a.id}
            onMouseEnter={() => setHover(a.id)}
            onMouseLeave={() => setHover((h) => (h === a.id ? null : h))}
            className={`group panel fade-up flex flex-col overflow-hidden transition duration-500 hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-[0_30px_80px_-30px_rgba(139,123,255,0.45)] ${
              a.id === settings.algorithmId ? 'border-accent/50' : ''
            }`}
            style={{ animationDelay: `${Math.min(i, 18) * 25}ms` }}
          >
            <div className="relative h-28 border-b border-white/[0.05]">
              <MiniPreview algorithmId={a.id} active={hover === a.id} slow={a.slow} />
              <span className="absolute left-4 top-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">{a.category}</span>
              {a.slow && <span className="absolute right-4 top-3 rounded-md bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">Very slow</span>}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-white">{a.name}</h2>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-400">{a.description}</p>
              <dl className="mt-5 grid grid-cols-4 gap-2 border-t border-white/[0.05] pt-4 text-[11px]">
                {[
                  ['Best', a.best],
                  ['Avg', a.average],
                  ['Worst', a.worst],
                  ['Space', a.space],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="truncate font-mono text-ink-100" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex items-center justify-between pt-5 text-[11.5px] text-ink-500">
                <span>
                  {a.stable ? 'Stable' : 'Unstable'} · {a.inPlace ? 'In-place' : 'Extra memory'} · ≤ {fmtInt(a.maxN)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    update({ algorithmId: a.id, ...(settings.n > a.maxN ? { n: a.maxN } : {}) });
                    navigate('visualizer');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white transition duration-300 group-hover:bg-white group-hover:text-ink-950"
                >
                  Visualize <IconArrowRight width={13} height={13} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {list.length === 0 && <p className="py-24 text-center text-ink-400">No algorithm matches “{q}”.</p>}
    </div>
  );
}
