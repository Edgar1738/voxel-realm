/**
 * Milestone 1 screenshots for The Grand Keep.
 * Requires: npm run dev  (port 5173)
 *
 *   node experimental/grand-keep/capture-m1.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, 'screenshots');
const CAPTURES = resolve(ROOT, '.captures');
mkdirSync(OUT, { recursive: true });
mkdirSync(CAPTURES, { recursive: true });

const savesDir = resolve(ROOT, '.saves');
mkdirSync(savesDir, { recursive: true });
const savePath = resolve(savesDir, 'grand-keep.json');
copyFileSync(resolve(__dirname, 'save-meta.json'), savePath);

const BASE =
  process.env.GK_URL ?? 'http://localhost:5173/?world=grand-keep&save=grand-keep';

const SHOTS = [
  {
    name: '01-spawn-approach',
    kind: 'pov',
    eye: [8, 78, -95],
    look: [8, 95, 30],
    note: 'Castle from spawn overlook',
  },
  {
    name: '02-courtyard-reveal',
    kind: 'pov',
    eye: [8, 78, -20],
    look: [8, 100, 55],
    note: 'Inner court looking at keep',
  },
  {
    name: '03-great-hall',
    kind: 'pov',
    eye: [8, 78, 28],
    look: [8, 82, 72],
    note: 'Great Hall interior',
  },
  {
    name: '04-grand-stair',
    kind: 'pov',
    eye: [42, 80, 34],
    look: [50, 95, 50],
    note: 'Grand staircase',
  },
  {
    name: '05-throne-floor',
    kind: 'pov',
    eye: [8, 90, 38],
    look: [8, 92, 74],
    note: 'Throne / state floor',
  },
  {
    name: '06-dungeon',
    kind: 'pov',
    eye: [-10, 64, 50],
    look: [8, 64, 70],
    note: 'Deep dungeon vault approach',
  },
  {
    name: '07-roof-battlements',
    kind: 'pov',
    eye: [8, 126, 32],
    look: [48, 145, 74],
    note: 'Roof battlements toward Crown Tower',
  },
  {
    name: '08-exterior-overview',
    kind: 'overview',
    target: [8, 90, 20],
    radius: 110,
    angle: 0.85,
    height: 70,
    note: 'High exterior overview',
  },
];

async function waitForVr(page) {
  await page.waitForFunction(() => typeof window.__vr !== 'undefined', null, {
    timeout: 120_000,
  });
  // Dismiss pause/help menus (Escape + click canvas)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(500);

  await page.evaluate(async () => {
    const vr = window.__vr;
    try {
      vr.view?.({ distance: 18, hud: false });
    } catch {
      /* optional */
    }
    try {
      vr.fog?.(40, 220);
    } catch {
      /* optional */
    }
    try {
      vr.weather?.('clear');
    } catch {
      /* optional */
    }
    if (typeof vr.settle === 'function') await vr.settle();
  });
  await page.waitForTimeout(6000);
}

