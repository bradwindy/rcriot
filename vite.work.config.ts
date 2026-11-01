import { cloudflare } from '@cloudflare/vite-plugin';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const PORT = Number(process.env.PORT ?? 5190);
const SHOTS = process.env.SHOTS ?? join(import.meta.dirname, '.shots');

/** Dev only: POST /__shot {name, data} saves a JPEG data URL as SHOTS/name.jpg, for rc.shot() in a background tab. */
function shots(): Plugin {
  return {
    name: 'shots',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const { name, data } = JSON.parse(body) as { name: string; data: string };
          mkdirSync(SHOTS, { recursive: true });
          writeFileSync(join(SHOTS, `${name.replace(/[^\w.-]/g, '_')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

// Working copy only: its own port and dep cache, so the main dev server is never disturbed.
export default defineConfig({
  plugins: [shots(), cloudflare()],
  cacheDir: '.vite-work',
  // node_modules may be a link to another copy's, which Vite must be allowed to serve from.
  server: { port: PORT, strictPort: true, fs: { allow: ['.', realpathSync(join(import.meta.dirname, 'node_modules'))] } },
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
});
