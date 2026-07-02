import { defineConfig, type Plugin } from 'vite';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readWorld,
  writeChunk,
  writeMeta,
  clearWorld,
  listWorlds,
  copyWorld,
  deleteWorld,
  safeWorldName,
  type DiskSnapshot,
} from './server/worldDiskStore';
import { isAllowedDevOrigin } from './server/devRequestGuard';

const MAX_BODY_BYTES = 8 * 1024 * 1024; // reject request bodies larger than this (dev guard)

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
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
        if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
          res.statusCode = 403;
          return res.end('forbidden: cross-origin request rejected');
        }
        void readBody(req)
          .then((body) => {
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
          })
          .catch(() => {
            res.statusCode = 413;
            res.end('payload too large');
          });
      });

      server.middlewares.use('/__blueprint', (req, res) => {
        const blueprintDir = dir('.blueprints');
        if (req.method === 'POST') {
          if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
            res.statusCode = 403;
            return res.end('forbidden: cross-origin request rejected');
          }
          void readBody(req)
            .then((body) => {
              try {
                const { name, blueprint } = JSON.parse(body) as {
                  name?: string;
                  blueprint: unknown;
                };
                const file = resolve(blueprintDir, `${safeName(name, 'blueprint')}.json`);
                writeFileSync(file, JSON.stringify(blueprint));
                sendJson(res, { path: file });
              } catch (err) {
                res.statusCode = 500;
                res.end(String(err));
              }
            })
            .catch(() => {
              res.statusCode = 413;
              res.end('payload too large');
            });
          return;
        }
        const url = new URL(req.url ?? '', 'http://x');
        if (req.method === 'DELETE') {
          if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
            res.statusCode = 403;
            return res.end('forbidden: cross-origin request rejected');
          }
          const target = safeName(url.searchParams.get('name'), '');
          const targetFile = resolve(blueprintDir, `${target}.json`);
          if (!target || !existsSync(targetFile)) {
            res.statusCode = 404;
            return res.end('not found');
          }
          unlinkSync(targetFile);
          return sendJson(res, { ok: true });
        }
        // GET ?list -> saved blueprint names (sorted, .json stripped)
        if (url.searchParams.has('list')) {
          const names = readdirSync(blueprintDir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.slice(0, -'.json'.length))
            .sort();
          return sendJson(res, { blueprints: names });
        }
        // GET ?name=foo -> the stored blueprint JSON
        const name = safeName(url.searchParams.get('name'), '');
        const file = resolve(blueprintDir, `${name}.json`);
        if (!name || !existsSync(file)) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(file, 'utf8'));
      });

      server.middlewares.use('/__world', (req, res) => {
        const root = dir('.saves');
        const url = new URL(req.url ?? '', 'http://x');
        const name = safeWorldName(url.searchParams.get('name'));

        if (req.method === 'GET') {
          if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
            res.statusCode = 403;
            return res.end('forbidden: cross-origin request rejected');
          }
          if (url.searchParams.has('list')) return sendJson(res, { worlds: listWorlds(root) });
          return sendJson(res, readWorld(root, name));
        }

        if (req.method === 'DELETE') {
          if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
            res.statusCode = 403;
            return res.end('forbidden: cross-origin request rejected');
          }
          deleteWorld(root, name);
          return sendJson(res, { ok: true });
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('GET/POST/DELETE only');
        }

        if (!isAllowedDevOrigin(req.headers.origin, req.headers.host)) {
          res.statusCode = 403;
          return res.end('forbidden: cross-origin request rejected');
        }

        const copyTo = url.searchParams.get('copyTo');
        if (copyTo) {
          copyWorld(root, name, safeWorldName(copyTo));
          return sendJson(res, { ok: true });
        }
        if (url.searchParams.has('clear')) {
          clearWorld(root, name);
          return sendJson(res, { ok: true });
        }

        void readBody(req)
          .then((body) => {
            try {
              const payload = JSON.parse(body || '{}') as {
                meta?: DiskSnapshot['meta'];
                entries?: Array<[number, number] | [number, number, number]>;
              };
              if (url.searchParams.has('meta')) {
                writeMeta(root, name, payload.meta);
                return sendJson(res, { ok: true });
              }
              const chunk = url.searchParams.get('chunk');
              if (chunk && /^-?\d+,-?\d+$/.test(chunk)) {
                const entries = Array.isArray(payload.entries) ? payload.entries : [];
                const clean = entries.filter(
                  (e): e is [number, number] | [number, number, number] =>
                    Array.isArray(e) &&
                    (e.length === 2 || e.length === 3) &&
                    Number.isInteger(e[0]) &&
                    Number.isInteger(e[1]) &&
                    (e.length === 2 || Number.isInteger(e[2])),
                );
                try {
                  writeChunk(root, name, chunk, clean);
                } catch (err) {
                  res.statusCode = 400;
                  res.end(String(err));
                  return;
                }
                return sendJson(res, { ok: true });
              }
              res.statusCode = 400;
              res.end('bad request');
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          })
          .catch(() => {
            res.statusCode = 413;
            res.end('payload too large');
          });
      });
    },
  };
}

export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
  plugins: [devDisk()],
});
