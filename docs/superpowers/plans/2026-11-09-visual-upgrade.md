# INDUSTRIA TWIN visual upgrade

Goal: combine a readable industrial control interface with a polished factory presentation.
Architecture: preserve stationId, simulation, API and database contracts. Improve existing procedural Three.js assets and shared UI components without new dependencies.

- [x] Refine shared palette, navigation, panels and KPI hierarchy.
- [x] Detail CNC machines, pumps, workstations and testing equipment using shared geometry/materials.
- [x] Improve hall lighting, architectural details, floor and camera resizing; preserve adaptive quality and 2D fallback.
- [x] Improve viewport controls and status legend without replacing run data.
- [x] Verify TypeScript, unit/integration tests, production build and browser smoke/responsive tests.

Review focus: narrow screens; WebGL fallback; capacity-driven model count; replay state; reduced motion. Existing e2e tests cover selection, replay, fallback and responsive layouts. Visual styling is verified through rendered screenshots.
