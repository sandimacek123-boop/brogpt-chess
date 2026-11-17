import { ReactNode, useId } from 'react';

export function Field({ label, hint, children, right }: { label: string; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</span>
        {right && <span className="text-xs text-ink-300 tnum">{right}</span>}
      </div>
      {children}
      {hint && <div className="text-xs text-ink-400 leading-snug">{hint}</div>}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  groups,
  ariaLabel,
  className = '',
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options?: { value: T; label: string; disabled?: boolean }[];
  groups?: { label: string; options: { value: T; label: string; disabled?: boolean }[] }[];
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink-100 outline-none transition duration-300 hover:border-white/20 hover:bg-white/[0.05] focus-visible:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 ${className}`}
    >
      {options?.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {groups?.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const fill = ((value - min) / Math.max(1e-9, max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${Math.max(0, Math.min(100, fill))}%` }}
      className="disabled:opacity-40"
    />
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink-100">{label}</span>
        {description && <span className="block text-xs text-ink-400">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-[22px] w-10 rounded-full bg-white/10 transition duration-300 peer-checked:bg-accent peer-checked:shadow-[0_0_18px_rgba(139,123,255,0.55)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60" />
        <span className="pointer-events-none absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition duration-300 ease-[cubic-bezier(.22,1,.36,1)] peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  title,
  disabled,
  className = '',
  ariaLabel,
  ariaPressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  title?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
}) {
  const styles = {
    primary: 'bg-white text-ink-950 hover:bg-white/90 shadow-[0_0_30px_-4px_rgba(139,123,255,0.55)]',
    ghost: 'border border-white/[0.08] bg-white/[0.03] text-ink-100 hover:bg-white/[0.07] hover:border-white/[0.16]',
    soft: 'bg-accent/[0.14] text-[#cfc7ff] hover:bg-accent/25 border border-accent/30',
    danger: 'bg-[#ff2e63] text-white hover:bg-[#ff2e63]/90 shadow-[0_0_30px_-6px_rgba(255,46,99,0.7)]',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={ariaPressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-3.5 text-[13px] font-medium transition duration-300 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 text-[11.5px] font-semibold transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
            value === o.value ? 'bg-white text-ink-950 shadow-[0_0_20px_-4px_rgba(255,255,255,0.5)]' : 'text-ink-300 hover:text-ink-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-[13px] text-ink-100">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-ink-400 uppercase">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      </span>
    </label>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-0.5 truncate text-lg font-semibold text-ink-100 tnum">{value}</div>
      {sub && <div className="truncate text-[11px] text-ink-400 tnum">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`panel p-6 ${className}`}>
      {title && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function fmtInt(n: number) {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtMs(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtSpeed(opsPerSec: number) {
  if (opsPerSec >= 1e6) return `${(opsPerSec / 1e6).toFixed(1)}M ops/s`;
  if (opsPerSec >= 1e4) return `${(opsPerSec / 1e3).toFixed(0)}k ops/s`;
  if (opsPerSec >= 1000) return `${(opsPerSec / 1e3).toFixed(1)}k ops/s`;
  if (opsPerSec >= 10) return `${opsPerSec.toFixed(0)} ops/s`;
  return `${opsPerSec.toFixed(1)} ops/s`;
}

/** log-scale slider helpers */
export const logScale = {
  toSlider: (v: number, min: number, max: number) => (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)),
  fromSlider: (t: number, min: number, max: number) => Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min))),
};
