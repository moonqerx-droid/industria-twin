# Архитектура: слои и модули

```mermaid
flowchart TB
  subgraph P["A. Presentation — src/app/(app)/**, src/components/**"]
    P1["/dashboard"] --- P2["/process"] --- P3["/scenarios"] --- P4["/compare"] --- P5["/factory"] --- P6["/documentation"] --- P7["/admin"] --- P8["/login"]
    PC["components/process (ProcessMnemonic, StationPanel, StationTable)<br/>components/charts (Recharts)<br/>components/scenarios (ScenarioStudio)<br/>components/compare (CompareView)<br/>components/factory3d (R3F-сцена, FactoryTour, FactoryPlan2D)"]
    ST["store/selection.ts — selectStation(stationId)<br/>factory3d/sceneStore.ts — режим, камера, кадр воспроизведения"]
  end
  subgraph AP["B. Application — src/server/services/**, src/app/api/**"]
    A1[scenarioService]:::s --- A2[simulationService]:::s --- A3[comparisonService]:::s --- A4[modelService]:::s --- A5[tourService]:::s --- A6[seedService]:::s
    API["Route Handlers: /api/auth/*, /api/model, /api/resources, /api/scenarios/*, /api/runs/*, /api/compare, /api/pois, /api/tour, /api/stations/[id]/metrics, /api/admin/users"]
  end
  subgraph D["C. Domain — src/domain/** (без зависимостей от React, БД, сети)"]
    D1["simulation/engine.ts — ДСМ<br/>eventQueue.ts, rng.ts, distributions.ts<br/>replications.ts, statistics.ts, types.ts"]
    D2["model/demoData.ts, metrics.ts, scenarioConfig.ts, loadEstimate.ts"]
    D3["analysis/bottleneck.ts, comparison.ts"]
  end
  subgraph I["D. Infrastructure"]
    I1["server/db.ts — Prisma Client"] --- I2[("SQLite: prisma/dev.db<br/>schema.prisma + migrations")]
    I3["server/auth — JWT HS256 (jose), bcryptjs, Session"] --- I4["server/rateLimit.ts"] --- I5["server/validation/schemas.ts — Zod"] --- I6["server/http.ts — ApiError, обработка ошибок"]
    I7["middleware.ts — проверка токена для страниц"]
  end
  P -->|fetch JSON| API
  P -->|Server Components вызывают сервисы напрямую| AP
  API --> AP
  AP --> D
  AP --> I1
  API --> I3 & I4 & I5 & I6
  classDef s fill:#16202d,stroke:#5bb8d6,color:#e4ecf4
```

Правило зависимостей: Presentation → Application → Domain; Infrastructure используется Application. Домен не импортирует ни React, ни Prisma; проверяется тем, что `tests/unit` выполняют движок без БД.
