import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The fullscreen #overlay ("Click to play" / capture-blocked message) must stay
 * click-through: it covers the whole viewport above the HUD toolbar, so with pointer
 * events enabled it eats every toolbar/slider click whenever the mouse isn't captured
 * (permanently so in embedded previews, where capture is denied outright).
 */
describe('#overlay click-through contract', () => {
  it('declares pointer-events: none on the fullscreen overlay', () => {
    const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
    const block = /#overlay\s*\{[^}]*\}/.exec(html)?.[0];
    expect(block).toBeDefined();
    expect(block).toMatch(/pointer-events:\s*none/);
  });

  it('re-enables pointer events for HUD inputs (sliders), not just buttons', () => {
    const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
    // The rule that re-enables pointer events under the click-through #creative-ui root
    // must cover inputs: the time-of-day and volume sliders are <input type="range">.
    const rule = /#creative-ui button,\s*#creative-ui input\s*\{[^}]*\}/.exec(html)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/pointer-events:\s*auto/);
  });
});
