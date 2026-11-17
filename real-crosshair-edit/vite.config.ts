import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Preview app (served by server/render-server.ts in middleware mode).
export default defineConfig({
  root: path.resolve(__dirname, 'preview'),
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react()],
  server: {fs: {allow: [path.resolve(__dirname)]}},
  build: {outDir: path.resolve(__dirname, 'dist-preview'), emptyOutDir: true},
});
