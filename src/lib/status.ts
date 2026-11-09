import type { StationStatus } from "@/domain/analysis/bottleneck";

/** Цвета состояния участка — зарезервированы, не используются для серий графиков. */
export const STATUS_COLOR: Record<StationStatus, string> = {
  normal: "#1d7f55",
  high: "#c27a12",
  critical: "#bf3a2b",
};

export const STATUS_TEXT_CLASS: Record<StationStatus, string> = {
  normal: "text-ok",
  high: "text-warn",
  critical: "text-crit",
};
