"use client";

import { create } from "zustand";

export type SceneMode = "tour" | "replay";
export type QualityLevel = "auto" | "low" | "high";

/** Компактное состояние участка для визуализации: очередь и число занятых единиц ресурса. */
export interface StationVisualState {
  queue: number;
  busy: number;
}

interface SceneState {
  mode: SceneMode;
  cameraPresetId: string;
  /** Увеличивается при каждом запросе перелёта камеры (даже на тот же ракурс). */
  cameraRequest: number;
  quality: QualityLevel;
  effectiveQuality: "low" | "high";
  replayFrame: number;
  /** Непрерывное модельное время воспроизведения, мин (кадр = последний снимок не позже этого времени). */
  replayTime: number;
  playing: boolean;
  speed: number;
  setMode: (m: SceneMode) => void;
  flyTo: (presetId: string) => void;
  setQuality: (q: QualityLevel) => void;
  setEffectiveQuality: (q: "low" | "high") => void;
  setReplayFrame: (i: number) => void;
  /** Перемотка: модельное время и соответствующий кадр одновременно. */
  seekReplay: (time: number, frame: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
}

export const useScene = create<SceneState>((set) => ({
  mode: "tour",
  cameraPresetId: "cam-overview",
  cameraRequest: 0,
  quality: "auto",
  effectiveQuality: "high",
  replayFrame: 0,
  replayTime: 0,
  playing: false,
  speed: 1,
  setMode: (mode) => set({ mode, playing: false }),
  flyTo: (cameraPresetId) => set((s) => ({ cameraPresetId, cameraRequest: s.cameraRequest + 1 })),
  setQuality: (quality) => set({ quality }),
  setEffectiveQuality: (effectiveQuality) => set({ effectiveQuality }),
  setReplayFrame: (replayFrame) => set({ replayFrame }),
  seekReplay: (replayTime, replayFrame) => set((s) => (s.replayFrame === replayFrame ? { replayTime } : { replayTime, replayFrame })),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));
