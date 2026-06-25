# Model Hub — On-Device Jetsam Soak Matrix

Status: **not yet run**. Required before shipping per spec §9.2 / §9.3 acceptance criteria
("Deep Thinker completes 3 consecutive Night Shift soaks on floor-tier physical device
without Jetsam kill"). Simulators do not enforce iOS Jetsam — this matrix can only be
filled in on physical hardware.

## Seed data

Generate (or refresh) the 50-note OKF bundle:

```bash
npm run seed:night-shift
```

Import on device: **Settings → Import OKF** → `fixtures/night-shift-seed.zip`  
See `fixtures/night-shift-seed/README.md` for transfer options (AirDrop, `adb push`, etc.).

## Reference device matrix

| Tier | Example | Result | Notes |
|------|---------|--------|-------|
| Floor | 4 GB RAM Android budget phone | _pending_ | |
| Mid | 6 GB phone | _pending_ | |
| Ceiling | 8 GB flagship phone + one iPad | _pending_ | |

## Soak protocol

See spec `docs/superpowers/specs/2026-06-24-in-app-model-hub-design.md` §9.2 for the full
per-model, per-device, 3-consecutive-run protocol (50-note setup, Night Shift trigger,
worst-case backgrounding variant, instrumentation via Xcode Allocations / Android Memory
Profiler).

## Manifest tuning loop (if a soak fails)

1. Lower `contextSize` for the failing model in `src/catalog/modelManifest.ts` (4096 → 2048).
2. Set `useMlock: false` in that model's `llamaConfig`.
3. Reduce `nGpuLayers` on Android.
4. Re-run the soak; do not ship until the floor tier passes 3/3.
