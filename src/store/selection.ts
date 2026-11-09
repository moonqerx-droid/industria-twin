"use client";

import { create } from "zustand";
import { isStationId, type StationId } from "@/domain/model/demoData";

/**
 * Единый механизм выбора участка. Один и тот же stationId подсвечивает узел мнемосхемы,
 * оборудование в 3D-сцене, строку таблицы и открывает панель метрик.
 * Выбор синхронизируется с параметром URL `station`, поэтому переживает переход между страницами.
 */
interface SelectionState {
  selectedStationId: StationId | null;
  hoveredStationId: StationId | null;
  selectStation: (stationId: StationId | null) => void;
  hoverStation: (stationId: StationId | null) => void;
}

function writeUrl(stationId: StationId | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (stationId) url.searchParams.set("station", stationId);
  else url.searchParams.delete("station");
  window.history.replaceState(window.history.state, "", url.toString());
}

export const useSelection = create<SelectionState>((set, get) => ({
  selectedStationId: null,
  hoveredStationId: null,
  selectStation: (stationId) => {
    if (get().selectedStationId === stationId) return;
    set({ selectedStationId: stationId });
    writeUrl(stationId);
  },
  hoverStation: (stationId) => set({ hoveredStationId: stationId }),
}));

/** Типизированная точка входа для кода вне React (например, обработчиков 3D-сцены). */
export function selectStation(stationId: StationId | null): void {
  useSelection.getState().selectStation(stationId);
}

export function parseStationParam(value: string | null | undefined): StationId | null {
  return value && isStationId(value) ? value : null;
}
