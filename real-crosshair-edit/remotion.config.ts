import {Config} from '@remotion/cli/config';
import {existsSync} from 'node:fs';

// Maximum practical quality defaults for `npx remotion render`
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setX264Preset('slow');

// Use a pre-installed headless Chrome if one exists (e.g. in CI / cloud boxes),
// otherwise Remotion downloads its own.
const preinstalled = process.env.REMOTION_BROWSER_EXECUTABLE;
if (preinstalled && existsSync(preinstalled)) Config.setBrowserExecutable(preinstalled);
