import type { NpcDefinition, NpcPartDefinition } from '../npc/NpcTypes';

interface ProjectedPart {
  part: NpcPartDefinition;
  x: number;
  y: number;
}

/** Lightweight catalog icon generated from the definition's own model parts and palette. */
export function renderNpcPreview(canvas: HTMLCanvasElement, npc: NpcDefinition): void {
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(48, 34, 4, 48, 48, 60);
  gradient.addColorStop(0, 'rgba(92,112,138,0.52)');
  gradient.addColorStop(1, 'rgba(12,16,22,0.92)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const projected: ProjectedPart[] = npc.parts.map((part) => ({
    part,
    x: part.pos[0],
    // Head-anchored parts sit above the torso. Joint-local parts remain useful color/shape cues.
    y: part.pos[1] + (part.anchor === 'head' ? 0.76 : 0),
  }));
  if (projected.length === 0) return;
  const minX = Math.min(...projected.map(({ x, part }) => x - part.size[0] / 2));
  const maxX = Math.max(...projected.map(({ x, part }) => x + part.size[0] / 2));
  const minY = Math.min(...projected.map(({ y, part }) => y - part.size[1] / 2));
  const maxY = Math.max(...projected.map(({ y, part }) => y + part.size[1] / 2));
  const scale = Math.min(68 / Math.max(0.1, maxX - minX), 72 / Math.max(0.1, maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Positive-Z/back pieces first; negative-Z/front details land on top.
  projected.sort((a, b) => b.part.pos[2] - a.part.pos[2]);
  for (const { part, x, y } of projected) {
    const color = npc.palette[part.slot] ?? 0xd8dde5;
    const width = Math.max(1, part.size[0] * scale);
    const height = Math.max(1, part.size[1] * scale);
    const left = 48 + (x - centerX) * scale - width / 2;
    const top = 48 - (y - centerY) * scale - height / 2;
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(left, top, width, height);
    if (width > 4 && height > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(left + 0.4, top + 0.4, width - 0.8, height - 0.8);
    }
  }
}
