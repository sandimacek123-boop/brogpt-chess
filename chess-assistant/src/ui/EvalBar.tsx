import { formatScore, Score } from '../engine/uci';
import { winPercent } from '../chess/review';
import type { Orientation } from './Board';

/** Vertical evaluation bar; the white share grows from White's side of the board. */
export default function EvalBar({ score, orientation, result }: { score: Score | null; orientation: Orientation; result?: string | null }) {
  const white = result === '1-0' ? 100 : result === '0-1' ? 0 : result ? 50 : score ? winPercent(score) : 50;
  const label = result ?? (score ? formatScore(score) : '…');
  const whiteBottom = orientation === 'white';
  const whiteAhead = white >= 50;
  return (
    <div className="relative h-full w-7 overflow-hidden rounded-md bg-[#2a2838] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" aria-label={`Evaluation ${label}`} role="meter" aria-valuenow={Math.round(white)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="absolute inset-x-0 bg-[#f1eff8] transition-[height] duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ height: `${white}%`, [whiteBottom ? 'bottom' : 'top']: 0 }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-accent/60" />
      <div
        className={`absolute inset-x-0 text-center font-mono text-[9.5px] font-semibold ${whiteAhead ? 'text-ink-950' : 'text-white'}`}
        style={{ [whiteAhead === whiteBottom ? 'bottom' : 'top']: 6 }}
      >
        {label.replace('+', '').replace('−', '-')}
      </div>
    </div>
  );
}
