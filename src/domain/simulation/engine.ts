import { sampleDuration, sampleInterArrival, validateDistribution } from "./distributions";
import { EventCalendar } from "./eventQueue";
import { createRng, splitmix32, type Rng } from "./rng";
import {
  ENGINE_LIMITS,
  ENGINE_VERSION,
  type AggregateResult,
  type SimulationConfig,
  type SimulationEvent,
  type SimulationEventType,
  type SimulationResult,
  type Snapshot,
  type StationConfig,
  type StationResult,
  type UnitRecord,
} from "./types";

/**
 * Дискретно-событийный симулятор производственной линии.
 *
 * Календарные (будущие) события: ARRIVAL, PROCESS_FINISH, HORIZON_END.
 * Мгновенные события (QUEUE_ENTER, PROCESS_START, QUALITY_CHECK, REWORK, SCRAP, DEPARTURE)
 * обрабатываются синхронно в момент календарного события и фиксируются в журнале.
 *
 * Модуль не зависит от UI, React, базы данных и сети.
 */

/**
 * Общие случайные числа (Common Random Numbers, CRN).
 *
 * Каждый источник случайности получает собственный поток, зависящий только от seed и «адреса» события:
 *  - поток поступлений — один на прогон;
 *  - длительность операции — (изделие, участок, номер посещения участка этим изделием);
 *  - исход контроля качества — (изделие, номер проверки).
 * Поэтому в двух сценариях с одинаковым seed одно и то же изделие получает одинаковые длительности
 * операций и одинаковую «судьбу» на контроле, даже если изменились мощности или порядок обслуживания.
 * Различия результатов вызваны изменением параметров, а не перетасовкой случайных чисел, —
 * это резко снижает дисперсию оценки разности и позволяет использовать парное сравнение.
 */
const STREAM = { ARRIVAL: 1, SERVICE: 2, QUALITY: 3, FAILURE: 4, REPAIR: 5 } as const;

export function streamSeed(seed: number, stream: number, a = 0, b = 0, c = 0): number {
  let h = splitmix32((seed >>> 0) ^ Math.imul(stream, 0x27d4eb2d));
  h = splitmix32(h ^ (a >>> 0));
  h = splitmix32(h ^ Math.imul(b + 1, 0x165667b1));
  h = splitmix32(h ^ Math.imul(c + 1, 0x9e3779b1));
  return h;
}

