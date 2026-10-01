# The Castaway

A deterministic island simulation that runs in real time (Europe/London), now delivered as a **Windows PC application**. Watch Tomas live in a full 3D island with displaced ocean geometry, sun and moon shadows, weather, firelight and quiet procedural sound.

[Download the Windows installer or portable ZIP](https://github.com/TheRealGD2X/castaway/releases/latest). The [project website](https://therealgd2x.github.io/castaway/) is the desktop download page. See [installation, controls and local saves](desktop/README.md) and [the renderer's equations, assumptions and limits](desktop/RENDERING.md). Windows 11 x64 and a dedicated GPU are the desktop target; the release is unsigned.

`desktop/` contains the isolated simulation worker, native Electron shell and Three.js WebGPU observer. The original simulator in `v2/src/` retains its physical minute, seeded randomness, conservation ledgers, planning and thought APIs. Rendering, quality and audio cannot change the authoritative world. The original game remains archived at `v1.html`; the previous browser observer remains in `v2/` for reference and regression work.

`data/v2/` holds the canonical checkpoint and Tomas's thoughts. The existing scheduled mind routine still updates these files a few times a day through the same [tools and brief interface](v2/MIND.md). The desktop checks that feed, catches up every original physical step and saves locally. It can continue offline with the last available thoughts.

The island changes as Tomas lives: paths wear, plants regrow, weather strains installed buildings, and finite materials become tools, clothing, pottery and a furnished home. The journal shows real milestones, words and camp state. Construction geometry, supports, bindings, surfaces, covers and paid progress determine both usefulness and the desktop reconstruction. No rescue or scripted story has been added.

Rain feeds soil, puddles, groundwater, lake and stream. Vegetation consumes finite reserves, sunlight, water and nutrients. Shelter retains heat and moisture; meals have mass, temperature, age and preparation progress. Loads and hills affect effort; flowing water erodes and deposits soil. The connected food web, animal digestion, thermal budgets, sight, scent, hearing and memories retain their original coupling. Mechanical contacts still drive progress, tool wear, poses and work sounds. See [the simulation equations and conservation tests](v2/SIMULATION.md) and [design principles](v2/DESIGN.md).

The ocean stores water, salt, heat, nutrients, oxygen, marine populations and sediment across offshore, shelf and coastal grids. Currents, tides, rivers, spray and drifting wood connect it to shore. Its saved directional wave action and phase drive vertex displacement, normals, floating-object poses and surf sound. Click the sea to inspect its actual salt inventory, depth, current, temperature, waves and dissipated energy. See [the ocean model, resolution and limits](v2/OCEAN.md).

The soundscape remains generated from the world and listener position, with no recorded repeating ambience. The physical and graphical models are deterministic reduced approximations with documented assumptions. Compatibility and conservation tests establish numerical consistency; they do not establish complete real-world accuracy or resolve missing CFD, spectral light transport, biomechanics or acoustics.

For development and Windows packaging, follow [desktop/README.md](desktop/README.md). Before release, run the original `v2` checks, desktop golden/replay tests, actual native WebGPU QA, and production clock/save/restart QA. The packaged build manifest records the commit, original simulation fingerprint and application tree hash. Desktop test fixtures do not change the live worker's world.
