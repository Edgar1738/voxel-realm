import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dev-only endpoint so the running game can write a captured frame straight to disk
 * (POST /__capture { name, dataUrl }). The live WebGL context hangs browser screenshots, and
 * round-tripping a large base64 through the agent corrupts it — writing server-side avoids both.
 * `apply: 'serve'` keeps it out of production builds entirely.
 */
function captureToDisk(): Plugin {
  return {
    name: 'vr-capture-to-disk',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name?: string; dataUrl: string };
            const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
            const safe = String(name ?? 'frame').replace(/[^a-z0-9_-]/gi, '_');
            const dir = resolve(server.config.root, '.captures');
            mkdirSync(dir, { recursive: true });
            const file = resolve(dir, `${safe}.jpg`);
            writeFileSync(file, Buffer.from(base64, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ path: file }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
  plugins: [captureToDisk()],
});
