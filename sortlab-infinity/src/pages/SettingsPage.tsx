import { PATTERNS, PatternId } from '../core/patterns';
import { VISUAL_MODES, VisualMode } from '../render/modes';
import { COLOR_SCHEMES, ColorScheme, colorFor } from '../render/palette';
import { SCALES, ScaleId } from '../audio/scales';
import { useSettings } from '../state/SettingsContext';
import { OP_LIMITS, Settings } from '../state/settings';
import { Button, Card, ColorField, Field, fmtInt, fmtSpeed, logScale, Select, Slider, Toggle } from '../ui/controls';
import { algorithmGroups } from './VisualizerPage';

const VISUAL_KEYS: (keyof Settings)[] = [
  'mode',
  'colorScheme',
  'customFrom',
  'customTo',
  'background',
  'barWidth',
  'barSpacing',
  'glow',
  'smoothing',
  'showHighlights',
  'compareColor',
  'swapColor',
  'writeColor',
  'migraineIntensity',
  'motion',
  'reflection',
  'ambient',
  'grain',
  'autoHideUI',
];
const SORT_KEYS: (keyof Settings)[] = ['algorithmId', 'n', 'pattern', 'seed', 'lockSeed', 'speed', 'speedMode', 'opLimit', 'autoVerify'];
const AUDIO_KEYS: (keyof Settings)[] = ['soundEnabled', 'volume', 'waveform', 'scale', 'pitchMin', 'pitchMax', 'soundCompare', 'soundSwap', 'soundWrite'];

