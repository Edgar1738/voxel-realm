/**
 * Milestone 2 review captures — 15 required viewpoints (mostly player height).
 * Dev server on :5173, save seeded.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'screenshots-m2');
mkdirSync(OUT, { recursive: true });
const URL = process.env.ASHEN_URL ?? 'http://localhost:5173/?world=ashen-reach&save=ashen-reach';

const SHOTS = [
  { name: '01-spawn', eye: [8, 72.5, -48], look: [8, 72, -30], note: 'Spawn in arrival pass' },
  { name: '02-first-reveal', eye: [8, 73, -26], look: [0, 80, 96], note: 'First reveal past Crater Gate' },
  { name: '03-crater-gate', eye: [8, 73, -32], look: [8, 78, -28], note: 'Crater Gate monument' },
  { name: '04-district-street', eye: [8, 70.5, -8], look: [8, 70, 12], note: 'Main district avenue' },
  { name: '05-central-plaza', eye: [4, 70.5, 2], look: [16, 72, 6], note: 'Central plaza' },
  { name: '06-district-to-tower', eye: [8, 71, 16], look: [0, 90, 96], note: 'District view toward tower' },
  { name: '07-lakefront', eye: [8, 66, 48], look: [0, 75, 90], note: 'Lakefront plaza' },
  { name: '08-main-bridge', eye: [6, 65.5, 68], look: [0, 85, 96], note: 'Causeway / main bridge' },
  { name: '09-tower-entrance', eye: [0, 70, 84], look: [0, 78, 92], note: 'Tower entrance' },
  { name: '10-tower-interior', eye: [0, 78, 96], look: [2, 82, 98], note: 'Tower interior mid climb' },
  { name: '11-tower-balcony', eye: [7, 80, 96], look: [0, 90, 96], note: 'Tower balcony' },
  { name: '12-monastery', eye: [-58, 104, 52], look: [0, 80, 96], note: 'Cliff Monastery secondary' },
  { name: '13-drowned-ruins', eye: [-32, 65, 98], look: [-28, 64, 100], note: 'Drowned Ruins secondary' },
  { name: '14-ash-mines', eye: [74, 90, 108], look: [88, 90, 108], note: 'Ash Mines secondary' },
  { name: '15-summit-signature', eye: [0, 118, 96], look: [8, 70, 10], note: 'Tower summit signature' },
];

async function warmAt(page, x, y, z, ms = 15000) {
  await page.evaluate(({ x, y, z }) => window.__vr.teleport(x, y, z), { x, y, z });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate(({ x, z }) => {
      const s = window.__vr.surface(x, z);
      return !s.unloaded && s.y != null;
    }, { x, z });
    if (ok) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { url: URL, shots: [], errors: [] };
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('canvas', { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => typeof window.__vr !== 'undefined', null, { timeout: 90000 });
  await page.waitForTimeout(5000);

  for (const shot of SHOTS) {
    try {
      await warmAt(page, shot.eye[0], shot.eye[1], shot.eye[2]);
      await warmAt(page, shot.look[0], shot.look[1], shot.look[2], 10000);
      await warmAt(page, shot.eye[0], shot.eye[1], shot.eye[2], 6000);
      const serverPath = await page.evaluate(async (s) => {
        const vr = window.__vr;
        try {
          vr.view?.({ hud: false });
        } catch {
          /* optional */
        }
        vr.pov(s.eye[0], s.eye[1], s.eye[2], s.look[0], s.look[1], s.look[2]);
        await new Promise((r) => setTimeout(r, 500));
        return vr.save(`ashen-m2-${s.name}`, { hud: false, maxWidth: 1600, quality: 0.9 });
      }, shot);
      const png = resolve(OUT, `${shot.name}.png`);
      await page.screenshot({ path: png, type: 'png' });
      report.shots.push({ ...shot, serverPath, png, ok: true });
      console.log('OK', shot.name);
    } catch (e) {
      report.errors.push({ name: shot.name, error: String(e) });
      console.error('FAIL', shot.name, e);
    }
  }
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (report.errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