async function warmAt(page, x, y, z) {
  await page.evaluate(({ x, y, z }) => window.__vr.teleport(x, y, z), { x, y, z });
  const start = Date.now();
  while (Date.now() - start < 25000) {
    const ready = await page.evaluate(
      ({ x, z }) => {
        const s = window.__vr.surface?.(x, z);
        return s && !s.unloaded && s.y != null;
      },
      { x, z },
    );
    if (ready) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
}

async function captureShot(page, shot) {
  if (shot.kind === 'overview') {
    const path = await page.evaluate(async (s) => {
      const vr = window.__vr;
      try {
        vr.view?.({ hud: false });
      } catch {
        /* */
      }
      return vr.capture.overview(`gk-${s.name}`, { x: s.target[0], y: s.target[1], z: s.target[2] }, {
        radius: s.radius,
        angle: s.angle,
        height: s.height,
        hud: false,
        maxWidth: 1600,
        quality: 0.92,
      });
    }, shot);
    return path;
  }

  await warmAt(page, shot.eye[0], shot.eye[1], shot.eye[2]);
  const path = await page.evaluate(async (s) => {
    const vr = window.__vr;
    try {
      vr.view?.({ hud: false });
    } catch {
      /* */
    }
    vr.pov(s.eye[0], s.eye[1], s.eye[2], s.look[0], s.look[1], s.look[2]);
    await new Promise((r) => setTimeout(r, 600));
    return vr.save(`gk-${s.name}`, { hud: false, maxWidth: 1600, quality: 0.92 });
  }, shot);
  return path;
}

function copyCapture(srcPath, destName) {
  if (!srcPath) return null;
  // __vr.save may return a path under .captures
  const candidates = [
    srcPath,
    resolve(CAPTURES, srcPath),
    resolve(CAPTURES, `${srcPath}.jpg`),
    resolve(CAPTURES, `${srcPath}.png`),
    resolve(ROOT, srcPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const dest = resolve(OUT, destName);
      copyFileSync(c, dest);
      return dest;
    }
  }
  // Search .captures for matching name
  try {
    const { readdirSync } = await_fs();
    void readdirSync;
  } catch {
    /* */
  }
  return srcPath;
}

function await_fs() {
  return import('node:fs');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  console.log('loading', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForVr(page);

  // Ensure menus are gone once more
  await page.keyboard.press('Escape');
  await page.mouse.click(800, 450);

  const report = [];
  for (const shot of SHOTS) {
    console.log('capturing', shot.name, '—', shot.note);
    const saved = await captureShot(page, shot);
    console.log('  __vr returned', saved);

    // Copy from .captures into experimental screenshots
    let dest = resolve(OUT, `${shot.name}.png`);
    const jpgDest = resolve(OUT, `${shot.name}.jpg`);
    let found = null;
    if (saved && existsSync(saved)) found = saved;
    else if (saved) {
      for (const ext of ['', '.jpg', '.png', '.jpeg']) {
        const p = resolve(CAPTURES, String(saved).replace(/^.*[\\/]/, '') + (String(saved).includes('.') ? '' : ext));
        if (existsSync(p)) {
          found = p;
          break;
        }
      }
      // Also try gk-name.jpg directly
      for (const p of [
        resolve(CAPTURES, `gk-${shot.name}.jpg`),
        resolve(CAPTURES, `gk-${shot.name}.png`),
        resolve(CAPTURES, `${shot.name}.jpg`),
      ]) {
        if (existsSync(p)) {
          found = p;
          break;
        }
      }
    }
    if (found) {
      const out = found.endsWith('.png') ? dest : jpgDest;
      copyFileSync(found, out);
      // Also page screenshot fallback path
      dest = out;
      console.log('  wrote', out);
    } else {
      // Fallback: raw page screenshot (after trying to hide HUD)
      await page.screenshot({ path: dest, type: 'png' });
      console.log('  fallback page screenshot', dest);
    }
    report.push({ ...shot, saved, dest });
  }

  // Headless reachability chain
  console.log('running reachability chain…');
  const reach = await page.evaluate(() => {
    const vr = window.__vr;
    const pts = [
      { name: 'spawn', x: 8, y: 74.5, z: -90 },
      { name: 'gate', x: 8, y: 74.5, z: -38 },
      { name: 'court', x: 8, y: 74.5, z: 8 },
      { name: 'hall', x: 8, y: 75.5, z: 40 },
      { name: 'stair', x: 48, y: 78, z: 40 },
      { name: 'throne', x: 8, y: 87.5, z: 58 },
      { name: 'high', x: 8, y: 111.5, z: 52 },
      { name: 'roof', x: 8, y: 122.5, z: 40 },
      { name: 'dungeon', x: -8, y: 62.5, z: 52 },
    ];
    const results = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      vr.teleport(a.x, a.y, a.z);
      let r;
      try {
        r = vr.reachable
          ? vr.reachable({ x: b.x, y: b.y, z: b.z }, { maxFrames: 2400, arriveDist: 2.5 })
          : vr.walkTo
            ? vr.walkTo(b.x, b.y, b.z, { maxFrames: 2400, arriveDist: 2.5 })
            : { error: 'no walk API' };
      } catch (e) {
        r = { error: String(e) };
      }
      results.push({ from: a.name, to: b.name, result: r });
    }
    return results;
  });
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ shots: report, reach }, null, 2));
  console.log('reachability:', JSON.stringify(reach, null, 2));
  await browser.close();
  console.log('done', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
