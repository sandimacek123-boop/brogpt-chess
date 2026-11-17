import React from 'react';
import {Composition} from 'remotion';
import {COMPOSITION_ID, DEFAULT_PROPS, DURATION_FRAMES, FPS, HEIGHT, WIDTH} from './config';
import {CrosshairEdit, type CrosshairEditProps} from './CrosshairEdit';
import {FACTS_COMPOSITION_ID} from './facts/content';
import {FACTS_FRAMES} from './facts/content';
import {INSANE_COMPOSITION_ID, INSANE_FRAMES} from './insane/timeline';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* the first 15 s edit (unchanged) */}
      <Composition
        id={COMPOSITION_ID}
        component={CrosshairEdit}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={DEFAULT_PROPS}
      />
      {/* the fact-file section: 15 s, joined after the first edit for a 30 s piece */}
      <Composition
        id={FACTS_COMPOSITION_ID}
        component={CrosshairEdit}
        durationInFrames={FACTS_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{...DEFAULT_PROPS, variant: 'facts'} as CrosshairEditProps}
      />
      {/* REAL: INFINITE – beat-built edit */}
      <Composition
        id={INSANE_COMPOSITION_ID}
        component={CrosshairEdit}
        durationInFrames={INSANE_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{...DEFAULT_PROPS, variant: 'insane'} as CrosshairEditProps}
      />
    </>
  );
};
