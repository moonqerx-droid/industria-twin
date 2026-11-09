import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import {
  DEMO_SCENARIOS,
  FACTORY_ID,
  POINTS_OF_INTEREST,
  PROCESS_EDGES,
  PROCESS_ID,
  PROCESS_NODES,
  STATIONS,
  STATION_IDS,
  TOURS,
} from "@/domain/model/demoData";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { distributionToColumns } from "./scenarioService";

export interface DemoAccount {
  login: string;
  role: "admin" | "engineer" | "viewer";
  displayName: string;
  password: string;
}

/**
 * Демонстрационные учётные записи. Пароли можно переопределить переменными окружения
 * DEMO_*_PASSWORD; в БД сохраняются только bcrypt-хеши. Персональные данные не используются.
 */
export function demoAccounts(): DemoAccount[] {
  return [
    { login: "admin", role: "admin", displayName: "Администратор (демо)", password: process.env.DEMO_ADMIN_PASSWORD || "Admin#Twin2026" },
    { login: "engineer", role: "engineer", displayName: "Инженер-технолог (демо)", password: process.env.DEMO_ENGINEER_PASSWORD || "Engineer#Twin2026" },
    { login: "viewer", role: "viewer", displayName: "Наблюдатель (демо)", password: process.env.DEMO_VIEWER_PASSWORD || "Viewer#Twin2026" },
  ];
}

const ROLE_DESCRIPTIONS = {
  admin: "Полный доступ, управление прогонами и просмотр пользователей",
  engineer: "Создание и редактирование сценариев, запуск моделирования",
  viewer: "Только просмотр дашбордов, процесса, сравнений и 3D-тура",
} as const;

/** Полная очистка и заполнение демонстрационными данными (идемпотентно). */
export async function seedDatabase(db: PrismaClient, opts: { runSimulations: (scenarioId: string) => Promise<unknown> }): Promise<void> {
  // Порядок удаления учитывает внешние ключи.
  await db.simulationEventLog.deleteMany();
  await db.replicationResult.deleteMany();
  await db.stationMetric.deleteMany();
  await db.aggregateMetric.deleteMany();
  await db.simulationRun.deleteMany();
  await db.scenarioStationParameter.deleteMany();
  await db.scenario.deleteMany();
  await db.tourStop.deleteMany();
  await db.tour.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.pointOfInterest.deleteMany();
  await db.processEdge.deleteMany();
  await db.processNode.deleteMany();
  await db.productionProcess.deleteMany();
  await db.resource.deleteMany();
  await db.station.deleteMany();
  await db.factory.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany();

  for (const id of ["admin", "engineer", "viewer"] as const) {
    await db.role.create({ data: { id, name: ROLE_LABELS[id], description: ROLE_DESCRIPTIONS[id] } });
  }
  let adminId = "";
  for (const acc of demoAccounts()) {
    const u = await db.user.create({
      data: { login: acc.login, displayName: acc.displayName, roleId: acc.role, passwordHash: await bcrypt.hash(acc.password, 10) },
    });
    if (acc.role === "admin") adminId = u.id;
  }

  await db.factory.create({
    data: {
      id: FACTORY_ID,
      name: "Насосный завод «Industria» (условный)",
      description: "Синтетическая модель предприятия по сборке центробежных насосов. Не является реальным объектом.",
      isSynthetic: true,
    },
  });
  for (const s of STATIONS) {
    await db.station.create({
      data: {
        id: s.id,
        factoryId: FACTORY_ID,
        code: s.code,
        name: s.name,
        shortName: s.shortName,
        zone: s.zone,
        kind: s.kind,
        description: s.description,
        sortOrder: s.sortOrder,
        resources: { create: [{ id: s.resource.id, name: s.resource.name, kind: s.resource.kind, unitName: s.resource.unitName, description: s.resource.description }] },
      },
    });
  }
  await db.productionProcess.create({
    data: {
      id: PROCESS_ID,
      factoryId: FACTORY_ID,
      name: "Изготовление и сборка центробежного насоса",
      version: 1,
      nodes: { create: PROCESS_NODES.map((n) => ({ id: n.id, type: n.type, name: n.name, stationId: n.stationId, x: n.x, y: n.y })) },
    },
  });
  for (const e of PROCESS_EDGES) {
    await db.processEdge.create({
      data: { id: e.id, processId: PROCESS_ID, fromNodeId: e.from, toNodeId: e.to, label: e.label, condition: e.condition },
    });
  }

  for (const p of POINTS_OF_INTEREST) {
    await db.pointOfInterest.create({
      data: {
        id: p.id,
        factoryId: FACTORY_ID,
        stationId: p.stationId,
        title: p.title,
        kind: p.kind,
        description: p.description,
        bestPractice: p.bestPractice,
        cameraPresetId: p.cameraPresetId,
        metricKeys: p.metricKeys.join(","),
        media: {
          create: [
            {
              id: `media-${p.id}`,
              kind: "image",
              uri: `procedural://${p.cameraPresetId}`,
              title: `Ракурс 3D-сцены «${p.title}»`,
              license: "Процедурная визуализация проекта (без внешних файлов)",
              isPlaceholder: true,
            },
          ],
        },
      },
    });
  }
  for (const t of TOURS) {
    await db.tour.create({
      data: {
        id: t.id,
        factoryId: FACTORY_ID,
        name: t.name,
        audience: t.audience,
        description: t.description,
        stops: { create: t.stops.map((s, i) => ({ order: i + 1, poiId: s.poiId, title: s.title, narrative: s.narrative })) },
      },
    });
  }

  for (const sc of DEMO_SCENARIOS) {
    const p = sc.parameters;
    await db.scenario.create({
      data: {
        id: sc.id,
        processId: PROCESS_ID,
        name: sc.name,
        description: sc.description,
        isBaseline: sc.isBaseline,
        isSynthetic: true,
        createdById: adminId,
        horizonMin: p.horizonMin,
        releaseWindowMin: p.releaseWindowMin,
        arrivalKind: p.arrivalKind,
        arrivalRatePerHour: p.arrivalRatePerHour,
        defectProbability: p.defectProbability,
        retestDefectProbability: p.retestDefectProbability,
        maxReworkCycles: p.maxReworkCycles,
        materialCostPerUnitRub: p.materialCostPerUnitRub,
        fixedCostRub: p.fixedCostRub,
        seed: p.seed,
        replications: p.replications,
        stationParameters: {
          create: STATION_IDS.map((id) => {
            const sp = p.stations[id];
            return {
              stationId: id,
              capacity: sp.capacity,
              hourlyCostRub: sp.hourlyCostRub,
              consumablesPerOperationRub: sp.consumablesPerOperationRub,
              mtbfMin: sp.failure?.mtbfMin ?? null,
              mttrMin: sp.failure?.mttrMin ?? null,
              ...distributionToColumns(sp.processTime),
            };
          }),
        },
      },
    });
  }
  // Результаты демонстрационных прогонов вычисляются симулятором, а не задаются вручную.
  for (const sc of DEMO_SCENARIOS) await opts.runSimulations(sc.id);
}
