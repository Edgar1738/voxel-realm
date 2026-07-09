/**
 * Hollowmere Milestone 1 screenshot + light traversal pass.
 *
 *   # terminal A
 *   npm run dev -- --port 5177
 *   # terminal B
 *   node experimental/hollowmere/capture-m1.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, 'screenshots-m1');
const CAPTURES = resolve(ROOT, '.captures');
mkdirSync(OUT, { recursive: true });
mkdirSync(CAPTURES, { recursive: true });

const PORT = process.env.HOLLOWMERE_PORT ?? '5177';
const URL =
  process.env.HOLLOWMERE_URL ??
  `http://localhost:${PORT}/?world=hollowmere&spawn=6,71.5,122&look=0,0.05`;

// ≥15 required M1 shots. Most are player-height (pov).
const SHOTS = [
  {
    name: '01-spawn',
    kind: 'pov',
    eye: [6, 72, 122],
    look: [6, 70, 108],
    note: 'Spawn forest approach looking north',
  },
  {
    name: '02-forest-arrival',
    kind: 'pov',
    eye: [6, 71, 112],
    look: [6, 68, 95],
    note: 'Forest path toward river',
  },
  {
    name: '03-covered-bridge',
    kind: 'pov',
    eye: [6, 66, 82],
    look: [6, 66, 72],
    note: 'Covered bridge / river crossing',
  },
  {
    name: '04-arrival-hamlet',
    kind: 'pov',
    eye: [6, 68, 62],
    look: [0, 69, 54],
    note: 'Arrival hamlet inn + gate',
  },
  {
    name: '05-main-village-street',
    kind: 'pov',
    eye: [6, 68, 48],
    look: [6, 68, 36],
    note: 'Main village street toward market',
  },
  {
    name: '06-market-square',
    kind: 'pov',
    eye: [2, 68.5, 44],
    look: [2, 68, 34],
    note: 'Market square at player height',
  },
  {
    name: '07-hillside-district',
    kind: 'pov',
    eye: [-36, 72, 14],
    look: [-48, 78, 8],
    note: 'Hillside terraces',
  },
  {
    name: '08-layered-village-volcano',
    kind: 'pov',
    eye: [-48, 83, 6],
    look: [20, 110, -120],
    note: 'Layered view: overlook + village + volcano',
  },
  {
    name: '09-first-lost-reveal',
    kind: 'pov',
    eye: [2, 68, 18],
    look: [0, 76, -6],
    note: 'First reveal of lost village / bell silhouette',
  },
  {
    name: '10-transition-inner-wall',
    kind: 'pov',
    eye: [2, 68, 14],
    look: [2, 64, 6],
    note: 'Transition through broken inner gate',
  },
  {
    name: '11-flooded-streets',
    kind: 'pov',
    eye: [4, 63.5, 2],
    look: [0, 66, -8],
    note: 'Flooded streets of the lost village',
  },
  {
    name: '12-drowned-bell-tower',
    kind: 'pov',
    eye: [10, 64, 2],
    look: [0, 80, -6],
    note: 'Drowned Bell Tower exterior',
  },
  {
    name: '13-watermill',
    kind: 'pov',
    eye: [38, 66.5, 72],
    look: [46, 68, 70],
    note: 'Watermill landmark',
  },
  {
    name: '14-volcanic-foothills',
    kind: 'pov',
    eye: [4, 80, -78],
    look: [28, 130, -145],
    note: 'Volcanic foothills toward the mountain',
  },
  {
    name: '15-signature-overview',
    kind: 'pov',
    eye: [40, 95, 55],
    look: [0, 75, -10],
    note: 'Signature elevated overview (player-ish high angle)',
  },
  {
    name: '16-bell-from-lost-square',
    kind: 'pov',
    eye: [-8, 63.5, 0],
    look: [0, 82, -6],
    note: 'Bell tower from flooded square (extra)',
  },
  {
    name: '17-farm-belt',
    kind: 'pov',
    eye: [40, 68, 50],
    look: [46, 68, 56],
    note: 'Farm belt countryside transition',
  },
];

async function waitForVr(page, timeoutMs = 90000) {
  await page.waitForFunction(() => typeof window.__vr !== 'undefined', null, {
    timeout: timeoutMs,
  });
  await page.waitForTimeout(2500);
  try {
    await page.evaluate(async () => {
      const vr = window.__vr;
      try {
        // Prefer long distance for landscape/volcano stills when the API allows it.
        if (typeof vr.viewDistance === 'function') vr.viewDistance(16);
        else vr.view?.({ distance: 16 });
      } catch {
        /* optional */
      }
      if (typeof vr.settle === 'function') await vr.settle();
    });
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(5000);
}

