import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, W} from './lib';
import {Michael, TOTAL} from './Video';

export const Root = () => <Composition id="Michael" component={Michael} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />;
