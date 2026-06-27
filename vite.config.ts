import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => res(body));
  });
}

function safeName(name: unknown, fallback: string): string {
  return String(name ?? fallback).replace(/[^a-z0-9_-]/gi, '_');
}

function sendJson(res: ServerResponse, value: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

/**
 * Dev-only endpoints so the running game can persist things to disk that don't survive the
 * round-trip through the agent: `/__capture` writes a JPEG frame (the live WebGL context hangs
 * browser screenshots, and large base64 corrupts in transit), and `/__blueprint` saves/loads
 * structure JSON so builds can be reused across sessions. `apply: 'serve'` keeps it out of prod.
 */
function devDisk(): Plugin {
  return {
    name: 'vr-dev-disk',
    apply: 'serve',
    configureServer(server) {
      const dir = (sub: string): string => {
        const d = resolve(server.config.root, sub);
        mkdirSync(d, { recursive: true });
        return d;
      };

      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        void readBody(req).then((body) => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name?: string; dataUrl: string };
            const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
            const file = resolve(dir('.captures'), `${safeName(name, 'frame')}.jpg`);
            writeFileSync(file, Buffer.from(base64, 'base64'));
            sendJson(res, { path: file });
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      server.middlewares.use('/__blueprint', (req, res) => {
        const blueprintDir = dir('.blueprints');
        if (req.method === 'POST') {
          void readBody(req).then((body) => {
            try {
              const { name, blueprint } = JSON.parse(body) as { name?: string; blueprint: unknown };
              const file = resolve(blueprintDir, `${safeName(name, 'blueprint')}.json`);
              writeFileSync(file, JSON.stringify(blueprint));
              sendJson(res, { path: file });
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
          return;
        }
        // GET ?name=foo -> the stored blueprint JSON
        const name = safeName(new URL(req.url ?? '', 'http://x').searchParams.get('name'), '');
        const file = resolve(blueprintDir, `${name}.json`);
        if (!name || !existsSync(file)) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(file, 'utf8'));
      });
    },
  };
}

export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
  plugins: [devDisk()],
});
