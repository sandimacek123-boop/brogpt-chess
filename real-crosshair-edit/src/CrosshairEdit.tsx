import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, Audio, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {FPS, HEIGHT, WIDTH, type EditProps} from './config';
import {assetsKey, getCachedAssets, loadAssets, type Assets} from './engine/assets';
import {createTargets, renderFrame, type FrameInfo, type RenderTargets} from './engine/render';
import {buildTimeline} from './engine/timeline';

/** 'assets/x.png' → staticFile, URLs pass through. */
export const resolveSrc = (src: string) => {
  if (/^(https?:|blob:|data:)/.test(src) || src.startsWith('/')) return src;
  return staticFile(src);
};

export type CrosshairEditProps = EditProps & {
  /** preview-only: cap motion-blur sub-frames for real-time playback */
  previewMaxSamples?: number;
  onFrameInfo?: (info: FrameInfo) => void;
};

export const CrosshairEdit: React.FC<CrosshairEditProps> = (props) => {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetsRef = useRef<RenderTargets | null>(null);
  const key = assetsKey(props);
  const [assets, setAssets] = useState<Assets | null>(() => getCachedAssets(key));
  // block the renderer until fonts + treated artwork exist and the frame is drawn
  const pending = useRef<number[]>([]);
  useState(() => {
    if (!getCachedAssets(key)) pending.current.push(delayRender('Preparing REAL artwork'));
    return null;
  });

  const {spinSpeed, shakeIntensity, audio} = props;
  const timeline = useMemo(
    () => buildTimeline({spinSpeed, shakeIntensity, audio}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spinSpeed, shakeIntensity, audio.enabled, audio.src, audio.beatSync, audio.startOffset, JSON.stringify(audio.beats)],
  );

  useLayoutEffect(() => {
    if (assets && assets.key === key) return;
    let cancelled = false;
    const handle = delayRender('Updating REAL artwork');
    pending.current.push(handle);
    loadAssets(props, resolveSrc)
      .then((a) => {
        if (!cancelled) setAssets(a);
        else continueRender(handle);
      })
      .catch((err) => cancelRender(err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets || assets.key !== key) return;
    if (!targetsRef.current) targetsRef.current = createTargets();
    const info = renderFrame(canvas, frame, props, assets, timeline, targetsRef.current, {
      maxSamples: props.previewMaxSamples,
    });
    props.onFrameInfo?.(info);
    const handles = pending.current.splice(0);
    for (const h of handles) continueRender(h);
  });

  const audioOn = Boolean(audio.enabled && audio.src);

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{width: '100%', height: '100%'}} />
      {audioOn ? (
        <Audio
          src={resolveSrc(audio.src as string)}
          trimBefore={Math.max(0, Math.round((audio.startOffset ?? 0) * FPS))}
          volume={audio.volume ?? 1}
        />
      ) : null}
    </AbsoluteFill>
  );
};
