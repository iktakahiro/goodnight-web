// Builds the admin SPA into admin-ui/dist. scripts/build-admin-module.ts then
// embeds the output in the Worker bundle (docs/decisions/0004).
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The admin CSP allows only 'self' scripts; keep everything in files.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    // One chunk of about 190 kB gzip (React, Base UI, the auth client). It is
    // embedded in the Worker, so splitting it would not save any requests.
    chunkSizeWarningLimit: 800,
  },
});
