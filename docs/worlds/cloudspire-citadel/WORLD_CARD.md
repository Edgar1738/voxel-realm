# World Card — Cloudspire Citadel

- **World ID:** `cloudspire-citadel`
- **Title:** Cloudspire Citadel
- **Classification:** IMPLEMENTED WORLD — **showcase**
- **One-sentence promise:** An enormous misty high-fantasy castle-city — pale limestone, dark slate roofs, Gothic cathedral, terraced gardens, waterfalls, and a towering central spire you can climb on foot.
- **Builder / owner:** Grok
- **Branch:** `main` (merged PR #70)
- **Worktree:** n/a (shipped)
- **Current commit:** `b3c8578` (merge)
- **Main status:** Showcase package on `main` — manifest + `public/worlds/cloudspire-citadel.vrw`; Edgar-approved 2026-07-13.
- **Source assets:** Generator preset `cloudspire-citadel` + baked neighborhood package (~242 chunks) + procedural remainder.
- **Registry evidence:** `world-manifest.json`, `public/worlds/cloudspire-citadel.vrw`, `public/worlds/previews/cloudspire-citadel.jpg`
- **Engine changes:** Optional `WorldMeta.atmosphere` (weather/time/fog); Cloudspire material family block ids 42–48 (append-only).
- **Next required approval:** None for ship path — showcase on main.
- **Last verified date:** 2026-07-13

## Load

```
?save=cloudspire-citadel
# or fresh generate:
?world=cloudspire-citadel
```

## Scale

| Measure | Value |
|---------|--------|
| Outer walls | ~250×250 |
| Authored envelope | ~380×340 |
| Cathedral | ~58×54 plan, ~78 tower |
| Palace stack | 12 storeys + multi-stage spire |
| Highest architecture | ~y 420–440 |
| Bake | 242 chunks · ~9.6 MB JSON |

## Hero route

Arrival Overlook → Lower Approach → Outer Gatehouse → Garden Terraces → Cathedral Nave → Inner Palace Court → Great Hall → Grand Stair → Upper Palace → Sky Bridge → Crown Balcony