async function warmAt(page, x, y, z, timeoutMs = 25000) {
  await page.evaluate(
    ({ x, y, z }) => {
      window.__vr.teleport(x, y, z);
    },
    { x, y, z },
  );
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(
      ({ x, z }) => {
        const s = window.__vr.surface(x, z);
        return !s.unloaded && s.y != null;
      },
      { x, z },
    );
    if (ready) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(900);
}

async function captureShot(page, shot) {
  const path = await page.evaluate(async (s) => {
    const vr = window.__vr;
    try {
      vr.view?.({ hud: false });
    } catch {
      /* optional */
    }
    if (s.kind === 'overview') {
      return vr.capture.overview(
        `hollowmere-${s.name}`,
        { x: s.target[0], y: s.target[1], z: s.target[2] },
        {
          radius: s.radius,
          angle: s.angle,
          height: s.height,
          hud: false,
          maxWidth: 1600,
          quality: 0.9,
        },
      );
    }
    vr.pov(s.eye[0], s.eye[1], s.eye[2], s.look[0], s.look[1], s.look[2]);
    await new Promise((r) => setTimeout(r, 500));
    return vr.save(`hollowmere-${s.name}`, { hud: false, maxWidth: 1600, quality: 0.9 });
  }, shot);
  return path;
}

async function probeTraversal(page) {
  return page.evaluate(() => {
    const vr = window.__vr;
    const samples = [
      { name: 'spawn', x: 6, z: 104 },
      { name: 'bridge', x: 6, z: 72 },
      { name: 'hamlet', x: 6, z: 56 },
      { name: 'market', x: 2, z: 36 },
      { name: 'gate', x: 2, z: 12 },
      { name: 'bell', x: 0, z: -6 },
      { name: 'mill', x: 46, z: 70 },
      { name: 'overlook', x: -50, z: 4 },
      { name: 'foothill', x: -6, z: -88 },
    ];
    return samples.map((s) => {
      const surf = vr.surface(s.x, s.z);
      const above1 = surf.y != null ? vr.blockAt(s.x, surf.y + 1, s.z) : null;
      const above2 = surf.y != null ? vr.blockAt(s.x, surf.y + 2, s.z) : null;
      return {
        ...s,
        surfaceY: surf.y,
        surfaceBlock: surf.block,
        unloaded: surf.unloaded,
        headroom: [above1, above2],
      };
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { url: URL, shots: [], traversal: null, errors: [] };

  console.log('Loading', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.click('canvas', { timeout: 5000 });
  } catch {
    /* ignore */
  }
  await page.keyboard.press('Escape').catch(() => {});

  await waitForVr(page);
  console.log('__vr ready');

  for (const shot of SHOTS) {
    try {
      const eye = shot.eye ?? shot.target;
      await warmAt(page, eye[0], eye[1], eye[2]);
      if (shot.kind === 'pov') {
        await page.evaluate((s) => {
          window.__vr.pov(s.eye[0], s.eye[1], s.eye[2], s.look[0], s.look[1], s.look[2]);
        }, shot);
        await page.waitForTimeout(600);
      }
      const saved = await captureShot(page, shot);
      // Copy into experimental screenshots folder if written under .captures
      const base = `hollowmere-${shot.name}.jpg`;
      const fromCaptures = resolve(CAPTURES, base);
      const dest = resolve(OUT, `${shot.name}.jpg`);
      if (existsSync(fromCaptures)) copyFileSync(fromCaptures, dest);
      else if (saved && existsSync(saved)) copyFileSync(saved, dest);
      report.shots.push({ ...shot, path: dest, saved });
      console.log('✓', shot.name, '→', dest);
    } catch (err) {
      report.errors.push({ shot: shot.name, error: String(err) });
      console.error('✗', shot.name, err);
    }
  }

  try {
    report.traversal = await probeTraversal(page);
    console.log('Traversal probe:', JSON.stringify(report.traversal, null, 2));
  } catch (err) {
    report.errors.push({ shot: 'traversal', error: String(err) });
  }

  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('Done. Shots:', report.shots.length, 'Errors:', report.errors.length);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
