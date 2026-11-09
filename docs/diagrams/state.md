# UML: диаграммы состояний

## Изделие (UnitState в src/domain/simulation/engine.ts)

Итоговые исходы `UnitOutcome`: `COMPLETED`, `SCRAPPED`, `WIP`.

```mermaid
stateDiagram-v2
  [*] --> CREATED: ARRIVAL
  CREATED --> WAITING: QUEUE_ENTER (первый участок маршрута)
  WAITING --> IN_PROCESS: PROCESS_START (свободна единица ресурса)
  IN_PROCESS --> WAITING: PROCESS_FINISH, следующий участок маршрута
  IN_PROCESS --> QUALITY_CHECK: PROCESS_FINISH на st-testing
  QUALITY_CHECK --> WAITING: годен → очередь st-packing
  QUALITY_CHECK --> REWORK: дефект и reworkCycles < maxReworkCycles
  REWORK --> WAITING: очередь st-rework, после доработки — снова st-testing
  QUALITY_CHECK --> SCRAPPED: дефект и reworkCycles = maxReworkCycles
  IN_PROCESS --> COMPLETED: PROCESS_FINISH на последнем участке (DEPARTURE)
  WAITING --> WIP: HORIZON_END
  IN_PROCESS --> WIP: HORIZON_END
  COMPLETED --> [*]
  SCRAPPED --> [*]
  WIP --> [*]
```

## Сценарий

```mermaid
stateDiagram-v2
  [*] --> Draft: создать / скопировать
  Draft --> Saved: Сохранить (PUT, валидация Zod)
  Saved --> Draft: изменить параметры
  Saved --> Simulated: Запустить моделирование
  Simulated --> Draft: изменить параметры (прошлые прогоны неизменны — снимок configJson)
  Simulated --> Simulated: повторный запуск
  Saved --> [*]: удалить (кроме базового)
  Simulated --> [*]: удалить (каскадно с прогонами)
  note right of Saved: Базовый сценарий (isBaseline) — параметры заблокированы, удаление запрещено
```

## Прогон моделирования (SimulationRun.status)

```mermaid
stateDiagram-v2
  [*] --> Validating: POST /api/scenarios/:id/run
  Validating --> Rejected: 400/403/422/429
  Validating --> Running: runReplications (синхронно)
  Running --> completed: сохранение в транзакции
  Running --> Rejected: ошибка движка (лимит событий)
  completed --> Deleted: DELETE /api/runs/:id (admin) или удаление сценария
  Rejected --> [*]
  Deleted --> [*]
```
Статус `failed` предусмотрен схемой, но текущая реализация не сохраняет неуспешные прогоны: ошибка возвращается клиенту.
