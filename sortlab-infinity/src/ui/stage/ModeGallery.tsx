import { VISUAL_MODES, VisualMode } from '../../render/modes';
import { modeThumb } from './thumbs';

export default function ModeGallery({ current, onPick }: { current: VisualMode; onPick: (m: VisualMode) => void }) {
  return (
    <div className="grid w-[860px] grid-cols-5 gap-2.5 p-3" role="listbox" aria-label="Visualization modes">
      {VISUAL_MODES.map((m, i) => (
        <button
          key={m.id}
          type="button"
          role="option"
          aria-selected={m.id === current}
          title={m.description}
          onClick={() => onPick(m.id)}
          className={`group relative overflow-hidden rounded-xl border text-left transition duration-300 ${
            m.id === current ? 'border-white/70 shadow-[0_0_30px_-8px_rgba(255,255,255,0.6)]' : 'border-white/[0.07] hover:border-white/25'
          }`}
        >
          <img src={modeThumb(m.id)} alt="" className="block aspect-[300/168] w-full transition duration-500 group-hover:scale-[1.04]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-2.5 pb-2 pt-6">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[9.5px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate text-[12px] font-medium text-white">{m.name}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
