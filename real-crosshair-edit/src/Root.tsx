import React from 'react';
import {Composition} from 'remotion';
import {COMPOSITION_ID, DEFAULT_PROPS, DURATION_FRAMES, FPS, HEIGHT, WIDTH} from './config';
import {CrosshairEdit} from './CrosshairEdit';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={CrosshairEdit}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEFAULT_PROPS}
    />
  );
};
