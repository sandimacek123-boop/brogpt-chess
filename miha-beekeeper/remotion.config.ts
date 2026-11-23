import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
// cloud boxes ship a headless Chrome; locally Remotion downloads its own
if (process.env.REMOTION_BROWSER_EXECUTABLE) Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
