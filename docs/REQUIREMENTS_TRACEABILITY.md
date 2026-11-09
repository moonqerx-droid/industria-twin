# Матрица трассируемости требований

Пункты задания организаторов (`docs/source/Prezentatsia_2kh_khakaton_1.pptx`, слайды 6–12) и требования ТЗ (`docs/TZ.md`: BR, FR, NFR) сопоставлены с файлами реализации и способом проверки. «Авто» — автоматический тест; «Ручн.» — ручная проверка из `TEST_PLAN.md`.

## A. Этап I — проектирование (слайды 6, 7, 11)

| Пункт задания | Артефакт | Проверка |
|---|---|---|
| 01 Системный анализ процесса и проблемы | `docs/TZ.md` §2–4, `docs/DATA_ASSUMPTIONS.md` | Ручн.: рецензия |
| 02 Мнемосхема | `docs/diagrams/mnemonic.md`; интерактивная — `src/components/process/ProcessMnemonic.tsx` (`/process`) | Авто: e2e «выбор участка на мнемосхеме…» |
| 03 Требования (бизнес, функц., нефункц.), ограничения, критерии приёмки | `docs/TZ.md` §7–10, `docs/ACCEPTANCE_CRITERIA.md` | Ручн.: рецензия |
| 04 BPMN | `docs/diagrams/process.bpmn` (BPMN 2.0 XML, id = `pn-*`, `pe-*` из `PROCESS_NODES/EDGES`) | Авто: XML разбирается (minidom); тест `model.test.ts` «каждый участок имеет узел процесса…» |
| 04 UML: варианты использования, состояния, действия, последовательности | `docs/diagrams/use-case.md`, `state.md`, `activity.md`, `sequence.md` | Ручн.: сверка имён с кодом |
| 05 Связи сущностей | `docs/diagrams/entity-interaction.md`, `docs/ARCHITECTURE.md` §4 | Авто: `api.test.ts` «состояние тура содержит метрики прогона по тем же stationId» |
| 06 Проектирование БД | `prisma/schema.prisma`, `prisma/migrations/*` | Авто: миграции применяются в `tests/integration/global-setup.ts` |
| 07 ER-диаграмма | `docs/diagrams/er.md` | Ручн.: сверка с `schema.prisma` |
| 08 Макеты форм, дашборд, сцена 3D-тура | Реализованные экраны `/dashboard`, `/scenarios`, `/compare`, `/factory`, `/process` | Авто: e2e smoke, responsive |
| 09 План тестирования | `docs/TEST_PLAN.md` | — |
| Архитектура сцены и карта точек интереса | `docs/3d/SCENE_CONTRACT.md`, `docs/diagrams/poi-map.md`, `src/components/factory3d/sceneContract.ts` | Авто: `model.test.ts` (камеры и раскладка для каждого участка) |
| Структура ТЗ (введение, требования, архитектура, данные, прототип и тесты) | `docs/TZ.md` (20 разделов), `docs/ARCHITECTURE.md`, `docs/diagrams/architecture.md` | — |

## B. Этап II — прототип (слайды 8, 9, 10)

| Пункт задания | Требование | Реализация (файл → функция/компонент) | Проверка |
|---|---|---|---|
| Модель процесса: этапы, время, ресурс, стоимость | BR-01, FR-04, FR-05 | `src/domain/model/demoData.ts` (`STATIONS`, `PROCESS_NODES`, `BASELINE_PARAMETERS`); `modelService.getProductionModel` | Авто: `api.test.ts` «возвращает участки со стабильными идентификаторами…» |
| Прогон процесса при выбранной нагрузке и ресурсах | FR-11, FR-12 | `src/domain/simulation/engine.ts` → `runSimulation`; `replications.ts` → `runReplications` | Авто: `engine.test.ts` (20 тестов) |
| Поиск задержек, перегрузки, простоев | BR-02, FR-15 | `src/domain/analysis/bottleneck.ts` → `classifyStation`, `rankBottlenecks`; метрика `idleCostRub` | Авто: `analysis.test.ts` «Поиск узких мест»; e2e «дашборд показывает… узкое место» |
| Сохранение альтернатив, изменение параметров | FR-07…FR-10, FR-13 | `scenarioService.*`, `simulationService.runScenarioSimulation`; `ScenarioStudio.tsx` | Авто: `api.test.ts` «инженер создаёт сценарий», «запускает моделирование и сохраняет результат»; e2e «инженер создаёт сценарий…» |
| Сравнение «до/после» | BR-03, FR-16…FR-18 | `comparisonService.compareRuns`, `domain/analysis/comparison.ts` → `compareMetric`; `CompareView.tsx` | Авто: `api.test.ts` «сравнивает прогон с базовым»; `analysis.test.ts` «вердикт учитывает направление» |
| Метрики: время цикла, выпуск, загрузка, стоимость | FR-14 | `engine.ts` (агрегаты), `metrics.ts` (каталог, единицы) | Авто: `engine.test.ts` «стоимость рассчитывается по документированной модели», «время цикла ≥ времени обработки» |
| Дашборды и диаграммы для руководства | BR-04, FR-19, FR-20 | `src/app/(app)/dashboard/page.tsx`, `components/charts/*` | Авто: e2e «дашборд показывает рассчитанные KPI» |
| Навигация по 3D-сцене, переход между участками по маршруту | BR-05, FR-21, FR-24 | `FactoryCanvas`, `FactoryCameraController`, `FactoryTour` (маршрут) | Авто: e2e «3D-тур: сцена загружается, маршрут…» |
| Точки интереса с описаниями, медиа, показателями, практиками | FR-23 | `PointOfInterest`/`MetricsOverlay` (`StationAnchor.tsx`), карточка в `FactoryTour.tsx`, таблицы `PointOfInterest`, `MediaAsset` | Авто: e2e (poi-card `poi-testing`, `poi-receiving`) |
| Переход из тура к процессу и метрике | BR-06, FR-06, FR-28, FR-29 | `store/selection.ts` → `selectStation`; `StationPanel.tsx` (ссылки «На мнемосхеме», «Сравнить сценарии по участку») | Авто: e2e «выбор участка… переход в 3D сохраняет выбор» |
| Отражение результатов прогона в 3D | FR-25…FR-27 | `FactoryTour.tsx` (кадры `replay.snapshots`), `models.tsx` (`capacity`, `busy`), `ProductionItems.tsx` | Авто: e2e (воспроизведение, «Модельное время 05:00»); Ручн.: Р-сценарий «доп. пост» |
| Прозрачность эффективности процессов | BR-07, FR-31 | `/documentation`, `docs/DATA_ASSUMPTIONS.md`, метод в `compareRuns().method` | Ручн. |

