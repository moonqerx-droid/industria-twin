/**
 * СИНТЕТИЧЕСКИЙ демонстрационный набор данных условного предприятия «Насосный завод» (INDUSTRIA TWIN).
 *
 * Все параметры придуманы для демонстрации и НЕ являются реальными производственными показателями.
 * Обоснование каждого допущения — docs/DATA_ASSUMPTIONS.md. Этот модуль — единственный источник
 * демонстрационных данных: из него заполняется БД (prisma/seed.ts) и строятся тестовые конфигурации.
 */
import type { DurationDistribution } from "../simulation/distributions";
import type { FailureConfig } from "../simulation/types";

export const FACTORY_ID = "factory-pump-01";
export const PROCESS_ID = "process-pump-assembly";

export const STATION_IDS = [
  "st-receiving",
  "st-machining",
  "st-assembly",
  "st-testing",
  "st-rework",
  "st-packing",
] as const;
export type StationId = (typeof STATION_IDS)[number];

export function isStationId(value: string): value is StationId {
  return (STATION_IDS as readonly string[]).includes(value);
}

/** Основной маршрут изделия (без участка доработки, на который изделие попадает только при дефекте). */
export const MAIN_ROUTE: StationId[] = ["st-receiving", "st-machining", "st-assembly", "st-testing", "st-packing"];
export const QUALITY_STATION: StationId = "st-testing";
export const REWORK_STATION: StationId = "st-rework";

export type StationKind = "warehouse" | "machining" | "assembly" | "testing" | "rework" | "shipping";

export interface StationDefinition {
  id: StationId;
  code: string;
  name: string;
  shortName: string;
  zone: string;
  kind: StationKind;
  sortOrder: number;
  description: string;
  resource: {
    id: string;
    name: string;
    kind: "worker" | "machine" | "workstation" | "bench" | "line";
    unitName: string;
    description: string;
  };
}

export const STATIONS: StationDefinition[] = [
  {
    id: "st-receiving",
    code: "A1",
    name: "Склад входящих компонентов",
    shortName: "Склад",
    zone: "Зона A — Приёмка",
    kind: "warehouse",
    sortOrder: 1,
    description: "Приёмка комплектующих (корпуса, валы, рабочие колёса, уплотнения), входной контроль и комплектация задания.",
    resource: { id: "res-storekeepers", name: "Кладовщики-комплектовщики", kind: "worker", unitName: "чел.", description: "Комплектование набора деталей на один насос." },
  },
  {
    id: "st-machining",
    code: "B1",
    name: "Механическая обработка",
    shortName: "Мехобработка",
    zone: "Зона B — Механообработка",
    kind: "machining",
    sortOrder: 2,
    description: "Токарная и фрезерная обработка корпуса и вала на станках с ЧПУ.",
    resource: { id: "res-cnc", name: "Обрабатывающие центры с ЧПУ", kind: "machine", unitName: "станк.", description: "Многоцелевые станки с ЧПУ с оператором." },
  },
  {
    id: "st-assembly",
    code: "C1",
    name: "Сборочный участок",
    shortName: "Сборка",
    zone: "Зона C — Сборка",
    kind: "assembly",
    sortOrder: 3,
    description: "Сборка проточной части, установка подшипников и торцевого уплотнения, соединение с электродвигателем.",
    resource: { id: "res-assembly-posts", name: "Сборочные посты", kind: "workstation", unitName: "пост.", description: "Пост сборщика с подъёмным столом и инструментом." },
  },
  {
    id: "st-testing",
    code: "D1",
    name: "Испытания и ОТК",
    shortName: "Испытания",
    zone: "Зона D — Испытания",
    kind: "testing",
    sortOrder: 4,
    description: "Гидравлические испытания на стенде (напор, расход, вибрация, герметичность) и контроль ОТК.",
    resource: { id: "res-test-bench", name: "Испытательные стенды", kind: "bench", unitName: "стенд.", description: "Замкнутый гидравлический стенд с измерительной системой." },
  },
  {
    id: "st-rework",
    code: "D2",
    name: "Устранение дефектов",
    shortName: "Доработка",
    zone: "Зона D — Испытания",
    kind: "rework",
    sortOrder: 5,
    description: "Разборка, устранение выявленного дефекта и повторная сборка перед повторными испытаниями.",
    resource: { id: "res-rework-post", name: "Пост доработки", kind: "workstation", unitName: "пост.", description: "Пост слесаря-ремонтника." },
  },
  {
    id: "st-packing",
    code: "E1",
    name: "Упаковка и отгрузка",
    shortName: "Отгрузка",
    zone: "Зона E — Отгрузка",
    kind: "shipping",
    sortOrder: 6,
    description: "Консервация, маркировка, упаковка в ящик и отгрузка на склад готовой продукции.",
    resource: { id: "res-packing-line", name: "Линия упаковки", kind: "line", unitName: "лин.", description: "Упаковочный стол с обвязкой и маркировкой." },
  },
];

