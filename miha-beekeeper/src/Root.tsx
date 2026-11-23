import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, SUB, W} from './lib';
import {Miha, TOTAL} from './Video';

export const Root = () => <Composition id="Miha" component={Miha} durationInFrames={TOTAL * SUB} fps={FPS * SUB} width={W} height={H} />;