## C. Технические ограничения (слайд 12)

| Ограничение | Требование | Реализация | Проверка |
|---|---|---|---|
| Нет интеграций с ERP, MES, 1С | NFR-03 | Внешних интеграций нет; данные в локальной SQLite | Ручн.: обзор зависимостей `package.json` |
| Базовая авторизация | FR-01…FR-03, NFR-05, NFR-06 | `server/auth/*`, `middleware.ts`, `api/auth/*` | Авто: `api.test.ts` «Аутентификация» (7 тестов), «CSRF»; e2e «Доступ» |
| Компьютер, планшет, телефон | NFR-01 | Tailwind-адаптивность, нижняя навигация, 3D низкого качества на телефоне | Авто: `responsive.spec.ts` (проекты desktop/tablet/mobile) |
| 152-ФЗ | NFR-04 | Только логин + псевдоним + хеш; срок сессии; `/documentation#privacy` | Авто: `api.test.ts` «список пользователей… не содержит хешей»; Ручн. |
| WebGL/Three.js без тяжёлых движков | NFR-02, NFR-11, FR-30 | three + R3F, процедурная геометрия, `FactoryPlan2D` | Авто: e2e «без WebGL показывается план цеха» |
| Синтетические / организаторские данные | NFR-14, FR-34 | `demoData.ts`, `SyntheticNote`, `prisma/seed.ts` (результаты считает движок) | Авто: `engine.test.ts` «все демонстрационные сценарии выполняются…» |

## D. Нефункциональные требования ТЗ

| ID | Реализация | Проверка |
|---|---|---|
| NFR-07 Ограничение частоты | `server/rateLimit.ts` | Авто: `api.test.ts` «ограничивает частоту попыток входа», «…запусков моделирования» |
| NFR-08 Воспроизводимость | `rng.ts`, `configJson` прогона | Авто: «один и тот же seed даёт идентичный результат», «повторный запуск… воспроизводит те же средние» |
| NFR-09 Лимиты прогонов | `ENGINE_LIMITS`, `scenarioParametersSchema.superRefine` | Авто: «отклоняет некорректную конфигурацию», «брак 100%: … бесконечного цикла нет» |
| NFR-10 TS strict, слои | `tsconfig.json` (strict, noUncheckedIndexedAccess), `src/domain` без зависимостей от UI | Авто: `npm run typecheck` |
| NFR-12 Русский язык | Все тексты UI и документации | Ручн. |
| NFR-13 Доступность | Видимый фокус, ARIA (`role`, `aria-pressed`, `aria-current`), клавиатура для узлов схемы и строк таблицы | Ручн. |
| NFR-15 Единые ошибки API | `server/http.ts` → `errorResponse` | Авто: статусы 400/401/403/404/409/429 в `api.test.ts` |

## E. Инварианты симулятора (раздел 15 задания)

| Инвариант | Тест (`tests/unit/engine.test.ts`) |
|---|---|
| Сохранение числа изделий (завершённые + списанные + НЗП = запущенные) | `checkInvariants` во всех сценарных тестах |
| Загрузка в диапазоне 0..100% | `checkInvariants` |
| Длительности неотрицательны | `checkInvariants`; `analysis.test.ts` «выборки неотрицательны» |
| Ресурс не обслуживает больше заданий, чем вместимость | «ресурс никогда не обслуживает больше заданий…» (по журналу событий) |
| События в допустимом временном порядке | `checkInvariants`; `api.test.ts` «журнал воспроизведения содержит упорядоченные события» |
