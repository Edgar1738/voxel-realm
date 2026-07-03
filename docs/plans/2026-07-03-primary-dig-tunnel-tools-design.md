# Primary Dig Controls and Tunnel Expansion Design

_2026-07-03. Approved direction: make Single and Tunnel the primary visible build controls, then expand Tunnel as the main underground building accelerator. Desktop only; no mobile layout or touch workflow is required for this feature._

## Context

The current build HUD shows all edit tools in one flat top-left row: Single, Tunnel, Sphere, Box Clear, Fill, and Replace. In practice, Single and Tunnel are the common everyday tools. Single is the precision cleanup tool. Tunnel is the fast, fun underground tool because it clears a larger path quickly.

The UI should reflect that usage. Single and Tunnel should read as the primary dig controls, while Sphere, Box Clear, Fill, and Replace should stay available as secondary or advanced tools.

## Goals

- Make Single and Tunnel more prominent than the rest of the tool set.
- Keep Single simple: one click removes one block.
- Expand Tunnel without turning it into many separate tools.
- Optimize for desktop keyboard and mouse only.
- Keep the HUD compact enough that it does not compete further with Menu, Blueprints, World, sound controls, and the debug panel.

## Non-goals

- No mobile-specific layout, touch controls, or small-screen validation.
- No new block types, worldgen changes, save-format changes, or meshing changes.
- No complex tunnel automation such as torch placement, room generation, or floor finishing in the first pass.
- No refactor of unrelated creative UI or builder mode behavior.

## Recommended UI

Use a two-tier tool rail.

Primary dig group:

- Single
- Tunnel

Secondary tools:

- Sphere
- Box Clear
- Fill
- Replace

Single and Tunnel should be larger and visually grouped together. The secondary tools can remain in the same dock but should be smaller, slightly separated, or placed behind a compact "More tools" style grouping if the row gets crowded.

When Tunnel is active, show a compact Tunnel settings strip:

- Size: 1, 2, 3
- Length: 4, 8, 16
- Path: Straight, Up, Down

Initial default:

- Tool: Tunnel
- Size: 3
- Length: 8
- Path: Straight

## Tunnel Behavior

Tunnel stays one tool with a config object rather than becoming separate tools such as "Tunnel 1x1" or "Tunnel Stairs".

Suggested state shape:

```ts
interface TunnelConfig {
  size: 1 | 2 | 3;
  length: 4 | 8 | 16;
  path: 'straight' | 'up' | 'down';
}
```

Straight tunnels clear forward along the dominant look or hit-normal direction, using the selected size for the cross-section.

Up and Down tunnels clear a stair-like path. Each forward step also offsets vertically on a predictable cadence. The first version should favor reliable traversal over fancy shaping.

## Input Model

- `T` continues cycling tools.
- Clicking Single selects Single.
- Clicking Tunnel selects Tunnel.
- Tunnel settings are visible only when Tunnel is active.
- LMB with Tunnel uses the current Tunnel settings.
- Single remains the precision one-click dig tool.

No mobile-specific input is needed.

## Implementation Shape

Keep this small and testable:

- Add `TunnelConfig` state near the current tool state.
- Replace the fixed `TUNNEL_LENGTH` and hard-coded radius behavior with config-driven tunnel voxel generation.
- Keep the current `tunnelVoxels` helper or add a small companion helper for stair paths.
- Add UI controls in `CreativeUi` only for the active Tunnel settings.
- Keep the existing tool ids stable: `single`, `tunnel`, `sphere`, `box-clear`, `fill`, `replace`.

## Verification

- Unit-test tunnel voxel generation for size, length, straight path, up stair, and down stair.
- Run the smallest relevant TypeScript/Vitest check.
- Live-smoke in desktop browser:
  - Single is prominent and still breaks one block.
  - Tunnel is prominent and uses the selected settings.
  - Tunnel settings appear only when Tunnel is active.
  - Secondary tools remain usable.
  - The desktop HUD does not overlap the other top controls in the normal viewport.