export function stationById(id: string): StationDefinition | undefined {
  return STATIONS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Граф процесса (мнемосхема и BPMN используют те же идентификаторы)
// ---------------------------------------------------------------------------

export type ProcessNodeType = "start" | "task" | "gateway" | "end";

export interface ProcessNodeDefinition {
  id: string;
  type: ProcessNodeType;
  name: string;
  stationId: StationId | null;
  /** Координаты узла на мнемосхеме (условные единицы сетки 0..100). */
  x: number;
  y: number;
}

export interface ProcessEdgeDefinition {
  id: string;
  from: string;
  to: string;
  label: string | null;
  condition: "always" | "pass" | "fail" | "scrap";
}

export const PROCESS_NODES: ProcessNodeDefinition[] = [
  { id: "pn-order", type: "start", name: "Поступление задания", stationId: null, x: 4, y: 30 },
  { id: "pn-receiving", type: "task", name: "Комплектация", stationId: "st-receiving", x: 17, y: 30 },
  { id: "pn-machining", type: "task", name: "Мехобработка", stationId: "st-machining", x: 32, y: 30 },
  { id: "pn-assembly", type: "task", name: "Сборка", stationId: "st-assembly", x: 47, y: 30 },
  { id: "pn-testing", type: "task", name: "Испытания", stationId: "st-testing", x: 62, y: 30 },
  { id: "pn-quality", type: "gateway", name: "Годен?", stationId: null, x: 74, y: 30 },
  { id: "pn-rework", type: "task", name: "Доработка", stationId: "st-rework", x: 62, y: 72 },
  { id: "pn-packing", type: "task", name: "Упаковка", stationId: "st-packing", x: 86, y: 30 },
  { id: "pn-shipped", type: "end", name: "Отгружено", stationId: null, x: 97, y: 30 },
  { id: "pn-scrap", type: "end", name: "Списано", stationId: null, x: 86, y: 72 },
];

export const PROCESS_EDGES: ProcessEdgeDefinition[] = [
  { id: "pe-1", from: "pn-order", to: "pn-receiving", label: null, condition: "always" },
  { id: "pe-2", from: "pn-receiving", to: "pn-machining", label: null, condition: "always" },
  { id: "pe-3", from: "pn-machining", to: "pn-assembly", label: null, condition: "always" },
  { id: "pe-4", from: "pn-assembly", to: "pn-testing", label: null, condition: "always" },
  { id: "pe-5", from: "pn-testing", to: "pn-quality", label: null, condition: "always" },
  { id: "pe-6", from: "pn-quality", to: "pn-packing", label: "годен", condition: "pass" },
  { id: "pe-7", from: "pn-quality", to: "pn-rework", label: "дефект", condition: "fail" },
  { id: "pe-8", from: "pn-rework", to: "pn-testing", label: "повторные испытания", condition: "always" },
  { id: "pe-9", from: "pn-quality", to: "pn-scrap", label: "лимит доработок", condition: "scrap" },
  { id: "pe-10", from: "pn-packing", to: "pn-shipped", label: null, condition: "always" },
];

// ---------------------------------------------------------------------------
// Параметры сценариев
// ---------------------------------------------------------------------------

export interface StationParameters {
  capacity: number;
  processTime: DurationDistribution;
  hourlyCostRub: number;
  consumablesPerOperationRub: number;
  /** Отказы оборудования (MTBF/MTTR); null — участок моделируется без отказов. */
  failure?: FailureConfig | null;
}

export interface ScenarioParameters {
  horizonMin: number;
  releaseWindowMin: number;
  /** Период разгона, исключённый из статистики, мин (по умолчанию 0 — статистика с пустой системы). */
  warmupMin?: number;
  arrivalKind: "poisson" | "deterministic";
  arrivalRatePerHour: number;
  defectProbability: number;
  retestDefectProbability: number;
  maxReworkCycles: number;
  materialCostPerUnitRub: number;
  fixedCostRub: number;
  seed: number;
  replications: number;
  stations: Record<StationId, StationParameters>;
}

export const BASELINE_PARAMETERS: ScenarioParameters = {
  horizonMin: 960, // две 8-часовые смены
  releaseWindowMin: 960,
  arrivalKind: "poisson",
  arrivalRatePerHour: 5.5,
  defectProbability: 0.14,
  retestDefectProbability: 0.08,
  maxReworkCycles: 2,
  materialCostPerUnitRub: 38_000,
  fixedCostRub: 120_000,
  seed: 20_260,
  replications: 20,
  stations: {
    "st-receiving": { capacity: 1, processTime: { kind: "triangular", min: 4, mode: 5.5, max: 9 }, hourlyCostRub: 900, consumablesPerOperationRub: 50 },
    // Отказы: станок ЧПУ в среднем раз в 10 ч работы, ремонт ~30 мин; стенд — раз в 15 ч, ремонт ~20 мин.
    "st-machining": { capacity: 3, processTime: { kind: "triangular", min: 24, mode: 29, max: 38 }, hourlyCostRub: 2600, consumablesPerOperationRub: 450, failure: { mtbfMin: 600, mttrMin: 30 } },
    "st-assembly": { capacity: 2, processTime: { kind: "triangular", min: 17, mode: 21, max: 29 }, hourlyCostRub: 1500, consumablesPerOperationRub: 300 },
    "st-testing": { capacity: 1, processTime: { kind: "triangular", min: 7, mode: 9, max: 12 }, hourlyCostRub: 3200, consumablesPerOperationRub: 120, failure: { mtbfMin: 900, mttrMin: 20 } },
    "st-rework": { capacity: 1, processTime: { kind: "triangular", min: 10, mode: 15, max: 24 }, hourlyCostRub: 1700, consumablesPerOperationRub: 600 },
    "st-packing": { capacity: 1, processTime: { kind: "triangular", min: 6, mode: 7.5, max: 10 }, hourlyCostRub: 1100, consumablesPerOperationRub: 350 },
  },
};

export interface DemoScenarioDefinition {
  id: string;
  name: string;
  description: string;
  isBaseline: boolean;
  parameters: ScenarioParameters;
}

function withStation(
  base: ScenarioParameters,
  stationId: StationId,
  patch: Partial<StationParameters>,
): ScenarioParameters {
  return { ...base, stations: { ...base.stations, [stationId]: { ...base.stations[stationId], ...patch } } };
}

export const DEMO_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: "sc-baseline",
    name: "Базовый сценарий",
    description: "Текущая конфигурация: 5,5 задания/ч, 3 станка ЧПУ, 2 сборочных поста, 1 испытательный стенд; отказы ЧПУ (MTBF 600 / MTTR 30 мин) и стенда (900 / 20 мин).",
    isBaseline: true,
    parameters: BASELINE_PARAMETERS,
  },
  {
    id: "sc-demand-up",
    name: "Рост спроса +20%",
    description: "Интенсивность поступления заданий увеличена с 5,5 до 6,6 задания/ч при неизменных ресурсах.",
    isBaseline: false,
    parameters: { ...BASELINE_PARAMETERS, arrivalRatePerHour: 6.6 },
  },
  {
    id: "sc-assembly-plus",
    name: "Дополнительный сборочный пост",
    description: "Добавлен третий сборочный пост; остальные параметры как в базовом сценарии.",
    isBaseline: false,
    parameters: withStation(BASELINE_PARAMETERS, "st-assembly", { capacity: 3 }),
  },
  {
    id: "sc-testing-plus",
    name: "Второй испытательный стенд",
    description: "Добавлен второй испытательный стенд; остальные параметры как в базовом сценарии.",
    isBaseline: false,
    parameters: withStation(BASELINE_PARAMETERS, "st-testing", { capacity: 2 }),
  },
  {
    id: "sc-tpm",
    name: "Программа ТОиР (TPM) для ЧПУ и стенда",
    description:
      "Плановое обслуживание и запас ЗИП: наработка на отказ ×1,5, время ремонта ×0,4 (ЧПУ 900 / 12 мин, стенд 1350 / 8 мин). " +
      "Стоимость часа ЧПУ и стенда выше на 150 ₽ — затраты на обслуживание.",
    isBaseline: false,
    parameters: {
      ...BASELINE_PARAMETERS,
      stations: {
        ...BASELINE_PARAMETERS.stations,
        "st-machining": { ...BASELINE_PARAMETERS.stations["st-machining"], hourlyCostRub: 2750, failure: { mtbfMin: 900, mttrMin: 12 } },
        "st-testing": { ...BASELINE_PARAMETERS.stations["st-testing"], hourlyCostRub: 3350, failure: { mtbfMin: 1350, mttrMin: 8 } },
      },
    },
  },
  {
    id: "sc-quality",
    name: "Повышение качества сборки",
    description: "Доля брака при первичных испытаниях снижена с 14% до 5%, при повторных — с 8% до 3% (гипотеза программы качества).",
    isBaseline: false,
    parameters: { ...BASELINE_PARAMETERS, defectProbability: 0.05, retestDefectProbability: 0.03 },
  },
];

