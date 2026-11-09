# Контракт 3D-сцены

Источник значений в коде: `src/components/factory3d/sceneContract.ts`. Документ и код должны меняться вместе.

## Система координат и единицы

* Правая система, ось **Y — вверх**, ось **X — направление потока изделия** (слева направо, от приёмки к отгрузке), ось **Z — к зрителю**.
* 1 единица = **1 метр**. Начало координат — центр цеха на уровне пола (y = 0).
* Углы — радианы. Цвета — sRGB hex.
* Цех: 70 × 36 м, высота стен 7 м (`HALL`). Передняя и боковые стены понижены для обзора.

## Участки

| stationId | Код | Зона | Центр (x, y, z) | Размер зоны X × Z, м | Тип модели |
|---|---|---|---|---|---|
| `st-receiving` | A1 | Приёмка | (−26, 0, −6) | 12 × 11 | warehouse: 3 стеллажа + посты комплектации |
| `st-machining` | B1 | Механообработка | (−11, 0, −6) | 13 × 11 | machining: обрабатывающие центры ЧПУ |
| `st-assembly` | C1 | Сборка | (3.5, 0, −6) | 12 × 11 | assembly: посты с порталом и талью |
| `st-testing` | D1 | Испытания | (17, 0, −6) | 11 × 11 | testing: гидравлические стенды с баком |
| `st-rework` | D2 | Испытания (доработка) | (17, 0, 11) | 11 × 8 | rework: верстак, инструментальный щит |
| `st-packing` | E1 | Отгрузка | (29.5, 0, −6) | 10 × 11 | shipping: паллетообмотчик, паллеты |

Число экземпляров оборудования на участке = вместимость ресурса из параметров выбранного прогона (`StationMetric.capacity`). Пример: сценарий «Дополнительный сборочный пост» показывает три поста вместо двух.

## Конвейеры

| id | От | До |
|---|---|---|
| `cv-main` | (−31, 0, 1.5) | (34, 0, 1.5) |
| `cv-rework-out` | (22.5, 0, 2.6) | (22.5, 0, 7.5) |
| `cv-rework-back` | (12.5, 0, 7.5) | (12.5, 0, 2.6) |

## Камеры

| id | Назначение | Позиция | Цель |
|---|---|---|---|
| `cam-overview` | Общий изометрический план | (22, 30, 36) | (2, 0, 0) |
| `cam-top` | План сверху | (2, 62, 6) | (2, 0, 2) |
| `cam-receiving`, `cam-machining`, `cam-assembly`, `cam-testing` | Приближение к участку | центр + (7, 8, 14) | (x, 1.2, z + 1) |
| `cam-rework` | Доработка | центр + (6, 7, 12) | (x, 1.2, z + 1) |
| `cam-packing` | Отгрузка | центр + (−5, 8, 14) | (x, 1.2, z + 1) |

Обзорный ракурс и план сверху автоматически вписывают габариты цеха в обе оси окна (`cameraFraming.ts`); позиции в таблице задают направление обзора. При изменении размеров окна кадрирование пересчитывается.

Переход — экспоненциальное сглаживание позиции и цели (`FactoryCameraController`, k = 1 − e^(−3.2·dt)); прерывается действием пользователя; при `prefers-reduced-motion` — мгновенный.

## Точки интереса

| poiId | stationId | Камера | Метрики карточки |
|---|---|---|---|
| `poi-overview` | — | `cam-overview` | completed, cycleTimeAvgMin, utilizationAvg |
| `poi-receiving` | `st-receiving` | `cam-receiving` | utilization, avgWaitMin, avgQueueLength |
| `poi-machining` | `st-machining` | `cam-machining` | utilization, avgQueueLength, throughputPerHour |
| `poi-assembly` | `st-assembly` | `cam-assembly` | utilization, avgWaitMin, queueAtEnd |
| `poi-testing` | `st-testing` | `cam-testing` | utilization, avgQueueLength, avgWaitMin |
| `poi-rework` | `st-rework` | `cam-rework` | operationsCompleted, utilization, avgWaitMin |
| `poi-packing` | `st-packing` | `cam-packing` | throughputPerHour, utilization, queueAtEnd |

