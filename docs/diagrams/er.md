# ER-диаграмма (prisma/schema.prisma)

```mermaid
erDiagram
  Role ||--o{ User : "roleId"
  User ||--o{ Session : "userId"
  User |o--o{ AuditLog : "userId (SetNull)"
  User |o--o{ Scenario : "createdById"
  User |o--o{ SimulationRun : "createdById"
  Factory ||--o{ ProductionProcess : "factoryId"
  Factory ||--o{ Station : "factoryId"
  Factory ||--o{ PointOfInterest : "factoryId"
  Factory ||--o{ Tour : "factoryId"
  Station ||--o{ Resource : "stationId"
  ProductionProcess ||--o{ ProcessNode : "processId"
  ProductionProcess ||--o{ ProcessEdge : "processId"
  Station |o--o{ ProcessNode : "stationId"
  ProcessNode ||--o{ ProcessEdge : "fromNodeId"
  ProcessNode ||--o{ ProcessEdge : "toNodeId"
  ProductionProcess ||--o{ Scenario : "processId"
  Scenario |o--o{ Scenario : "parentScenarioId (копия)"
  Scenario ||--o{ ScenarioStationParameter : "scenarioId"
  Station ||--o{ ScenarioStationParameter : "stationId"
  Scenario ||--o{ SimulationRun : "scenarioId"
  SimulationRun ||--o{ AggregateMetric : "runId"
  SimulationRun ||--o{ StationMetric : "runId"
  Station ||--o{ StationMetric : "stationId"
  SimulationRun ||--o{ ReplicationResult : "runId"
  SimulationRun ||--o| SimulationEventLog : "runId"
  Station |o--o{ PointOfInterest : "stationId"
  PointOfInterest ||--o{ MediaAsset : "poiId"
  Tour ||--o{ TourStop : "tourId"
  PointOfInterest ||--o{ TourStop : "poiId"

  Role {
    string id PK "admin|engineer|viewer"
    string name
    string description
  }
  User {
    string id PK
    string login UK
    string displayName
    string passwordHash
    string roleId FK
    boolean isActive
    datetime lastLoginAt
  }
  Session {
    string id PK
    string userId FK
    datetime expiresAt
  }
  AuditLog {
    string id PK
    datetime at
    string userId FK "null после удаления пользователя"
    string userLogin "псевдоним или «удалённый пользователь»"
    string action
    string entityType
    string entityId
    string details
  }
  Factory {
    string id PK
    string name
    boolean isSynthetic
  }
  ProductionProcess {
    string id PK
    string factoryId FK
    string name
    int version
  }
  Station {
    string id PK "stationId"
    string factoryId FK
    string code "A1..E1"
    string name
    string kind
    int sortOrder
  }
  Resource {
    string id PK
    string stationId FK
    string name
    string kind
    string unitName
  }
  ProcessNode {
    string id PK "pn-*"
    string processId FK
    string type
    string stationId FK
    float x
    float y
  }
  ProcessEdge {
    string id PK "pe-*"
    string fromNodeId FK
    string toNodeId FK
    string condition
  }
  Scenario {
    string id PK
    string processId FK
    string name
    boolean isBaseline
    float horizonMin
    float arrivalRatePerHour
    float defectProbability
    int maxReworkCycles
    int seed
    int replications
  }
  ScenarioStationParameter {
    string id PK
    string scenarioId FK
    string stationId FK
    int capacity
    string distribution
    float timeMin
    float timeMode
    float timeMax
    float timeMean
    float timeSd
    float hourlyCostRub
    float consumablesPerOperationRub
    float mtbfMin "null — без отказов"
    float mttrMin
  }
  SimulationRun {
    string id PK
    string scenarioId FK
    string status
    string engineVersion
    int baseSeed
    int replications
    string configJson
    int durationMs
  }
  AggregateMetric {
    string id PK
    string runId FK
    string metricKey
    string unit
    int n
    float mean
    float sd
    float ci95
  }
  StationMetric {
    string id PK
    string runId FK
    string stationId FK
    string metricKey
    float mean
    float sd
    float ci95
  }
  ReplicationResult {
    string id PK
    string runId FK
    int replicationIndex
    int seed
    string aggregateJson
    string stationsJson
  }
  SimulationEventLog {
    string runId PK,FK
    int formatVersion
    int eventCount
    boolean truncated
    string eventsJson
    string snapshotsJson
  }
  PointOfInterest {
    string id PK "poi-*"
    string stationId FK
    string title
    string cameraPresetId
    string metricKeys
  }
  Tour {
    string id PK
    string name
    string audience
  }
  TourStop {
    string id PK
    string tourId FK
    int order
    string poiId FK
    string narrative
  }
  MediaAsset {
    string id PK
    string poiId FK
    string kind
    string uri
    boolean isPlaceholder
  }
```

Уникальные ограничения: `User.login`; `Station(factoryId, code)`; `ScenarioStationParameter(scenarioId, stationId)`; `AggregateMetric(runId, metricKey)`; `StationMetric(runId, stationId, metricKey)`; `ReplicationResult(runId, replicationIndex)`; `TourStop(tourId, order)`.
