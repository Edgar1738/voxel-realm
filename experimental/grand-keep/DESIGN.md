# The Grand Keep — Design (Milestone 1)

## Identity

- **Title:** The Grand Keep
- **World ID:** `grand-keep`
- **Preset:** `?world=grand-keep`
- **Save meta:** `experimental/grand-keep/save-meta.json` → `.saves/grand-keep.json`

## Frame

| Constant | Value |
|----------|-------|
| Center | (8, 20) |
| Ground Y | 72 |
| Outer curtain | 124×124 (−54..70 × −42..82) |
| Keep | 97×61 (−40..56 × 22..82) |
| Floors | dungeon 60 · ground 73 · throne 85 · residential 97 · high 109 · roof 121 |
| Crown top | roof+28 |
| Watch top | roof+22 |

## Route

```
Arrival Overlook → Grand Gate → Inner Court → Great Hall
  → Grand Stair → Throne → Residential → High Castle
  → Battlements → Crown Tower summit

Great Hall → Dungeon shaft → Deep Dungeon vault → return shaft
```

## Modules

- `GrandKeepGenerator.ts` — mesa terrain
- `grandKeepFrame.ts` — shared constants
- `grandKeepPrimitives.ts` — stairs, towers, battlements
- `grandKeepWalls.ts` — approach, moat, walls, gatehouse
- `grandKeepKeep.ts` — keep shell, floors, interiors, roof, major towers
- `grandKeepDungeon.ts` — underground
- `grandKeepSite.ts` — orchestrator + processional clear pass
