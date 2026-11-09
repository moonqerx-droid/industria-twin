# Архитектура INDUSTRIA TWIN

Документ описывает фактическую структуру репозитория. Диаграммы — в [`diagrams/`](diagrams/README.md).

## 1. Слои

| Слой | Назначение | Модули |
|---|---|---|
| Presentation | Страницы и компоненты UI, 3D-сцена | `src/app/(app)/*` (dashboard, process, scenarios, compare, factory, documentation, admin), `src/app/login`, `src/components/**`, `src/store/selection.ts` |
| Application | Сценарии, запуск моделирования, хранение результатов, сравнение, состояние тура | `src/server/services/*`, `src/app/api/**/route.ts` |
| Domain | Модель производства, симулятор, метрики, анализ | `src/domain/simulation/*`, `src/domain/model/*`, `src/domain/analysis/*` |
| Infrastructure | БД, аутентификация, валидация, ограничение частоты, обработка ошибок | `prisma/*`, `src/server/db.ts`, `src/server/auth/*`, `src/server/validation/schemas.ts`, `src/server/rateLimit.ts`, `src/server/http.ts`, `src/middleware.ts` |

Правило зависимостей: `domain` не импортирует ничего из `server`, `app`, `components`, React, Prisma или Three.js. Симулятор (`src/domain/simulation`) — чистый TypeScript и тестируется без окружения.

## 2. Симуляционный движок

* `rng.ts` — генератор sfc32 с инициализацией splitmix32; `deriveSeed(base, i)` для репликаций (31 бит, хранится в INT).
* `distributions.ts` — fixed, exponential, uniform, triangular, normal (усечённое снизу); все выборки ≥ 0.
* `eventQueue.ts` — календарь событий (двоичная куча), ключ сортировки: время → приоритет типа → порядковый номер.
* `engine.ts` — `runSimulation(config)`: валидация конфигурации, обработка событий, интегралы занятости/очередей/НЗП, кадры состояния, журнал событий, итоговые метрики.
* `replications.ts` — `runReplications(config, R)`: R прогонов, сводная статистика (`statistics.ts`: среднее, СКО, 95% ДИ по t-распределению).

Приоритеты событий в один момент времени: `PROCESS_FINISH` (0) → `ARRIVAL` (1) → `HORIZON_END` (9). Освободившийся ресурс сразу берёт следующее задание (FIFO), затем завершённое изделие маршрутизируется дальше.

## 3. Хранение результатов

`SimulationRun` содержит неизменяемый снимок параметров (`configJson`) — результаты остаются воспроизводимыми после редактирования сценария.

| Данные | Таблица | Обоснование |
|---|---|---|
| Сводные метрики по репликациям | `AggregateMetric` (runId, metricKey) | Запросы по ключу метрики, индекс уникальности |
| Метрики участков | `StationMetric` (runId, stationId, metricKey) | Связь с `Station` по stationId — единый источник для процесса, 3D и графиков |
| Итоги репликаций | `ReplicationResult` | Оценка разброса и статистическое сравнение |
| Журнал событий и кадры | `SimulationEventLog` (1 строка на прогон, JSON) | Журнал читается только целиком для воспроизведения; ~1,5 тыс. событий на прогон; построчное хранение не даёт выгоды в запросах. Формат: `[t, тип, unitId, индекс участка, дефект]`, версия формата хранится |

## 4. Единый источник истины: stationId

Справочник участков — `STATIONS` в `src/domain/model/demoData.ts` → таблица `Station`. Один и тот же `stationId` (например, `st-testing`) используется в:

* `ProcessNode.stationId` — узел мнемосхемы и BPMN;
* `Resource.stationId` — ресурс участка;
* `ScenarioStationParameter.stationId` — параметры сценария;
* `StationConfig.stationId` — конфигурация движка;
* `StationMetric.stationId` — результат прогона;
* `PointOfInterest.stationId` — точка интереса тура;
* `STATION_LAYOUT[stationId]` — объект 3D-сцены (`StationAnchor`, `userData.stationId`).

Выбор участка — `selectStation(stationId)` (`src/store/selection.ts`, Zustand). Состояние синхронизируется с параметром URL `station`, поэтому переход «мнемосхема → 3D → сравнение» сохраняет выбор. Подписчики: `ProcessMnemonic`, `StationTable`, `UtilizationChart`, `StationAnchor` (подсветка), `StationPanel`, `FactoryPlan2D`, карточка точки интереса. Карточки 3D-тура не содержат собственных данных: метрики берутся из выбранного `SimulationRun`.

