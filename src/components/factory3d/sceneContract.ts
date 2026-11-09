/**
 * Технический контракт 3D-сцены (см. docs/3d/SCENE_CONTRACT.md).
 *
 * Система координат: правая, ось Y — вверх, ось X — направление потока изделия (слева направо),
 * ось Z — к зрителю. Единица — 1 метр. Начало координат — центр цеха на уровне пола.
 * Все объекты участков привязаны к тем же stationId, что процесс, ресурсы и метрики симуляции.
 */
import type { StationId, StationKind } from "@/domain/model/demoData";

export type Vec3 = [number, number, number];

export interface StationLayout {
  stationId: StationId;
  kind: StationKind;
  /** Центр зоны участка на полу. */
  position: Vec3;
  /** Размер зоны по X и Z, м. */
  footprint: [number, number];
  /** Точка, где выстраивается очередь изделий (относительно центра участка). */
  queueOffset: Vec3;
  /** Направление роста очереди (единичный вектор в плоскости пола). */
  queueDirection: Vec3;
  /** Высота подписи метрик над полом, м. */
  labelHeight: number;
}

export const HALL = { width: 70, depth: 36, wallHeight: 7 } as const;

export const STATION_LAYOUT: Record<StationId, StationLayout> = {
  "st-receiving": { stationId: "st-receiving", kind: "warehouse", position: [-26, 0, -6], footprint: [12, 11], queueOffset: [5.2, 0, 7.5], queueDirection: [-1, 0, 0], labelHeight: 6.4 },
  "st-machining": { stationId: "st-machining", kind: "machining", position: [-11, 0, -6], footprint: [13, 11], queueOffset: [-5.5, 0, 7.5], queueDirection: [-1, 0, 0], labelHeight: 5.6 },
  "st-assembly": { stationId: "st-assembly", kind: "assembly", position: [3.5, 0, -6], footprint: [12, 11], queueOffset: [-5, 0, 7.5], queueDirection: [-1, 0, 0], labelHeight: 5.6 },
  "st-testing": { stationId: "st-testing", kind: "testing", position: [17, 0, -6], footprint: [11, 11], queueOffset: [-4.5, 0, 7.5], queueDirection: [-1, 0, 0], labelHeight: 5.4 },
  "st-rework": { stationId: "st-rework", kind: "rework", position: [17, 0, 11], footprint: [11, 8], queueOffset: [5.5, 0, -2.5], queueDirection: [1, 0, 0], labelHeight: 4.4 },
  "st-packing": { stationId: "st-packing", kind: "shipping", position: [29.5, 0, -6], footprint: [10, 11], queueOffset: [-4, 0, 7.5], queueDirection: [-1, 0, 0], labelHeight: 5 },
};

/** Главный конвейер вдоль потока и ответвление на доработку. */
export const CONVEYORS: Array<{ id: string; from: Vec3; to: Vec3 }> = [
  { id: "cv-main", from: [-31, 0, 1.5], to: [34, 0, 1.5] },
  { id: "cv-rework-out", from: [22.5, 0, 2.6], to: [22.5, 0, 7.5] },
  { id: "cv-rework-back", from: [12.5, 0, 7.5], to: [12.5, 0, 2.6] },
];

export interface CameraPreset {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
}

const stationCamera = (id: StationId, label: string, offset: Vec3 = [7, 8, 14]): CameraPreset => {
  const p = STATION_LAYOUT[id].position;
  return {
    id: `cam-${id.replace("st-", "")}`,
    label,
    position: [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]],
    target: [p[0], 1.2, p[2] + 1],
  };
};

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  "cam-overview": { id: "cam-overview", label: "Общий план", position: [7, 30, 40], target: [0, 0, 1] },
  "cam-top": { id: "cam-top", label: "План сверху", position: [0, 62, 4], target: [0, 0, 0.5] },
  "cam-receiving": stationCamera("st-receiving", "Склад"),
  "cam-machining": stationCamera("st-machining", "Мехобработка"),
  "cam-assembly": stationCamera("st-assembly", "Сборка"),
  "cam-testing": stationCamera("st-testing", "Испытания"),
  "cam-rework": stationCamera("st-rework", "Доработка", [6, 7, 12]),
  "cam-packing": stationCamera("st-packing", "Отгрузка", [-5, 8, 14]),
};

export function cameraForStation(id: StationId): CameraPreset {
  return CAMERA_PRESETS[`cam-${id.replace("st-", "")}`] ?? CAMERA_PRESETS["cam-overview"]!;
}

/** Цвета состояния (совпадают с UI-статусами). */
export const SCENE_STATUS_COLOR = { normal: "#1d9a66", high: "#e08a12", critical: "#d2412f", none: "#8a98a8" } as const;

/** Ограничения визуализации очередей. */
export const MAX_QUEUE_ITEMS_PER_STATION = 14;
export const QUEUE_ITEM_SPACING = 1.05;
