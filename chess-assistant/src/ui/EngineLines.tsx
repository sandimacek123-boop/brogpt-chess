import { formatScore, PvLine } from '../engine/uci';
import { numberedLine, pvToSan } from '../chess/san';

export default function EngineLines({ fen, lines, onPlay }: { fen: string; lines: PvLine[]; onPlay?: (uci: string) => void }) {
  if (lines.length === 0) return <p className="py-2 text-[13px] text-ink-400">Thinking…</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l) => {
        const sans = pvToSan(fen, l.pv, 10);
        const positive = l.score.type === 'mate' ? l.score.value > 0 : l.score.value >= 0;
        return (
          <button
            key={l.multipv}
            type="button"
            onClick={() => onPlay?.(l.pv[0])}
            title="Play the first move of this line"
            className="flex items-start gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
          >
            <span
              className={`mt-px w-[58px] shrink-0 rounded-md py-0.5 text-center font-mono text-[12px] font-semibold ${
                positive ? 'bg-[#efedf7] text-ink-950' : 'bg-[#26243a] text-white'
              }`}
            >
              {formatScore(l.score)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] leading-6 text-ink-200">{numberedLine(fen, sans)}</span>
          </button>
        );
      })}
    </div>
  );
}
