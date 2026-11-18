import React, { useState, type ReactNode } from 'react';
import { useApp } from '../state/store';
import { isAndroid, saveBlobAndroid } from '../platform';

// ------------------------------------------------------------------ icons (inline, original)
const P = (d: string) => <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
export const Icon = {
  play: <svg viewBox="0 0 24 24"><path d="M7 5.5v13l11-6.5z" fill="currentColor" /></svg>,
  pause: <svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" /><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" /></svg>,
  restart: <svg viewBox="0 0 24 24">{P('M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5')}</svg>,
  shuffle: <svg viewBox="0 0 24 24">{P('M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.5 0 2.5-1.4 3.4-3.2M14 9.2C14.8 7.8 15.6 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5')}</svg>,
  stepF: <svg viewBox="0 0 24 24"><path d="M6 6v12l8-6z" fill="currentColor" /><rect x="15.5" y="6" width="2.5" height="12" rx="1" fill="currentColor" /></svg>,
  stepB: <svg viewBox="0 0 24 24"><path d="M18 6v12l-8-6z" fill="currentColor" /><rect x="6" y="6" width="2.5" height="12" rx="1" fill="currentColor" /></svg>,
  toStart: <svg viewBox="0 0 24 24"><path d="M19 6v12l-7-6zM12 6v12l-7-6z" fill="currentColor" /></svg>,
  toEnd: <svg viewBox="0 0 24 24"><path d="M5 6v12l7-6zM12 6v12l7-6z" fill="currentColor" /></svg>,
  full: <svg viewBox="0 0 24 24">{P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}</svg>,
  sound: <svg viewBox="0 0 24 24">{P('M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11')}</svg>,
  mute: <svg viewBox="0 0 24 24">{P('M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5')}</svg>,
  sliders: <svg viewBox="0 0 24 24">{P('M5 6h14M5 12h14M5 18h14')}<circle cx="9" cy="6" r="2" fill="#0e0e17" stroke="currentColor" strokeWidth="1.8" /><circle cx="15" cy="12" r="2" fill="#0e0e17" stroke="currentColor" strokeWidth="1.8" /><circle cx="8" cy="18" r="2" fill="#0e0e17" stroke="currentColor" strokeWidth="1.8" /></svg>,
  video: <svg viewBox="0 0 24 24">{P('M4 7.5A1.5 1.5 0 0 1 5.5 6h9A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5zM16 10l4-2.5v9L16 14')}</svg>,
  film: <svg viewBox="0 0 24 24">{P('M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4')}</svg>,
  chevron: <svg viewBox="0 0 24 24">{P('M6 9l6 6 6-6')}</svg>,
  link: <svg viewBox="0 0 24 24">{P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')}</svg>,
  copy: <svg viewBox="0 0 24 24">{P('M9 9h10v10H9zM5 15V5h10')}</svg>,
  dice: <svg viewBox="0 0 24 24">{P('M5 5h14v14H5z')}<circle cx="9" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="15" r="1.3" fill="currentColor" /><circle cx="15" cy="9" r="1.3" fill="currentColor" /><circle cx="9" cy="15" r="1.3" fill="currentColor" /></svg>,
  save: <svg viewBox="0 0 24 24">{P('M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6')}</svg>,
  open: <svg viewBox="0 0 24 24">{P('M4 7V5h6l2 2h8v12H4zM4 10h16')}</svg>,
  trash: <svg viewBox="0 0 24 24">{P('M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13')}</svg>,
  plus: <svg viewBox="0 0 24 24">{P('M12 5v14M5 12h14')}</svg>,
  camera: <svg viewBox="0 0 24 24">{P('M4 8h3l2-3h6l2 3h3v11H4z')}<circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
  sparkle: <svg viewBox="0 0 24 24">{P('M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6')}</svg>,
  download: <svg viewBox="0 0 24 24">{P('M12 4v11M7 10l5 5 5-5M5 20h14')}</svg>,
  stop: <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>,
  loop: <svg viewBox="0 0 24 24">{P('M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4')}</svg>,
};

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38dfff" />
          <stop offset="0.55" stopColor="#a855f7" />
          <stop offset="1" stopColor="#f43fbd" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0e0e17" stroke="url(#bm)" strokeWidth="1.5" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={6.5 + i * 4} y={24 - (i + 1) * 3.4} width="2.6" height={(i + 1) * 3.4} rx="1.2" fill="url(#bm)" />
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ primitives
export function Section({ title, children, defaultOpen = true, id }: { title: string; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  const key = `sortclaude.section.${id ?? title}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  return (
    <div className={`section ${open ? '' : 'closed'}`}>
      <button
        className="section-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          try {
            localStorage.setItem(key, open ? '0' : '1');
          } catch {
            /* ignore */
          }
        }}
      >
        {title}
        {Icon.chevron}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format, hint, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string; disabled?: boolean }) {
  const p = ((value - min) / (max - min || 1)) * 100;
  const tooltips = useApp((s) => s.settings.general.tooltips);
  return (
    <div className="field" title={tooltips ? hint : undefined} style={disabled ? { opacity: 0.45 } : undefined}>
      <div className="field-row">
        <label>{label}</label>
        <span className="val">{format ? format(value) : Number(value.toFixed(3)).toString()}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ ['--p' as any]: `${Math.max(0, Math.min(100, p))}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const tooltips = useApp((s) => s.settings.general.tooltips);
  return (
    <div className="field-row" title={tooltips ? hint : undefined}>
      <label className="label">{label}</label>
      <button className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} />
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hint }: { label?: string; value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void; hint?: string }) {
  const groups = Array.from(new Set(options.map((o) => o.group).filter(Boolean))) as string[];
  const sel = (
    <select className="select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
      {groups.length
        ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {options.filter((o) => o.group === g).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))
        : options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
    </select>
  );
  if (!label) return sel;
  return (
    <div className="field" title={hint}>
      <label>{label}</label>
      {sel}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  const seg = (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!label) return seg;
  return (
    <div className="field">
      <label>{label}</label>
      {seg}
    </div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className="field-row">
      <label className="label">{label}</label>
      <div className="input-group" style={{ width: 150 }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} style={{ width: 34, height: 32, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent' }} />
        <input
          className="input mono"
          value={text}
          aria-label={`${label} hex`}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title} style={wide ? { width: 'min(900px, 94vw)' } : undefined}>
        <div className="field-row" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 17 }}>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Download a Blob; uses the desktop bridge when present. */
export async function saveBlob(blob: Blob, filename: string): Promise<string | null> {
  if (isAndroid()) return saveBlobAndroid(blob, filename);
  const bridge = (window as any).sortclaude;
  if (bridge?.saveFile) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const res = await bridge.saveFile(filename, buf);
    return res?.path ?? null;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
