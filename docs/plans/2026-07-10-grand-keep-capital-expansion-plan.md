# Grand Keep Capital Expansion Implementation Plan

## Scope

Deliver the approved nested high-medieval capital as deterministic generator content and update the
shipped Grand Keep package so the showcase route includes it.

## Test-first slices

1. Define capital-frame constants, expand the plateau, and test nesting/support boundaries.
2. Build and test the complete new curtain, gates, towers, ditch, bridges, and wall-walk continuity.
3. Build and test reusable roads, plazas, roofs, facades, gardens, and high-medieval building types.
4. Build and test Grand Avenue, Crown Market, coaching quarters, artisan, merchant, cathedral,
   residential, warehouse, and villa districts.
5. Build and test the south/east/west extramural ribbons and rural transition structures.
6. Integrate the capital before skyways and add a last-pass road/gate clearance guarantee.
7. Update spawn, landmarks, tour metadata, and the package bake regions.
8. Regenerate the Grand Keep save/public bundle and verify manifest/package consistency.
9. Run focused regressions, full tests, lint, build, and a live Chrome visual/performance review.

## Integration rules

- Keep the existing `X0..Z1` constants as the historical inner wall.
- New capital constants use a distinct `CAPITAL_*` prefix.
- Existing sky-tower footprints and bridge corridors remain reserved; capital streets absorb those
  corridors instead of placing rooms across support pillars.
- The processional route from the new spawn through both wall circuits remains clear at ground and
  body height.
- Repeated buildings vary deterministically by coordinates and never depend on iteration order.
- Package bake coverage is surface-tight outside the keep to control bundle growth.