// ---------------------------------------------------------------------------
// 3D-тур: точки интереса и маршрут
// ---------------------------------------------------------------------------

export interface PoiDefinition {
  id: string;
  stationId: StationId | null;
  title: string;
  kind: "overview" | "station" | "practice";
  description: string;
  bestPractice: string | null;
  cameraPresetId: string;
  metricKeys: string[];
}

export const POINTS_OF_INTEREST: PoiDefinition[] = [
  { id: "poi-overview", stationId: null, title: "Цех сборки насосов", kind: "overview", cameraPresetId: "cam-overview", metricKeys: ["completed", "cycleTimeAvgMin", "utilizationAvg"], description: "Условный цех полного цикла: от приёмки комплектующих до отгрузки готовых насосов. Поток идёт слева направо по зонам A–E.", bestPractice: null },
  { id: "poi-receiving", stationId: "st-receiving", title: "Приёмка и комплектация", kind: "station", cameraPresetId: "cam-receiving", metricKeys: ["utilization", "avgWaitMin", "avgQueueLength"], description: "Здесь формируется комплект деталей на одно задание. Стеллажи хранения и зона входного контроля.", bestPractice: "Комплектование «под задание» (kitting) сокращает поиск деталей на сборке." },
  { id: "poi-machining", stationId: "st-machining", title: "Механообработка на ЧПУ", kind: "station", cameraPresetId: "cam-machining", metricKeys: ["utilization", "avgQueueLength", "throughputPerHour"], description: "Три обрабатывающих центра выполняют токарные и фрезерные операции по корпусу и валу.", bestPractice: "Быстрая переналадка (SMED) уменьшает разброс времени обработки." },
  { id: "poi-assembly", stationId: "st-assembly", title: "Сборочные посты", kind: "station", cameraPresetId: "cam-assembly", metricKeys: ["utilization", "avgWaitMin", "queueAtEnd"], description: "Сборка проточной части и агрегатирование с электродвигателем.", bestPractice: "Стандартизированная работа и визуальные инструкции на посту снижают вероятность дефектов сборки." },
  { id: "poi-testing", stationId: "st-testing", title: "Испытательный стенд", kind: "station", cameraPresetId: "cam-testing", metricKeys: ["utilization", "avgQueueLength", "avgWaitMin"], description: "Каждый насос проходит гидравлические испытания: напор, расход, вибрация, герметичность.", bestPractice: "Автоматическая запись протоколов испытаний обеспечивает прослеживаемость каждого изделия." },
  { id: "poi-rework", stationId: "st-rework", title: "Участок доработки", kind: "station", cameraPresetId: "cam-rework", metricKeys: ["operationsCompleted", "utilization", "avgWaitMin"], description: "Изделия с выявленным дефектом разбираются, дефект устраняется, затем следуют повторные испытания.", bestPractice: "Анализ причин дефектов (5 почему) по каждому возврату." },
  { id: "poi-packing", stationId: "st-packing", title: "Упаковка и отгрузка", kind: "station", cameraPresetId: "cam-packing", metricKeys: ["throughputPerHour", "utilization", "queueAtEnd"], description: "Консервация, упаковка и маркировка готовых насосов, формирование паллет к отгрузке.", bestPractice: null },
];

