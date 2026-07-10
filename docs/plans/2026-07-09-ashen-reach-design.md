# Ashen Reach Prototype World Design

## Goal

Add a first-class `?world=ashen-reach` preset that demonstrates Voxel Realm as an atmospheric, handcrafted fantasy exploration space without shipping a large saved-world snapshot.

## Player journey

The player starts on a high basalt overlook facing Cinderkeep across a lava-cut valley. A descending ash path crosses a damaged bridge, passes a ruined watchtower, and reaches a walkable fortress. The keep provides a gatehouse, courtyard, rooms, stairs, battlements, and a rooftop vista. Smaller ruins, dead trees, crystal clusters, and lava channels reward exploration beyond the direct route.

## Architecture

- Add an Ashen Reach terrain generator that produces deterministic basalt ridges, ash flats, cliffs, a valley, and lava channels around a shared site coordinate frame.
- Add a chunk-clipped site overlay, following the Citadel stamp pattern, for the Cinderkeep, bridge, watchtower, and nearby ruins.
- Register `ashen-reach` in the preset union and world menu. No renderer, control, edit, persistence, or streaming rewrite is needed.
- Expose an explicit spawn pose, landmark list, and tour points through the curated-world menu metadata.

## Performance and safety

The terrain is height-field based and structures are stamped only into intersecting chunks. Decoration uses bounded deterministic placement. Tests will cover registration, terrain variation, landmark walkability, determinism, and valid block IDs.

## Scope limits

This milestone does not add survival gameplay, mobs, bespoke shaders, new renderer systems, or a bundled world snapshot. Future work can add a packaged showcase save, custom ambient audio, and deeper underground routes.
