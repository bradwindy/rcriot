import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cloudflare()],
  // Emit every asset as a file. Inlined data: URIs (small font subsets) would break a font-src CSP later.
  // Three.js alone is about 550 kB minified, and the game needs all of it on the first frame, so splitting gains nothing.
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
});
