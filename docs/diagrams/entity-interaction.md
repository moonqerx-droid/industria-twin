# Схема взаимодействия сущностей: единый `stationId`

Один и тот же идентификатор участка (например, `st-testing`) связывает все представления.

```mermaid
flowchart LR
  ID{{"stationId = st-testing<br/>code D1"}}
  ID --- ST["Station (БД)<br/>справочник участка"]
  ID --- RS["Resource res-test-bench<br/>(stationId)"]
  ID --- PN["ProcessNode pn-testing<br/>(stationId) → мнемосхема"]
  ID --- SP["ScenarioStationParameter<br/>(scenarioId, stationId): вместимость, время, ставка"]
  SP --> CFG["buildSimulationConfig → StationConfig.stationId"]
  CFG --> ENG["runSimulation: StationState, события QUEUE_ENTER/PROCESS_*"]
  ENG --> SM["StationMetric (runId, stationId, metricKey)"]
  SM --> RD["RunDetailDto.stations[] + ranking (узкое место)"]
  ID --- POI["PointOfInterest poi-testing<br/>(stationId, cameraPresetId cam-testing)"]
  ID --- SA["3D StationAnchor<br/>STATION_LAYOUT['st-testing']"]
  RD --> SV["StationView (lib/views.ts)"]
  SV --> SPN["StationPanel / StationTable / UtilizationChart"]
  SV --> SA
  SEL["useSelection.selectStation(stationId)"] --> PN & SA & SPN
  SPN --> CMP["/compare?station=st-testing"]
```

Карточки 3D-тура не содержат собственных данных: все числа берутся из `RunDetailDto` выбранного прогона (через `buildStationViews`) или из кадров `SimulationEventLog.snapshotsJson`.
