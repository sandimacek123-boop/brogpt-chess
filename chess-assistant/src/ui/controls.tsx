import { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const v = {
    primary: 'bg-white text-ink-950 hover:bg-white/90 shadow-[0_0_30px_-6px_rgba(139,123,255,0.6)]',
    ghost: 'border border-white/[0.08] bg-white/[0.03] text-ink-100 hover:bg-white/[0.07] hover:border-white/[0.16]',
    soft: 'border border-accent/30 bg-accent/[0.14] text-[#d4ccff] hover:bg-accent/25',
    danger: 'border border-[#eb5757]/30 bg-[#eb5757]/10 text-[#ffb3b3] hover:bg-[#eb5757]/20',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-medium transition duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-[3px]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-lg px-3 text-[12px] font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
            o.value === value ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-[12.5px] text-ink-200 focus-visible:outline-none"
    >
      <span className={`relative h-[22px] w-10 rounded-full transition ${checked ? 'bg-accent shadow-[0_0_16px_rgba(139,123,255,0.55)]' : 'bg-white/10'}`}>
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[21px]' : 'left-[3px]'}`} />
      </span>
      {label}
    </button>
  );
}

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="kicker">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