Маршрут `tour-main`: overview → receiving → machining → assembly → testing → rework → packing. Данные точек интереса и маршрута хранятся в БД (`PointOfInterest`, `Tour`, `TourStop`), значения метрик — из выбранного прогона.

## Контракты компонентов

| Компонент | Вход | Ответственность |
|---|---|---|
| `FactoryCanvas` | `stations: StationSceneData[]` | Canvas, DPR, тени, фон, порядок слоёв |
| `FactoryEnvironment` | — | Свет, пол, стены, колонны, разметка зон (текстуры canvas) |
| `FactoryLayout` | `stations` | По одному `StationAnchor` на stationId + `ProductionItems` |
| `StationAnchor` | `StationSceneData` | Группа участка (`name = stationId`, `userData.stationId`), обработка выбора, подсветка, табличка |
| `EquipmentModel` | `kind, capacity, busy, statusColor, footprint` | Геометрия оборудования; без бизнес-логики |
| `ConveyorSystem` | `CONVEYORS` | Роликовые конвейеры (instancing) |
| `ProductionItems` | `queues: Record<stationId, number>` | Изделия в очередях (3 InstancedMesh на сцену) |
| `FactoryCameraController` | `useScene.cameraPresetId/cameraRequest` | OrbitControls + перелёты |
| `PointOfInterest` / `MetricsOverlay` | `StationSceneData` | HTML-табличка с кнопкой точки интереса |
| `StationHighlight` | цвет, выбран/наведён | Кольцо на полу |
| `SceneQualityController` | `useScene.quality` | Адаптивное качество (DPR, тени) |
| `TourNavigation` (в `FactoryTour`) | `TourDto` | Остановки, «Назад/Далее», автоэкскурсия |
| `FactoryPlan2D` | `stations` | Резервный план без WebGL |

```ts
interface StationSceneData {
  stationId: StationId; code: string; shortName: string;
  capacity: number;            // единиц ресурса
  status: "normal" | "high" | "critical" | null;
  busy: number;                // занятые единицы (тур: среднее; воспроизведение: кадр)
  queue: number;               // изделий в очереди
  utilization: number | null;  // доля 0..1
  poiId: string | null;
}
```

## Визуальное отражение метрик

| Метрика | Отображение |
|---|---|
| Статус участка (загрузка, накопление очереди) | Цвет кольца, точка на табличке, секция сигнальной колонны: зелёный — норма, янтарный — высокая загрузка, красный — перегрузка |
| Занятость ресурса | Число «активных» единиц: светится колонна, работает шпиндель/стрелка манометра, на посту стоит насос и работник |
| Очередь | Паллеты с насосами перед участком (1 модель = 1 изделие, до 14) |
| Вместимость | Число экземпляров оборудования |
| Текущее время (воспроизведение) | Табличка «Модельное время», НЗП, отгружено |

Режим «Экскурсия» — средние по репликациям; «Воспроизведение» — кадры с шагом 5 мин репликации №1. Анимации (шпиндель, стрелка, обмотчик) включаются только у занятого по данным оборудования и не изображают движение конкретных изделий.

## Форматы ассетов

Внешние модели — glTF 2.0 binary (`.glb`), метры, Y-вверх, pivot в центре основания, ≤ 15 тыс. треугольников на единицу оборудования, PBR-материалы (metallic-roughness), текстуры ≤ 1024² (KTX2 допускается). Подключение — см. `ASSET_MANIFEST.md`.

## Ограничения производительности

* DPR ≤ 1.75 (высокое качество), 1 (низкое); тени только в высоком качестве, одна карта 1024².
* Общие геометрии/материалы на Canvas (`SceneResourcesProvider`), освобождаются при размонтировании.
* Повторяющиеся объекты — instancing (ролики, стойки, изделия).
* Сцена загружается лениво (`next/dynamic`, `ssr: false`); на экранах < 768 px стартует низкое качество.
* Отражения металлов — локальная карта окружения 128² с тремя Lightformer, вычисляется один раз, без загрузки внешних ассетов.
* Анимации оборудования и пульсация выбранного участка учитывают `prefers-reduced-motion`.
* Полноэкранный режим сохраняет управление сценой и таблички участков.
* Постобработка и физика не используются. Конкретные значения FPS не заявляются: качество выбирается по `PerformanceMonitor` в браузере пользователя.
