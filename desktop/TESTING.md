# Windows release verification

Version 1.0.0 preserves the simulator at `85e2027` and its byte fingerprint `c494638a78a4b3d5464f9f9d04b56997f659e7a781043bceabc0edaf408be2b2`. Golden futures were captured before the desktop implementation. Do not regenerate them to accommodate a failure. The packaging tool also checks that the bundled simulation fingerprint and complete application tree match staging.

The original generation, fire, body, construction and health checks pass. The five-day life test ends alive with exact checkpoint replay. The 60-day simulation test passes exact checkpoint replay. Original ocean, coupled atmosphere/ecology, sound, inspection and work-pose checks pass. The unchanged long simulation measured 7.856 s per simulated day while other verification was running; the historical 0.5 s/day target is not met by this baseline. Rendering settings never skip physical steps to reach a display frame rate.

`pnpm test` checks known monochromatic wave energy and phase, the ten-second period, analytic derivatives, dry cells, nest edges/corners, world-aligned mesh topology, independent tabulated refractive-index data, solar/lunar geometry, read-only projections, original golden futures, irregular scheduling, production thoughts, a real worker and atomic save recovery.

`pnpm test:native` launches an actual sandboxed Electron renderer and exercises WebGPU compute readback, long-clock phases, High/Ultra, journal, inspections, sound, camera, settings, save/export/fullscreen and renderer reload. It compares the serialized physical world before and after observer operations. The daylight, sunset, moonlit, rain, strong-wind, fire and camp fixtures are actual simulator snapshots. Snow is tested only when the winter generator finds a real snow event; no such event was found in this release's fixture search. Image checks reject a black moonlit island and overbright dawn fog/sky. Quality changes retain valid shadow resources, including lights that were initially inactive.

For reproducible native captures and frame rates on Windows, from `desktop/`:

```powershell
node test/fixtures.js
$env:QA_VISIBLE='1'
pnpm test:native
pnpm test:production
```

The reference native run on a Ryzen 7 9800X3D, nominal 64 GB RAM (61.6 GiB usable) and RTX 5090 used NVIDIA's Blackwell WebGPU adapter. Five-second visible-window samples of the day-one island scene at exactly 3840 × 2160 measured approximately 120 FPS on High at the 120 FPS cap, and 67 FPS on Ultra. High has 245,884 water vertices; Ultra has 381,580. These are measured samples of that scene, not minimum frame-rate guarantees for every weather, camera or older world. See [native-reference.json](test/native-reference.json). The renderer's draw-call counter in that diagnostic is cumulative and must not be presented as calls per frame.

GPU readback agrees with the double-precision wave observer within 0.000209 m on the shelf and 0.000001 m on the coast in the sampled cases, including a 100-year physical clock. Scene fixtures, sound, inspection and settings leave the saved physical state unchanged. Native renderer validation reports no errors in the passing run.

`pnpm test:production` starts without a frozen test minute, catches up to the current UK minute and compares the actual native snapshot with the original simulator replayed from the production checkpoint and thoughts. It saves, closes, checks the on-disk hash/fingerprint, restarts and checks the resumed world. `QA_EXE` selects the actual packaged or installed executable; `QA_OUTPUT` and `QA_FIXTURES` select isolated test directories. A desktop release must pass these checks on the distributable too.

The Windows installer is per-user and preserves application data during removal/update. The ZIP contains all runtime and browser assets, with no development Node packages. `build-manifest.json` identifies the source commit, simulation fingerprint, application-tree hash and pinned dependencies. `SHA256SUMS.txt` identifies both distributables. The project has no signing certificate, so the binaries are unsigned.