function Preview({ s }: { s: Settings }) {
  const stops = Array.from({ length: 48 }, (_, i) => colorFor(s.colorScheme, i / 47, s.customFrom, s.customTo));
  return (
    <div className="flex h-20 items-end gap-[2px] rounded-xl border border-white/10 p-3" style={{ background: s.background }} aria-hidden>
      {stops.map((c, i) => (
        <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${((i + 1) / 48) * 100}%`, background: c, opacity: 0.4 + 0.6 * s.barWidth }} />
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { settings: s, update, reset, audio } = useSettings();
  const preview = () => {
    audio.unlock();
    [0.1, 0.35, 0.6, 0.85].forEach((t, i) => setTimeout(() => audio.tone(t, { ...s, soundEnabled: true }, 0.18), 30 + i * 140));
  };
  return (
    <div className="flex flex-col gap-5">
      <header className="fade-up mb-8">
        <div className="kicker">Settings</div>
        <h1 className="mt-4 font-display text-[clamp(56px,6vw,96px)] font-semibold leading-[0.92] tracking-[-0.045em] text-white">
          Make it yours.
        </h1>
        <p className="mt-5 text-[15px] text-ink-400">Every change applies live and is saved in this browser.</p>
      </header>
      <div className="grid grid-cols-3 gap-5">
        <Card title="Visual" right={<Button onClick={() => reset(VISUAL_KEYS)}>Reset</Button>}>
          <div className="flex flex-col gap-4">
            <Preview s={s} />
            <Field label="Visualization shape">
              <Select ariaLabel="Visualization shape" value={s.mode} onChange={(v) => update({ mode: v as VisualMode })} options={VISUAL_MODES.map((m) => ({ value: m.id, label: m.name }))} />
            </Field>
            <Field label="Colour scheme">
              <Select ariaLabel="Colour scheme" value={s.colorScheme} onChange={(v) => update({ colorScheme: v as ColorScheme })} options={COLOR_SCHEMES.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            {s.colorScheme === 'custom' && (
              <div className="rounded-xl border border-white/10 p-3">
                <ColorField label="Gradient start" value={s.customFrom} onChange={(v) => update({ customFrom: v })} />
                <ColorField label="Gradient end" value={s.customTo} onChange={(v) => update({ customTo: v })} />
              </div>
            )}
            <ColorField label="Background" value={s.background} onChange={(v) => update({ background: v })} />
            <Field label="Bar width" right={`${Math.round(s.barWidth * 100)}%`}>
              <Slider ariaLabel="Bar width" min={10} max={100} value={Math.round(s.barWidth * 100)} onChange={(v) => update({ barWidth: v / 100 })} />
            </Field>
            <Field label="Bar spacing" right={`${s.barSpacing}px`} hint="Applied when bars are wide enough to keep a visible body.">
              <Slider ariaLabel="Bar spacing" min={0} max={6} step={0.5} value={s.barSpacing} onChange={(v) => update({ barSpacing: v })} />
            </Field>
            <Field label="Glow intensity" right={`${Math.round(s.glow * 100)}%`}>
              <Slider ariaLabel="Glow intensity" min={0} max={100} value={Math.round(s.glow * 100)} onChange={(v) => update({ glow: v / 100 })} />
            </Field>
            <Field label="Animation smoothing" right={s.smoothing === 0 ? 'Instant' : `${Math.round(s.smoothing * 100)}%`} hint="0 = instant transitions. Higher values interpolate bar heights and slide swapped bars.">
              <Slider ariaLabel="Animation smoothing" min={0} max={95} value={Math.round(s.smoothing * 100)} onChange={(v) => update({ smoothing: v / 100 })} />
            </Field>
            <Toggle checked={s.reflection} onChange={(v) => update({ reflection: v })} label="Floor reflection" description="Mirror bars on a glossy floor." />
            <Toggle checked={s.ambient} onChange={(v) => update({ ambient: v })} label="Ambient light" description="Soft coloured haze behind the visualization." />
            <Toggle checked={s.grain} onChange={(v) => update({ grain: v })} label="Film grain" description="Subtle cinematic texture over the stage." />
            <Toggle checked={s.autoHideUI} onChange={(v) => update({ autoHideUI: v })} label="Cinematic auto-hide" description="Fade the interface away while sorting; move the mouse to bring it back." />
            <Toggle checked={s.showHighlights} onChange={(v) => update({ showHighlights: v })} label="Highlight operations" description="Colour bars involved in comparisons, swaps and writes." />
            <div className="rounded-xl border border-white/10 p-3">
              <ColorField label="Comparison highlight" value={s.compareColor} onChange={(v) => update({ compareColor: v })} />
              <ColorField label="Swap highlight" value={s.swapColor} onChange={(v) => update({ swapColor: v })} />
              <ColorField label="Write highlight" value={s.writeColor} onChange={(v) => update({ writeColor: v })} />
            </div>
            <Field label="Migraine mode intensity" right={`${Math.round(s.migraineIntensity * 100)}%`} hint="Never flashes. Capped at 25% with reduced motion.">
              <Slider ariaLabel="Migraine intensity" min={0} max={100} value={Math.round(s.migraineIntensity * 100)} onChange={(v) => update({ migraineIntensity: v / 100 })} />
            </Field>
            <Field label="Motion">
              <Select
                ariaLabel="Motion preference"
                value={s.motion}
                onChange={(v) => update({ motion: v as Settings['motion'] })}
                options={[
                  { value: 'system', label: 'Follow system setting' },
                  { value: 'reduce', label: 'Reduce motion' },
                  { value: 'full', label: 'Full motion' },
                ]}
              />
            </Field>
          </div>
        </Card>

        <Card title="Sorting" right={<Button onClick={() => reset(SORT_KEYS)}>Reset</Button>}>
          <div className="flex flex-col gap-4">
            <Field label="Algorithm">
              <Select ariaLabel="Algorithm" value={s.algorithmId} onChange={(v) => update({ algorithmId: v })} groups={algorithmGroups} />
            </Field>
            <Field label="Element count" right={fmtInt(s.n)}>
              <Slider ariaLabel="Element count" min={0} max={1000} value={Math.round(logScale.toSlider(s.n, 2, 16384) * 1000)} onChange={(t) => update({ n: Math.round(logScale.fromSlider(t / 1000, 2, 16384)) })} />
            </Field>
            <Field label="Sorting speed" right={fmtSpeed(s.speed)}>
              <Slider ariaLabel="Sorting speed" min={0} max={1000} value={Math.round(logScale.toSlider(s.speed, 1, 500000) * 1000)} onChange={(t) => update({ speed: Math.round(logScale.fromSlider(t / 1000, 1, 500000) * 10) / 10 })} />
            </Field>
            <Field label="Starting pattern">
              <Select ariaLabel="Starting pattern" value={s.pattern} onChange={(v) => update({ pattern: v as PatternId })} options={PATTERNS.map((p) => ({ value: p.id, label: `${p.name} — ${p.description}` }))} />
            </Field>
            <Toggle checked={s.lockSeed} onChange={(v) => update({ lockSeed: v })} label="Fixed random seed" description="Use the same seed every time for reproducible arrays." />
            <Field label="Random seed">
              <input
                type="number"
                aria-label="Random seed"
                value={s.seed}
                disabled={!s.lockSeed}
                onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className="h-11 rounded-xl border border-white/10 bg-ink-800 px-3 text-sm text-ink-100 outline-none focus:border-[#7b5cff] disabled:opacity-50"
              />
            </Field>
            <Field label="Operation limit" hint="Runs stop after this many counted operations; the partial run is still shown and clearly marked.">
              <Select ariaLabel="Operation limit" value={String(s.opLimit)} onChange={(v) => update({ opLimit: Number(v) })} options={OP_LIMITS.map((l) => ({ value: String(l), label: `${fmtInt(l)} operations` }))} />
            </Field>
            <Toggle checked={s.autoVerify} onChange={(v) => update({ autoVerify: v })} label="Verification sweep" description="After sorting, sweep the array checking every adjacent pair." />
          </div>
        </Card>

        <Card title="Audio" right={<Button onClick={() => reset(AUDIO_KEYS)}>Reset</Button>}>
          <div className="flex flex-col gap-4">
            <Toggle
              checked={s.soundEnabled}
              onChange={(v) => {
                if (v) audio.unlock();
                update({ soundEnabled: v });
              }}
              label="Enable sound"
              description="Audio starts only after you interact with the page."
            />
            <Field label="Volume" right={`${Math.round(s.volume * 100)}%`}>
              <Slider ariaLabel="Volume" min={0} max={100} value={Math.round(s.volume * 100)} onChange={(v) => update({ volume: v / 100 })} />
            </Field>
            <Field label="Waveform">
              <Select
                ariaLabel="Waveform"
                value={s.waveform}
                onChange={(v) => update({ waveform: v as OscillatorType })}
                options={[
                  { value: 'sine', label: 'Sine' },
                  { value: 'triangle', label: 'Triangle' },
                  { value: 'square', label: 'Square' },
                  { value: 'sawtooth', label: 'Sawtooth' },
                ]}
              />
            </Field>
            <Field label="Musical scale">
              <Select ariaLabel="Musical scale" value={s.scale} onChange={(v) => update({ scale: v as ScaleId })} options={SCALES.map((sc) => ({ value: sc.id, label: sc.name }))} />
            </Field>
            <Field label="Lowest pitch" right={`${s.pitchMin} Hz`}>
              <Slider ariaLabel="Lowest pitch" min={60} max={1000} step={10} value={s.pitchMin} onChange={(v) => update({ pitchMin: Math.min(v, s.pitchMax - 50) })} />
            </Field>
            <Field label="Highest pitch" right={`${s.pitchMax} Hz`}>
              <Slider ariaLabel="Highest pitch" min={200} max={4000} step={10} value={s.pitchMax} onChange={(v) => update({ pitchMax: Math.max(v, s.pitchMin + 50) })} />
            </Field>
            <Toggle checked={s.soundCompare} onChange={(v) => update({ soundCompare: v })} label="Sound on comparisons" />
            <Toggle checked={s.soundSwap} onChange={(v) => update({ soundSwap: v })} label="Sound on swaps" />
            <Toggle checked={s.soundWrite} onChange={(v) => update({ soundWrite: v })} label="Sound on writes" />
            <Button variant="soft" onClick={preview}>
              Preview sound
            </Button>
            <p className="text-xs text-ink-400">Notes are throttled (max ~90 per second, 12 voices) and run through a compressor to prevent distortion.</p>
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => reset()}>
          Reset all settings
        </Button>
      </div>
    </div>
  );
}
