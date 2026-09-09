import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Node by default; UI tests opt into jsdom with a per-file pragma, so the
    // engine suite is not slowed by a DOM it never touches.
    environment: 'node',
    globals: true,
  },
});
