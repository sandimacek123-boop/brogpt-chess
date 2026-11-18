import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    {
      // Capacitor injects its native bridge as an inline <script>, which the strict CSP meta
      // would block. The Android build drops the meta tag (the APK serves only bundled files).
      name: 'sortclaude-capacitor-csp',
      transformIndexHtml(html: string) {
        return mode === 'capacitor' ? html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '') : html;
      },
    },
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
}) as any);
