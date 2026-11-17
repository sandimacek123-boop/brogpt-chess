import { createElement, useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Chess, Square } from 'chess.js';

export type Orientation = 'white' | 'black';
export type Arrow = { from: string; to: string; brush: string; width?: number; label?: { text: string; fill: string } };

export const BRUSHES = {
  best: { key: 'best', color: '#4fd18b', opacity: 0.85, lineWidth: 11 },
  alt: { key: 'alt', color: '#7aa7ff', opacity: 0.6, lineWidth: 8 },
  alt2: { key: 'alt2', color: '#b49bff', opacity: 0.45, lineWidth: 6 },
  played: { key: 'played', color: '#f2994a', opacity: 0.8, lineWidth: 10 },
  bad: { key: 'bad', color: '#eb5757', opacity: 0.8, lineWidth: 10 },
  hint: { key: 'hint', color: '#ffd23b', opacity: 0.85, lineWidth: 11 },
};

/** Legal destinations for chessground from a chess.js position. */
export function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? [];
    list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

interface Props {
  fen: string;
  orientation: Orientation;
  /** Which colour may move pieces ('none' = view only). */
  movable: 'white' | 'black' | 'both' | 'none';
  lastMove?: [string, string] | null;
  arrows?: Arrow[];
  onMove?: (uci: string) => void;
}

/**
 * Lichess's chessground board, driven by chess.js for legality. Promotions open a
 * small piece picker on the promotion square.
 */
export default function Board({ fen, orientation, movable, lastMove, arrows = [], onMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [promo, setPromo] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null);

  const chess = new Chess(fen);
  const turn: Orientation = chess.turn() === 'w' ? 'white' : 'black';
  const canMove = movable !== 'none' && (movable === 'both' || movable === turn) && !chess.isGameOver();

  const config = (): Config => ({
    fen,
    orientation,
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    lastMove: lastMove ? (lastMove as Key[]) : undefined,
    coordinates: true,
    viewOnly: false,
    animation: { enabled: true, duration: 180 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false,
      color: canMove ? turn : undefined,
      dests: canMove ? legalDests(chess) : new Map(),
      showDests: true,
      events: {
        after: (orig, dest) => {
          const c = new Chess(fen);
          const piece = c.get(orig as Square);
          const lastRank = dest[1] === '8' || dest[1] === '1';
          if (piece?.type === 'p' && lastRank) {
            setPromo({ from: orig, to: dest, color: piece.color });
            return;
          }
          onMoveRef.current?.(orig + dest);
        },
      },
    },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: {
      enabled: true,
      visible: true,
      autoShapes: arrows.map(
        (a): DrawShape =>
          a.from === a.to
            ? { orig: a.from as Key, brush: a.brush, label: a.label }
            : { orig: a.from as Key, dest: a.to as Key, brush: a.brush, modifiers: a.width ? { lineWidth: a.width } : undefined, label: a.label },
      ),
      brushes: { ...BRUSHES } as never,
    },
  });

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, config());
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set(config());
    // arrows need an explicit redraw
    api.current?.setAutoShapes(config().drawable!.autoShapes!);
  });

  const files = 'abcdefgh';
  let promoStyle: Record<string, string | number> = {};
  if (promo) {
    const f = files.indexOf(promo.to[0]);
    const col = orientation === 'white' ? f : 7 - f;
    const top = (promo.color === 'w') === (orientation === 'white');
    promoStyle = { left: `${col * 12.5}%`, [top ? 'top' : 'bottom']: 0 };
  }

  return (
    <div className="board-shell relative aspect-square w-full">
      <div ref={el} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {promo && (
        <div
          className="absolute inset-0 z-20 bg-black/45 backdrop-blur-[1px]"
          onClick={() => {
            setPromo(null);
            api.current?.set(config());
          }}
          role="presentation"
        >
          <div className="cg-wrap promo-wrap absolute flex w-[12.5%] flex-col overflow-hidden rounded-lg bg-[#16151f] shadow-2xl" style={promoStyle} role="listbox" aria-label="Promote to">
            {(['q', 'n', 'r', 'b'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={false}
                aria-label={{ q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[p]}
                onClick={(e) => {
                  e.stopPropagation();
                  const m = promo;
                  setPromo(null);
                  onMoveRef.current?.(m.from + m.to + p);
                }}
                className="cg-promo aspect-square w-full transition hover:bg-white/15"
              >
                {createElement('piece', { className: `${{ q: 'queen', n: 'knight', r: 'rook', b: 'bishop' }[p]} ${promo.color === 'w' ? 'white' : 'black'}` })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