export interface TourDefinition {
  id: string;
  name: string;
  audience: string;
  description: string;
  stops: Array<{ poiId: string; title: string; narrative: string }>;
}

export const TOURS: TourDefinition[] = [
  {
    id: "tour-main",
    name: "Обзорная экскурсия по цеху",
    audience: "Посетители, партнёры, студенты, новые сотрудники",
    description: "Маршрут по ходу изделия: от склада комплектующих до отгрузки, с показателями последнего расчёта.",
    stops: [
      { poiId: "poi-overview", title: "Обзор цеха", narrative: "Перед вами цифровая модель условного цеха сборки центробежных насосов. Изделие проходит пять участков слева направо." },
      { poiId: "poi-receiving", title: "Склад комплектующих", narrative: "Всё начинается с комплектации: кладовщик собирает набор деталей под конкретное задание." },
      { poiId: "poi-machining", title: "Механообработка", narrative: "Корпус и вал обрабатываются на станках с ЧПУ. Это самая длительная операция маршрута." },
      { poiId: "poi-assembly", title: "Сборка", narrative: "На сборочных постах насос собирается и соединяется с электродвигателем. Обратите внимание на очередь перед участком." },
      { poiId: "poi-testing", title: "Испытания", narrative: "Каждый насос испытывается на стенде. Здесь принимается решение: годен или требуется доработка." },
      { poiId: "poi-rework", title: "Доработка", narrative: "Изделия с дефектом возвращаются на доработку и повторные испытания — это дополнительная нагрузка на стенд." },
      { poiId: "poi-packing", title: "Отгрузка", narrative: "Готовые насосы упаковываются и отгружаются. Выпуск за смену — главный итоговый показатель." },
    ],
  },
  {
    id: "tour-students",
    name: "Как рождается насос",
    audience: "Абитуриенты и студенты",
    description: "Технологический маршрут изделия: какие операции и профессии стоят за каждым участком и где здесь инженерные задачи.",
    stops: [
      { poiId: "poi-overview", title: "Завод в одном цехе", narrative: "Центробежный насос перекачивает жидкость за счёт вращения рабочего колеса. Чтобы его сделать, нужны пять участков и несколько профессий: кладовщик, оператор станков с ЧПУ, сборщик, испытатель, упаковщик." },
      { poiId: "poi-machining", title: "Станки с ЧПУ", narrative: "Корпус и вал обрабатываются по программе. Инженер-технолог пишет управляющую программу и подбирает инструмент; от точности здесь зависят вибрация и ресурс насоса. Посмотрите на табличку участка: она показывает рассчитанную загрузку станков." },
      { poiId: "poi-assembly", title: "Сборка", narrative: "Сборщик устанавливает рабочее колесо, подшипники и торцевое уплотнение и соединяет насос с электродвигателем. Ошибка на сборке обнаружится только на испытаниях — поэтому здесь важны стандарты работы." },
      { poiId: "poi-testing", title: "Испытания", narrative: "На стенде измеряют напор, расход, вибрацию и герметичность — так проверяют, что насос соответствует паспорту. Решение «годен / доработка» принимает ОТК." },
      { poiId: "poi-overview", title: "Где здесь математика", narrative: "Весь цех описан дискретно-событийной моделью: каждое изделие, каждая операция и каждый отказ — событие с временем. Модель позволяет проверить решение до того, как его внедрят на реальном заводе. Это и есть цифровой двойник." },
    ],
  },
  {
    id: "tour-management",
    name: "Где теряются время и деньги",
    audience: "Руководство, партнёры, заказчики",
    description: "Маршрут по узким местам и проверенным моделью решениям: от отказов станков до программы качества.",
    stops: [
      { poiId: "poi-overview", title: "Итоги смены", narrative: "Показатели внизу карточки — результат расчёта выбранного прогона, а не презентационные цифры. Карточка кейса показывает главный риск: что будет при росте спроса." },
      { poiId: "poi-machining", title: "Отказы на мехобработке", narrative: "Узкое место цеха с учётом отказов. Станки часть времени стоят в ремонте — в режиме воспроизведения такой станок обозначен ограждением. Кейс сравнивает программу ТОиР с базовым вариантом." },
      { poiId: "poi-assembly", title: "Дополнительный пост", narrative: "Второй кандидат на расширение. Кейс показывает, что дополнительный пост сокращает цикл, — и проверяет, снижается ли при этом стоимость единицы." },
      { poiId: "poi-testing", title: "Стенд: покупать ли второй", narrative: "Пример решения, которое выглядит логичным, но требует проверки: сравните эффект второго стенда с его стоимостью." },
      { poiId: "poi-rework", title: "Цена брака", narrative: "Каждый возврат на доработку — повторная операция и повторные испытания. Кейс программы качества показывает эффект снижения брака на цикл и стоимость." },
    ],
  },
  {
    id: "tour-onboarding",
    name: "Первый день в цехе",
    audience: "Новые сотрудники",
    description: "Ориентирование: зоны цеха, движение изделия, сигналы оборудования и что делать при отказе.",
    stops: [
      { poiId: "poi-overview", title: "Зоны A–E", narrative: "Цех разделён на зоны, обозначенные на полу буквами A–E. Изделие движется слева направо; проходы вдоль конвейера свободны от материалов. Цвет контура зоны в модели — состояние участка: зелёный — норма, жёлтый — высокая загрузка, красный — перегрузка." },
      { poiId: "poi-receiving", title: "Склад и комплектация", narrative: "Работа начинается с комплекта деталей под задание. Комплект собирается целиком — так сборщик не ищет детали на участке." },
      { poiId: "poi-machining", title: "Сигнальные колонны", narrative: "У каждого станка — сигнальная колонна. Красный сигнал и ограждение означают, что оборудование в ремонте: не включать и не снимать ограждение, сообщить мастеру." },
      { poiId: "poi-testing", title: "Испытания и ОТК", narrative: "Испытательный стенд работает под давлением — находиться в зоне испытаний можно только по допуску. Изделие с дефектом получает маркировку и уходит на доработку." },
      { poiId: "poi-packing", title: "Отгрузка", narrative: "Готовые насосы консервируют, маркируют и упаковывают. Паллеты в зоне E — продукция к отгрузке, не загромождайте проезд погрузчика." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Кейсы точек интереса: связь «тур → сценарий → метрика двойника»
// ---------------------------------------------------------------------------

export interface PoiCaseDefinition {
  poiId: string;
  /** Сценарий, рассчитанный результат которого сравнивается с базовым. */
  scenarioId: string;
  title: string;
  /** Управленческий вопрос, на который отвечает кейс. */
  question: string;
  /** Сводные показатели, выводимые в карточке кейса. */
  metricKeys: string[];
}

export const POI_CASES: PoiCaseDefinition[] = [
  { poiId: "poi-overview", scenarioId: "sc-demand-up", title: "Выдержит ли цех рост спроса на 20%?", question: "Как изменятся выпуск, цикл и незавершённое производство при росте заказов без новых ресурсов.", metricKeys: ["completed", "cycleTimeAvgMin", "wipEnd"] },
  { poiId: "poi-machining", scenarioId: "sc-tpm", title: "ТОиР вместо нового станка", question: "Отказы съедают около 5% времени станков. Окупится ли программа планового обслуживания без покупки оборудования?", metricKeys: ["downtimeMin", "cycleTimeAvgMin", "costPerUnitRub"] },
  { poiId: "poi-assembly", scenarioId: "sc-assembly-plus", title: "Третий сборочный пост", question: "Окупается ли дополнительный пост на текущем узком месте.", metricKeys: ["cycleTimeAvgMin", "costPerUnitRub", "wipEnd"] },
  { poiId: "poi-testing", scenarioId: "sc-testing-plus", title: "Второй испытательный стенд", question: "Стоит ли покупать второй стенд, если он не является узким местом.", metricKeys: ["cycleTimeAvgMin", "costPerUnitRub", "completed"] },
  { poiId: "poi-rework", scenarioId: "sc-quality", title: "Программа качества сборки", question: "Что даёт снижение брака с 14% до 5%: меньше доработок, короче цикл, ниже стоимость.", metricKeys: ["defectRate", "reworkCount", "costPerUnitRub"] },
];
