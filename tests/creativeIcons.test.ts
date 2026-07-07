import { describe, it, expect, vi, afterEach } from 'vitest';
import { GRASS, GLASS } from '../src/blocks/blocks';
import {
  swatchFlatColor,
  buildIcon,
  buildToolIcon,
  WEATHER_ICON_SHAPES,
} from '../src/app/creativeIcons';

describe('swatchFlatColor', () => {
  it('returns known colors, a translucent glass color, and a fallback', () => {
    expect(swatchFlatColor(GRASS)).toBe('#56983c');
    expect(swatchFlatColor(GLASS)).toBe('rgba(205,232,240,0.7)');
    expect(swatchFlatColor(9999 as never)).toBe('#5a5a60');
  });
});

// Minimal fake SVG DOM so the (browser-only) builders can run under the node test env.
interface FakeNode {
  tag: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  setAttribute(k: string, v: string): void;
  append(c: FakeNode): void;
}
function fakeNode(tag: string): FakeNode {
  return {
    tag,
    attrs: {},
    children: [],
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    append(c) {
      this.children.push(c);
    },
  };
}

describe('buildIcon / buildToolIcon', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a 14px svg with one child node per shape spec', () => {
    vi.stubGlobal('document', { createElementNS: (_ns: string, tag: string) => fakeNode(tag) });
    const svg = buildIcon(WEATHER_ICON_SHAPES.snow) as unknown as FakeNode;
    expect(svg.tag).toBe('svg');
    expect(svg.attrs.width).toBe('14');
    expect(svg.attrs['aria-hidden']).toBe('true');
    expect(svg.children).toHaveLength(WEATHER_ICON_SHAPES.snow.length);
    expect(svg.children[0].tag).toBe(WEATHER_ICON_SHAPES.snow[0][0]);
  });

  it('falls back to the single-tool icon for an unknown tool', () => {
    vi.stubGlobal('document', { createElementNS: (_ns: string, tag: string) => fakeNode(tag) });
    const svg = buildToolIcon('does-not-exist') as unknown as FakeNode;
    expect(svg.children).toHaveLength(1);
    expect(svg.children[0].tag).toBe('rect');
  });
});