export class SimulationConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Некорректная конфигурация симуляции: ${issues.join("; ")}`);
    this.name = "SimulationConfigError";
  }
}

/** Приоритеты при совпадении времени: сначала освобождаем ресурсы, затем приходы, горизонт — последним. */
const PRIORITY = { WARMUP_END: -1, PROCESS_FINISH: 0, REPAIR_END: 0, FAILURE: 1, ARRIVAL: 2, HORIZON_END: 9 } as const;

type CalendarPayload =
  | { type: "ARRIVAL" }
  | { type: "PROCESS_FINISH"; stationId: string; unitId: number }
  | { type: "FAILURE"; stationId: string }
  | { type: "REPAIR_END"; stationId: string }
  | { type: "WARMUP_END" }
  | { type: "HORIZON_END" };

interface UnitState {
  id: number;
  arrivalMin: number;
  routeIndex: number;
  reworkCycles: number;
  inRework: boolean;
  /** Число посещений каждого участка (индекс участка в конфигурации) — адрес потока CRN. */
  visits: number[];
  qualityChecks: number;
  queueEnterMin: number;
  serviceStartMin: number;
  waitingMin: number;
  processingMin: number;
  exitMin: number | null;
  outcome: "COMPLETED" | "SCRAPPED" | "WIP";
}

interface StationState {
  cfg: StationConfig;
  queue: number[];
  queueHead: number;
  busy: number;
  peakBusy: number;
  lastChangeMin: number;
  busyIntegral: number;
  queueIntegral: number;
  maxQueue: number;
  started: number;
  completed: number;
  waitSum: number;
  maxWait: number;
  consumablesCostRub: number;
  /** Единицы ресурса в ремонте. */
  down: number;
  /** Отказы, ожидающие завершения текущей операции (неупреждающая модель). */
  pendingFailures: number;
  downIntegral: number;
  failures: number;
  failureRng: Rng | null;
  repairRng: Rng | null;
}

export function validateConfig(config: SimulationConfig): string[] {
  const issues: string[] = [];
  const nonNeg = (name: string, v: number) => {
    if (!Number.isFinite(v) || v < 0) issues.push(`${name} должно быть неотрицательным конечным числом`);
  };
  if (!Number.isFinite(config.horizonMin) || config.horizonMin <= 0) issues.push("горизонт должен быть > 0 мин");
  if (config.horizonMin > ENGINE_LIMITS.maxHorizonMin)
    issues.push(`горизонт не может превышать ${ENGINE_LIMITS.maxHorizonMin} мин`);
  nonNeg("интенсивность поступления", config.arrival.ratePerHour);
  if (config.arrival.ratePerHour > ENGINE_LIMITS.maxArrivalRatePerHour)
    issues.push(`интенсивность не может превышать ${ENGINE_LIMITS.maxArrivalRatePerHour} шт./ч`);
  nonNeg("стоимость материалов", config.materialCostPerUnitRub);
  nonNeg("постоянные расходы", config.fixedCostRub);
  if (config.arrivalStopMin !== undefined) nonNeg("окончание запуска", config.arrivalStopMin);
  if (config.warmupMin !== undefined) {
    nonNeg("период разгона", config.warmupMin);
    if (config.warmupMin >= config.horizonMin) issues.push("период разгона должен быть меньше горизонта");
  }
  if (config.route.length === 0) issues.push("маршрут должен содержать хотя бы одну станцию");

  const ids = new Set<string>();
  for (const s of config.stations) {
    if (ids.has(s.stationId)) issues.push(`станция ${s.stationId} описана дважды`);
    ids.add(s.stationId);
    if (!Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > ENGINE_LIMITS.maxCapacity)
      issues.push(`${s.stationId}: вместимость должна быть целым числом 1..${ENGINE_LIMITS.maxCapacity}`);
    nonNeg(`${s.stationId}: стоимость часа`, s.hourlyCostRub);
    nonNeg(`${s.stationId}: расходные материалы`, s.consumablesPerOperationRub);
    for (const e of validateDistribution(s.processTime)) issues.push(`${s.stationId}: ${e}`);
    if (s.failure) {
      if (!Number.isFinite(s.failure.mtbfMin) || s.failure.mtbfMin < 1) issues.push(`${s.stationId}: MTBF должен быть ≥ 1 мин`);
      if (!Number.isFinite(s.failure.mttrMin) || s.failure.mttrMin <= 0) issues.push(`${s.stationId}: MTTR должен быть > 0 мин`);
    }
  }
  for (const id of config.route) if (!ids.has(id)) issues.push(`маршрут ссылается на неизвестную станцию ${id}`);
  if (new Set(config.route).size !== config.route.length) issues.push("станция не может повторяться в основном маршруте");

  const q = config.quality;
  if (q) {
    if (!config.route.includes(q.stationId)) issues.push("станция контроля качества должна входить в маршрут");
    if (!ids.has(q.reworkStationId)) issues.push("неизвестная станция доработки");
    if (config.route.includes(q.reworkStationId)) issues.push("станция доработки не должна входить в основной маршрут");
    for (const [name, p] of [
      ["вероятность брака", q.defectProbability],
      ["вероятность брака при повторном контроле", q.retestDefectProbability],
    ] as const) {
      if (!Number.isFinite(p) || p < 0 || p > 1) issues.push(`${name} должна быть в диапазоне 0..1`);
    }
    if (!Number.isInteger(q.maxReworkCycles) || q.maxReworkCycles < 0 || q.maxReworkCycles > ENGINE_LIMITS.maxReworkCycles)
      issues.push(`максимум циклов доработки: целое 0..${ENGINE_LIMITS.maxReworkCycles}`);
  }
  if (config.snapshotIntervalMin !== undefined && !(config.snapshotIntervalMin > 0))
    issues.push("шаг кадров должен быть > 0");
  return issues;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export function runSimulation(config: SimulationConfig): SimulationResult {
  const issues = validateConfig(config);
  if (issues.length > 0) throw new SimulationConfigError(issues);

  const horizon = config.horizonMin;
  const arrivalStop = Math.min(config.arrivalStopMin ?? horizon, horizon);
  const warmup = Math.max(0, Math.min(config.warmupMin ?? 0, horizon));
  /** Окно наблюдения: статистика собирается на [warmup, horizon]. */
  const observed = horizon - warmup;
  const snapshotStep = config.snapshotIntervalMin ?? 10;
  const recordEvents = config.recordEvents ?? false;
  const arrivalRng: Rng = createRng(streamSeed(config.seed, STREAM.ARRIVAL));
  const stationIndex = new Map(config.stations.map((cfg, i) => [cfg.stationId, i]));

  const stations = new Map<string, StationState>();
  for (const [i, cfg] of config.stations.entries()) {
    stations.set(cfg.stationId, {
      cfg,
      queue: [],
      queueHead: 0,
      busy: 0,
      peakBusy: 0,
      lastChangeMin: 0,
      busyIntegral: 0,
      queueIntegral: 0,
      maxQueue: 0,
      started: 0,
      completed: 0,
      waitSum: 0,
      maxWait: 0,
      consumablesCostRub: 0,
      down: 0,
      pendingFailures: 0,
      downIntegral: 0,
      failures: 0,
      failureRng: cfg.failure ? createRng(streamSeed(config.seed, STREAM.FAILURE, i)) : null,
      repairRng: cfg.failure ? createRng(streamSeed(config.seed, STREAM.REPAIR, i)) : null,
    });
  }

  const units = new Map<number, UnitState>();
  const calendar = new EventCalendar<CalendarPayload>();
  const events: SimulationEvent[] = [];
  let eventsTruncated = false;
  const snapshots: Snapshot[] = [];

  let now = 0;
  let nextUnitId = 1;
  let wip = 0;
  let wipIntegral = 0;
  let wipLastChange = 0;
  let completedCount = 0;
  let scrappedCount = 0;
  let qualityChecks = 0;
  let defectsFound = 0;
  let reworkCount = 0;
  let nextSnapshotMin = 0;
  let processed = 0;
  /** Изделия в системе на конец разгона и поступившие после него — «запущенные» в окне наблюдения. */
  let wipAtWarmup = 0;
  let arrivalsObserved = 0;

  const log = (type: SimulationEventType, unitId: number, stationId: string | null, defect?: boolean) => {
    if (!recordEvents) return;
    if (events.length >= ENGINE_LIMITS.maxRecordedEvents) {
      eventsTruncated = true;
      return;
    }
    const e: SimulationEvent = { t: now, type, unitId, stationId };
    if (defect !== undefined) e.defect = defect;
    events.push(e);
  };

  const queueLength = (s: StationState) => s.queue.length - s.queueHead;

  const touchStation = (s: StationState) => {
    const dt = now - s.lastChangeMin;
    if (dt > 0) {
      s.busyIntegral += s.busy * dt;
      s.queueIntegral += queueLength(s) * dt;
      s.downIntegral += s.down * dt;
    }
    s.lastChangeMin = now;
  };

  const touchWip = () => {
    const dt = now - wipLastChange;
    if (dt > 0) wipIntegral += wip * dt;
    wipLastChange = now;
  };

  const takeSnapshotsUntil = (time: number) => {
    // Состояние постоянно между событиями, поэтому кадр в момент t < time отражает текущее состояние.
    while (nextSnapshotMin <= horizon && nextSnapshotMin < time) {
      const st: Record<string, [number, number, number]> = {};
      for (const [id, s] of stations) st[id] = [queueLength(s), s.busy, s.down];
      snapshots.push({ t: nextSnapshotMin, wip, completed: completedCount, scrapped: scrappedCount, stations: st });
      nextSnapshotMin += snapshotStep;
    }
  };

  const getStation = (id: string): StationState => {
    const s = stations.get(id);
    if (!s) throw new Error(`Неизвестная станция ${id}`);
    return s;
  };

  /** Переводит ожидающие отказы в ремонт, если есть незанятые исправные единицы. */
  const applyFailures = (s: StationState) => {
    while (s.pendingFailures > 0 && s.busy + s.down < s.cfg.capacity) {
      touchStation(s);
      s.pendingFailures -= 1;
      s.down += 1;
      s.failures += 1;
      log("BREAKDOWN", 0, s.cfg.stationId);
      const mttr = s.cfg.failure!.mttrMin;
      calendar.schedule(now + -mttr * Math.log(1 - s.repairRng!.next()), PRIORITY.REPAIR_END, {
        type: "REPAIR_END",
        stationId: s.cfg.stationId,
      });
    }
  };

  const scheduleNextFailure = (s: StationState) => {
    const f = s.cfg.failure;
    if (!f || !s.failureRng) return;
    const t = now + (-f.mtbfMin / s.cfg.capacity) * Math.log(1 - s.failureRng.next());
    if (t < horizon) calendar.schedule(t, PRIORITY.FAILURE, { type: "FAILURE", stationId: s.cfg.stationId });
  };

  const startService = (s: StationState) => {
    while (s.busy + s.down < s.cfg.capacity && queueLength(s) > 0) {
      touchStation(s);
      const unitId = s.queue[s.queueHead]!;
      s.queueHead += 1;
      if (s.queueHead > 1024 && s.queueHead * 2 > s.queue.length) {
        s.queue = s.queue.slice(s.queueHead);
        s.queueHead = 0;
      }
      const unit = units.get(unitId)!;
      const wait = now - unit.queueEnterMin;
      unit.waitingMin += wait;
      s.waitSum += wait;
      if (wait > s.maxWait) s.maxWait = wait;
      s.busy += 1;
      if (s.busy > s.peakBusy) s.peakBusy = s.busy;
      s.started += 1;
      s.consumablesCostRub += s.cfg.consumablesPerOperationRub;
      unit.serviceStartMin = now;
      log("PROCESS_START", unitId, s.cfg.stationId);
      const stIdx = stationIndex.get(s.cfg.stationId)!;
      const visit = unit.visits[stIdx] ?? 0;
      unit.visits[stIdx] = visit + 1;
      const duration = sampleDuration(
        s.cfg.processTime,
        createRng(streamSeed(config.seed, STREAM.SERVICE, unitId, stIdx, visit)),
      );
      calendar.schedule(now + duration, PRIORITY.PROCESS_FINISH, {
        type: "PROCESS_FINISH",
        stationId: s.cfg.stationId,
        unitId,
      });
    }
  };

  const enterQueue = (unit: UnitState, stationId: string) => {
    const s = getStation(stationId);
    touchStation(s);
    unit.queueEnterMin = now;
    s.queue.push(unit.id);
    const ql = queueLength(s);
    if (ql > s.maxQueue) s.maxQueue = ql;
    log("QUEUE_ENTER", unit.id, stationId);
    startService(s);
  };

  const exitSystem = (unit: UnitState, outcome: "COMPLETED" | "SCRAPPED") => {
    touchWip();
    wip -= 1;
    unit.exitMin = now;
    unit.outcome = outcome;
    if (outcome === "COMPLETED") {
      completedCount += 1;
      log("DEPARTURE", unit.id, null);
    } else {
      scrappedCount += 1;
      log("SCRAP", unit.id, null);
    }
  };

  const advanceOnRoute = (unit: UnitState) => {
    unit.routeIndex += 1;
    const nextId = config.route[unit.routeIndex];
    if (nextId === undefined) exitSystem(unit, "COMPLETED");
    else enterQueue(unit, nextId);
  };

  const onFinish = (stationId: string, unitId: number) => {
    const s = getStation(stationId);
    touchStation(s);
    s.busy -= 1;
    s.completed += 1;
    const unit = units.get(unitId)!;
    unit.processingMin += now - unit.serviceStartMin;
    log("PROCESS_FINISH", unitId, stationId);
    // Ожидающий отказ останавливает освободившуюся единицу раньше, чем она возьмёт следующее задание.
    applyFailures(s);
    // Освободившийся ресурс сразу берёт следующее задание из очереди (FIFO).
    startService(s);

    const q = config.quality;
    if (q && unit.inRework && stationId === q.reworkStationId) {
      unit.inRework = false;
      enterQueue(unit, q.stationId);
      return;
    }
    if (q && stationId === q.stationId) {
      qualityChecks += 1;
      const p = unit.reworkCycles === 0 ? q.defectProbability : q.retestDefectProbability;
      const check = unit.qualityChecks;
      unit.qualityChecks += 1;
      const defect = createRng(streamSeed(config.seed, STREAM.QUALITY, unitId, check)).next() < p;
      log("QUALITY_CHECK", unitId, stationId, defect);
      if (defect) {
        defectsFound += 1;
        if (unit.reworkCycles < q.maxReworkCycles) {
          unit.reworkCycles += 1;
          unit.inRework = true;
          reworkCount += 1;
          log("REWORK", unitId, q.reworkStationId);
          enterQueue(unit, q.reworkStationId);
        } else {
          exitSystem(unit, "SCRAPPED");
        }
        return;
      }
    }
    advanceOnRoute(unit);
  };

  const scheduleNextArrival = () => {
    const gap = sampleInterArrival(config.arrival.kind, config.arrival.ratePerHour, arrivalRng);
    const t = now + gap;
    if (t < arrivalStop) calendar.schedule(t, PRIORITY.ARRIVAL, { type: "ARRIVAL" });
  };

  // Первое задание при детерминированном потоке поступает в момент 0, при пуассоновском — через случайный интервал.
  if (config.arrival.ratePerHour > 0) {
    if (config.arrival.kind === "deterministic") calendar.schedule(0, PRIORITY.ARRIVAL, { type: "ARRIVAL" });
    else scheduleNextArrival();
  }
  calendar.schedule(horizon, PRIORITY.HORIZON_END, { type: "HORIZON_END" });
  if (warmup > 0) calendar.schedule(warmup, PRIORITY.WARMUP_END, { type: "WARMUP_END" });
  for (const s of stations.values()) scheduleNextFailure(s);

  for (;;) {
    const entry = calendar.pop();
    if (!entry) break;
    processed += 1;
    if (processed > ENGINE_LIMITS.maxEvents) {
      throw new Error("Превышен лимит событий симуляции — проверьте параметры сценария");
    }
    takeSnapshotsUntil(entry.time);
    now = entry.time;
    const ev = entry.payload;
    if (ev.type === "HORIZON_END") {
      log("HORIZON_END", 0, null);
      break;
    }
    if (ev.type === "WARMUP_END") {
      // Конец разгона: фиксируем интегралы на момент warmup и обнуляем все накопители статистики.
      for (const s of stations.values()) {
        touchStation(s);
        s.busyIntegral = 0;
        s.queueIntegral = 0;
        s.downIntegral = 0;
        s.started = 0;
        s.completed = 0;
        s.waitSum = 0;
        s.maxWait = 0;
        s.consumablesCostRub = 0;
        s.failures = 0;
        s.peakBusy = s.busy;
        s.maxQueue = queueLength(s);
      }
      touchWip();
      wipIntegral = 0;
      completedCount = 0;
      scrappedCount = 0;
      qualityChecks = 0;
      defectsFound = 0;
      reworkCount = 0;
      wipAtWarmup = wip;
      arrivalsObserved = 0;
    } else if (ev.type === "FAILURE") {
      const s = getStation(ev.stationId);
      s.pendingFailures += 1;
      applyFailures(s);
      scheduleNextFailure(s);
    } else if (ev.type === "REPAIR_END") {
      const s = getStation(ev.stationId);
      touchStation(s);
      s.down -= 1;
      log("REPAIR", 0, s.cfg.stationId);
      applyFailures(s);
      startService(s);
    } else if (ev.type === "ARRIVAL") {
      const unit: UnitState = {
        id: nextUnitId++,
        arrivalMin: now,
        routeIndex: 0,
        reworkCycles: 0,
        inRework: false,
        visits: [],
        qualityChecks: 0,
        queueEnterMin: now,
        serviceStartMin: now,
        waitingMin: 0,
        processingMin: 0,
        exitMin: null,
        outcome: "WIP",
      };
      units.set(unit.id, unit);
      touchWip();
      wip += 1;
      arrivalsObserved += 1;
      log("ARRIVAL", unit.id, null);
      enterQueue(unit, config.route[0]!);
      scheduleNextArrival();
    } else {
      onFinish(ev.stationId, ev.unitId);
    }
  }

  // Закрываем интегралы на горизонте; изделия в очередях и в обработке фиксируются как НЗП.
  now = horizon;
  takeSnapshotsUntil(horizon + 1e-9);
  touchWip();
  for (const s of stations.values()) touchStation(s);

  // Для незавершённых изделий учитываем ожидание/обработку до горизонта.
  const inProcessByStation = new Map<string, number>();
  for (const s of stations.values()) inProcessByStation.set(s.cfg.stationId, s.busy);

  const unitRecords: UnitRecord[] = [];
  for (const u of units.values()) {
    unitRecords.push({
      unitId: u.id,
      arrivalMin: u.arrivalMin,
      exitMin: u.exitMin,
      outcome: u.outcome,
      waitingMin: u.waitingMin,
      processingMin: u.processingMin,
      reworkCycles: u.reworkCycles,
    });
  }

  const observedHours = observed / 60;
  const stationResults: StationResult[] = [];
  let busyTotal = 0;
  let capacityTotal = 0;
  let resourceCost = 0;
  let consumablesCost = 0;
  let idleCost = 0;
  let avgQueueTotal = 0;
  let failuresTotal = 0;
  let downtimeTotal = 0;
  for (const s of stations.values()) {
    const capMin = s.cfg.capacity * observed;
    const utilization = capMin > 0 ? Math.min(1, s.busyIntegral / capMin) : 0;
    const rc = s.cfg.capacity * observedHours * s.cfg.hourlyCostRub;
    // Простой — время, когда исправная единица ресурса не занята (ремонт учитывается отдельно).
    const ic = (Math.max(0, capMin - s.busyIntegral - s.downIntegral) / 60) * s.cfg.hourlyCostRub;
    busyTotal += s.busyIntegral;
    capacityTotal += capMin;
    resourceCost += rc;
    consumablesCost += s.consumablesCostRub;
    idleCost += ic;
    const avgQ = s.queueIntegral / observed;
    avgQueueTotal += avgQ;
    failuresTotal += s.failures;
    downtimeTotal += s.downIntegral;
    stationResults.push({
      stationId: s.cfg.stationId,
      name: s.cfg.name,
      capacity: s.cfg.capacity,
      operationsStarted: s.started,
      operationsCompleted: s.completed,
      busyMin: s.busyIntegral,
      utilization,
      avgQueueLength: avgQ,
      maxQueueLength: s.maxQueue,
      avgWaitMin: s.started > 0 ? s.waitSum / s.started : 0,
      maxWaitMin: s.maxWait,
      queueAtEnd: queueLength(s),
      inProcessAtEnd: inProcessByStation.get(s.cfg.stationId) ?? 0,
      throughputPerHour: s.completed / observedHours,
      resourceCostRub: rc,
      consumablesCostRub: s.consumablesCostRub,
      idleCostRub: ic,
      peakBusy: s.peakBusy,
      failures: s.failures,
      downtimeMin: s.downIntegral,
      availability: capMin > 0 ? Math.max(0, 1 - s.downIntegral / capMin) : 1,
    });
  }

  // Время цикла — по изделиям, завершённым в окне наблюдения.
  const completedUnits = unitRecords.filter((u) => u.outcome === "COMPLETED" && (u.exitMin as number) >= warmup);
  const cycleTimes = completedUnits.map((u) => (u.exitMin as number) - u.arrivalMin).sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const released = warmup > 0 ? wipAtWarmup + arrivalsObserved : unitRecords.length;
  const materialCost = released * config.materialCostPerUnitRub;
  // Постоянные расходы заданы за горизонт и распределяются пропорционально окну наблюдения.
  const fixedCost = (config.fixedCostRub * observed) / horizon;
  const totalCost = resourceCost + consumablesCost + materialCost + fixedCost;

  const aggregate: AggregateResult = {
    released,
    completed: completedCount,
    scrapped: scrappedCount,
    wipEnd: wip,
    throughputPerHour: completedCount / observedHours,
    cycleTimeAvgMin: avg(cycleTimes),
    cycleTimeP50Min: percentile(cycleTimes, 0.5),
    cycleTimeP90Min: percentile(cycleTimes, 0.9),
    cycleTimeMaxMin: cycleTimes.length ? cycleTimes[cycleTimes.length - 1]! : null,
    waitingTimeAvgMin: avg(completedUnits.map((u) => u.waitingMin)),
    processingTimeAvgMin: avg(completedUnits.map((u) => u.processingMin)),
    avgWip: wipIntegral / observed,
    avgQueueTotal,
    utilizationAvg: capacityTotal > 0 ? Math.min(1, busyTotal / capacityTotal) : 0,
    qualityChecks,
    defectsFound,
    defectRate: qualityChecks > 0 ? defectsFound / qualityChecks : null,
    reworkCount,
    resourceCostRub: resourceCost,
    consumablesCostRub: consumablesCost,
    materialCostRub: materialCost,
    fixedCostRub: fixedCost,
    totalCostRub: totalCost,
    idleCostRub: idleCost,
    costPerUnitRub: completedCount > 0 ? totalCost / completedCount : null,
    failures: failuresTotal,
    downtimeMin: downtimeTotal,
  };

  return {
    engineVersion: ENGINE_VERSION,
    seed: config.seed,
    horizonMin: horizon,
    warmupMin: warmup,
    aggregate,
    stations: stationResults,
    units: unitRecords,
    snapshots,
    events,
    eventsTruncated,
    processedEvents: processed,
  };
}
