import { useMemo, useState } from 'react';
import { ALGORITHMS, CATEGORIES, Category } from '../algorithms';
import { useSettings } from '../state/SettingsContext';
import { navigate } from '../router';
import { Button, fmtInt, Select } from '../ui/controls';

export default function AlgorithmsPage() {
  const { update, settings } = useSettings();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | Category>('all');
  const [stableOnly, setStableOnly] = useState(false);
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
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Algorithms</h1>
          <p className="mt-1 text-sm text-ink-400">
            {ALGORITHMS.length} implementations, every one verified by automated tests on 11 input patterns. Variants are labelled with what makes them different.
          </p>
        </div>
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_220px_auto] sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search algorithms…"
          aria-label="Search algorithms"
          className="h-11 rounded-xl border border-white/10 bg-ink-800 px-4 text-sm text-ink-100 outline-none placeholder:text-ink-400 focus:border-[#7b5cff]"
        />
        <Select
          ariaLabel="Category"
          value={cat}
          onChange={(v) => setCat(v as 'all' | Category)}
          options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: `${c} (${ALGORITHMS.filter((a) => a.category === c).length})` }))]}
        />
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={stableOnly} onChange={(e) => setStableOnly(e.target.checked)} className="h-4 w-4 accent-[#7b5cff]" />
          Stable only
        </label>
      </div>
      <div className="text-xs text-ink-400">{list.length} shown</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => (
          <article key={a.id} className={`card flex flex-col gap-3 p-4 ${a.id === settings.algorithmId ? 'ring-1 ring-[#7b5cff]/60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{a.category}</div>
                <h2 className="text-base font-semibold text-white">{a.name}</h2>
              </div>
              {a.slow && <span className="shrink-0 rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">Very slow</span>}
            </div>
            <p className="line-clamp-4 text-sm leading-relaxed text-ink-300">{a.description}</p>
            {a.notes && <p className="text-xs text-ink-400">{a.notes}</p>}
            <dl className="mt-auto grid grid-cols-4 gap-1 text-center text-[11px]">
              {[
                ['Best', a.best],
                ['Avg', a.average],
                ['Worst', a.worst],
                ['Space', a.space],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.03] px-1 py-1.5">
                  <dt className="text-ink-400">{k}</dt>
                  <dd className="truncate font-mono text-ink-100" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center justify-between gap-2 text-xs text-ink-400">
              <span>
                {a.stable ? 'Stable' : 'Unstable'} · {a.inPlace ? 'In-place' : 'Extra memory'} · max n {fmtInt(a.maxN)}
              </span>
              <Button
                variant="soft"
                className="h-9"
                onClick={() => {
                  update({ algorithmId: a.id, ...(settings.n > a.maxN ? { n: a.maxN } : {}) });
                  navigate('visualizer');
                }}
              >
                Visualize
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