## 5. API

| Метод и путь | Право | Назначение |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | — | Сессия |
| `GET /api/model` | model:read | Фабрика, участки, ресурсы, граф процесса |
| `GET /api/resources` | model:read | Ресурсы |
| `GET/POST /api/scenarios`, `GET/PUT/DELETE /api/scenarios/[id]` | scenario:read / write / delete | CRUD сценариев (базовый защищён: 409) |
| `POST /api/scenarios/[id]/copy` | scenario:write | Копия сценария |
| `POST /api/scenarios/[id]/run` | simulation:run | Запуск моделирования (лимит 12/мин на пользователя) |
| `GET /api/runs`, `GET/DELETE /api/runs/[id]` | run:read / run:delete | Прогоны |
| `GET /api/runs/[id]/replay` | run:read | Журнал событий и кадры состояния |
| `GET /api/compare?baseline=&runs=` | run:read | Сравнение (до 3 альтернатив) |
| `GET /api/pois`, `GET /api/tour?runId=` | model:read | Точки интереса, маршрут, метрики прогона |
| `GET /api/stations/[id]/metrics?runId=` | run:read | Метрики участка |
| `GET /api/admin/users` | users:read | Пользователи (без хешей) |

Ошибки возвращаются в едином формате `{ error: { code, message, details } }`: 400 (валидация Zod), 401, 403 (права или CSRF), 404, 409 (защищённый базовый сценарий), 422 (некорректная модель), 429 (частота), 500.

## 6. Безопасность

* Пароли — bcrypt (10 раундов); при неизвестном логине выполняется сравнение с хешем-пустышкой (выравнивание времени ответа).
* Сессия: JWT HS256 в cookie `it_session` (HttpOnly, SameSite=Lax, Secure в production) + запись `Session` в БД (отзыв при выходе, срок 8 ч).
* `middleware.ts` (Edge) проверяет подпись токена для страниц; API и серверные компоненты проверяют сессию в БД и права роли.
* Изменяющие запросы проверяют заголовок `Origin` (защита от CSRF поверх SameSite).
* Ограничение частоты входа (10 за 5 мин на логин+IP) и запусков моделирования; ограничение тяжести прогона (ожидаемые задания × репликации ≤ 150 000).
* Заголовки: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

## 7. Аналитика

* `classifyStation`: по эффективной загрузке `effectiveLoad` = занятость + доля времени в ремонте: «норма» < 75%, «высокая загрузка» ≥ 75%, «перегрузка» ≥ 90% или очередь на конец ≥ 2 × вместимость (и ≥ 3).
* `rankBottlenecks`: статус → эффективная загрузка → среднее ожидание → stationId (детерминированно).
* `compareMetric`: разность средних, относительная разность (null при нулевой базе), 95% ДИ разности — парный по репликациям (CRN), если переданы значения пар, иначе Уэлч; вердикт с учётом направления улучшения показателя; поле `method`.
* `adviseResources` (`analysis/advisor.ts`): варианты «+1 ресурс» на каждом участке и на двух самых загруженных; расчёт с тем же seed, парная оценка, порог практической значимости 1%, ранжирование по вердикту, стоимости единицы и циклу. Сервис `advisorService` кэширует результат по снимку параметров прогона.
* `listPoiCases` (`tourService`): карточки кейсов тура = сравнение последнего прогона сценария кейса с последним прогоном базового.
* `estimateLoads` (студия сценариев): аналитическая оценка ρ = λ·v·E[S]/c — только подсказка до запуска.

## 8. 3D-модуль

См. [`3d/SCENE_CONTRACT.md`](3d/SCENE_CONTRACT.md). Компоненты: `FactoryCanvas`, `FactoryEnvironment`, `FactoryLayout` (в `FactoryCanvas.tsx`), `StationAnchor`, `EquipmentModel` (`models.tsx`), `ConveyorSystem`, `ProductionItems` (ProductionItem, instancing), `FactoryCameraController`, `TourNavigation` (в `FactoryTour.tsx`), `PointOfInterest` и `MetricsOverlay` (в `StationAnchor.tsx`), `StationHighlight`, `SceneQualityController`, `FactoryPlan2D` (резервный режим).
