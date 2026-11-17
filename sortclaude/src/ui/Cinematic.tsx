import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { player } from '../state/player';
import { getAlgorithm } from '../engine/registry';
import { Stage } from './Stage';
import { usePlayer } from './Visualizer';
import { fmt } from './components';
import { useSim } from '../state/simulation';

/**
 * Cinematic presentation: hides the UI, maximises the stage, adds title typography,
 * intro/outro fades, post effects (vignette, grain, grading, camera drift) and plays the sort.
 */
export function Cinematic() {
  const st = useApp((s) => s.settings);
  const setCinematic = useApp((s) => s.setCinematic);
  const sim = useSim();
  const snap = usePlayer();
  const algo = getAlgorithm(st.sorting.algorithm);
  const c = st.cinematic;
  const [phase, setPhase] = useState<'intro' | 'run' | 'outro'>('intro');
  const [fade, setFade] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = st.general.reducedMotion;

  useEffect(() => {
    ref.current?.requestFullscreen?.().catch(() => {});
    player.restart();
    const introMs = (reduced ? 0.3 : c.intro) * 1000;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / Math.max(1, introMs));
      setFade(1 - p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setPhase('run');
        player.play();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'run' && snap.done && snap.completion < 0) {
      setPhase('outro');
    }
  }, [phase, snap.done, snap.completion]);

  useEffect(() => {
    if (phase !== 'outro') return;
    const t = setTimeout(() => {}, c.outro * 1000);
    return () => clearTimeout(t);
  }, [phase, c.outro]);

  const tl = player.tl;
  const counters = tl?.getCounters();
  const anim = c.textAnimation === 'none' || reduced ? '' : c.textAnimation === 'tracking' ? 'anim-tracking' : 'anim-fade-up';
  const titleText = c.textAnimation === 'typewriter' && !reduced ? <Typewriter text={algo.name} /> : algo.name;

  return (
    <div className="cinema" ref={ref} data-testid="cinema">
      <Stage cinematic />
      {c.showTitle && (
        <div className="cinema-title">
          <h1 className={anim}>{titleText}</h1>
          <p className={anim} style={{ animationDelay: '0.25s' }}>{fmt(sim.info?.n ?? 0)} elements · {algo.average}</p>
        </div>
      )}
      {c.showCounters && counters && (
        <div className="cinema-counters">
          <div><span>ops</span>{fmt(counters.operations)}</div>
          <div><span>compares</span>{fmt(counters.comparisons)}</div>
          <div><span>writes</span>{fmt(counters.writes)}</div>
          <div><span>{phase === 'outro' ? 'sorted ✓' : 'progress'}</span>{phase === 'outro' ? '' : `${((snap.pos / Math.max(1, snap.total)) * 100).toFixed(0)}%`}</div>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fade, pointerEvents: 'none' }} />
      <div className="cinema-exit">
        <button className="btn" onClick={() => setCinematic(false)}>Exit cinematic (Esc)</button>
      </div>
    </div>
  );
}

function Typewriter({ text }: { text: string }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= text.length) return;
    const t = setTimeout(() => setK(k + 1), 55);
    return () => clearTimeout(t);
  }, [k, text]);
  return (
    <>
      {text.slice(0, k)}
      <span style={{ opacity: 0.5 }}>{k < text.length ? '▍' : ''}</span>
    </>
  );
}
