/**
 * Headless playtest + screenshot pass for Ashen Reach.
 * Requires: dev server on :5173, .saves/ashen-reach.json seeded.
 *
 *   node experimental/ashen-reach/capture-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

const URL =
  process.env.ASHEN_URL ??
  'http://localhost:5173/?world=ashen-reach&save=ashen-reach';

const SHOTS = [
  {
    name: '01-spawn-opening',
    kind: 'pov',
    eye: [8, 71, 14],
    look: [0, 78, 96],
    note: 'Spawn looking south through vista to Ember Spire',
  },
  {
    name: '02-wide-overview',
    kind: 'overview',
    target: [0, 72, 70],
    radius: 100,
    angle: 0.7,
    height: 55,
    note: 'Wide bowl composition',
  },
  {
    name: '03-main-approach',
    kind: 'pov',
    eye: [14, 68, 36],
    look: [0, 85, 96],
    note: 'Road approach toward lake + spire',
  },
  {
    name: '04-hero-ember-spire',
    kind: 'pov',
    eye: [28, 78, 70],
    look: [0, 90, 96],
    note: 'Hero landmark: Ember Spire from east shore',
  },
  {
    name: '05-secondary-observatory',
    kind: 'overview',
    target: [-92, 120, 96],
    radius: 45,
    angle: 1.2,
    height: 30,
    note: 'Secondary: rim observatory',
  },
  {
    name: '06-street-plaza',
    kind: 'pov',
    eye: [4, 70.5, 8],
    look: [16, 71, 6],
    note: 'Path-level plaza / forge row',
  },
  {
    name: '07-house-interior',
    kind: 'pov',
    eye: [-5, 70.2, -25],
    look: [-4, 70, -24],
    note: 'Cottage interior furniture',
  },
  {
    name: '08-elevated-rim',
    kind: 'pov',
    eye: [-70, 112, 110],
    look: [0, 85, 96],
    note: 'Elevated rim looking at spire',
  },
  {
    name: '09-magma-bridge',
    kind: 'pov',
    eye: [48, 68, 58],
    look: [48, 62, 78],
    note: 'Magma fissure bridge approach',
  },
  {
    name: '10-dock-to-spire',
    kind: 'pov',
    eye: [8, 66, 54],
    look: [0, 90, 96],
    note: 'Dock waterline → spire',
  },
  {
    name: '11-mine-mouth',
    kind: 'pov',
    eye: [74, 92, 108],
    look: [88, 90, 108],
    note: 'Ash mine adit',
  },
  {
    name: '12-final-overlook',
    kind: 'pov',
    eye: [-90, 125, 96],
    look: [8, 70, 20],
    note: 'Observatory final viewpoint over village',
  },
  {
    name: '13-atmospheric-detail',
    kind: 'pov',
    eye: [10, 65.5, 58],
    look: [6, 64, 70],
    note: 'Player-height: dock rails, glow under causeway, water edge',
  },
  {
    name: '14-signature',
    kind: 'pov',
    eye: [8, 66.5, 56],
    look: [0, 88, 96],
    note: 'Signature: causeway axis to Ember Spire at player height',
  },
];

async function waitForVr(page, timeoutMs = 90000) {
  await page.waitForFunction(() => typeof window.__vr !== 'undefined', null, {
    timeout: timeoutMs,
  });
  // Let streaming fill spawn chunks; bump view distance for showcase stills when possible.
  await page.waitForTimeout(3000);
  try {
    await page.evaluate(async () => {
      const vr = window.__vr;
      try {
        vr.view?.({ distance: 16 });
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

/** Teleport and wait until the column underfoot reports a solid surface (chunks streamed in). */
async function warmAt(page, x, y, z, timeoutMs = 20000) {
  await page.evaluate(
    ({ x, y, z }) => {
      window.__vr.teleport(x, y, z);
    },
    { x, y, z },
  );
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(({ x, z }) => {
      const s = window.__vr.surface(x, z);
      return !s.unloaded && s.y != null;
    }, { x, z });
    if (ready) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
}

async function captureShot(page, shot) {
  const path = await page.evaluate(async (s) => {
    const vr = window.__vr;
    // Hide HUD for clean stills when possible.
    try {
      vr.view?.({ hud: false });
    } catch {
      /* optional */
    }
    if (s.kind === 'overview') {
      return vr.capture.overview(
        `ashen-${s.name}`,
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
    await new Promise((r) => setTimeout(r, 400));
    return vr.save(`ashen-${s.name}`, { hud: false, maxWidth: 1600, quality: 0.9 });
  }, shot);
  return path;
}

async function probeTraversal(page) {
  return page.evaluate(() => {
    const vr = window.__vr;
    const samples = [
      { name: 'plaza', x: 8, z: 4 },
      { name: 'dock', x: 8, z: 54 },
      { name: 'bridge', x: 48, z: 72 },
      { name: 'spire-base', x: 0, z: 96 },
      { name: 'observatory', x: -92, z: 96 },
      { name: 'mine', x: 78, z: 108 },
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
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Dismiss pointer-lock overlay if present (click canvas / press Escape).
  try {
    await page.click('canvas', { timeout: 5000 });
  } catch {
    /* ignore */
  }
  await page.keyboard.press('Escape').catch(() => {});

  await waitForVr(page);
  console.log('__vr ready');

  // Apply curated meta if save lacked it (belt-and-suspenders).
  await page.evaluate(async () => {
    const vr = window.__vr;
    if (!vr.world?.setMeta) return;
    await vr.world.setMeta({
      title: 'Ashen Reach',
      description:
        'A volcanic caldera kingdom: Emberhold watches The Ember Spire rise from a basalt island in a dark crater lake.',
      preset: 'ashen-reach',
    });
  });

  report.traversal = await probeTraversal(page);
  console.log('Traversal probe:', JSON.stringify(report.traversal, null, 2));

  for (const shot of SHOTS) {
    try {
      // Warm nearby chunks by teleporting first and waiting for surface.
      if (shot.kind === 'pov') {
        await warmAt(page, shot.eye[0], shot.eye[1], shot.eye[2]);
        // Also warm the look target column so landmarks stream in.
        await warmAt(page, shot.look[0], shot.look[1] + 10, shot.look[2], 12000);
        await warmAt(page, shot.eye[0], shot.eye[1], shot.eye[2], 8000);
      } else {
        await warmAt(page, shot.target[0], shot.target[1] + 20, shot.target[2]);
      }
      const serverPath = await captureShot(page, shot);
      // Also grab a browser screenshot as backup in experimental folder.
      const png = resolve(OUT, `${shot.name}.png`);
      await page.screenshot({ path: png, type: 'png' });
      report.shots.push({
        name: shot.name,
        note: shot.note,
        serverPath,
        png,
        ok: true,
      });
      console.log('OK', shot.name, '->', serverPath || png);
    } catch (e) {
      report.errors.push({ name: shot.name, error: String(e) });
      console.error('FAIL', shot.name, e);
    }
  }

  const reportPath = resolve(OUT, 'critique-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('Wrote', reportPath);

  await browser.close();
  if (report.errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
