import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, SUB, W} from './lib';
import {Michael, TOTAL} from './Video';

export const Root = () => <Composition id="Michael" component={Michael} durationInFrames={TOTAL * SUB} fps={FPS * SUB} width={W} height={H} />;
