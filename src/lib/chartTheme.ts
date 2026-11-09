/**
 * Категориальная палитра графиков для светлой поверхности (#fff).
 * Проверена валидатором палитр (dataviz): яркость, насыщенность, различимость соседних пар
 * при дальтонизме (ΔE ≥ 13) и контраст ≥ 3:1. Порядок фиксирован: базовый, альтернатива 1, 2, 3.
 */
export const SERIES_COLORS = ["#1f66c9", "#c2577f", "#7c6bd6", "#13866a"] as const;

export const CHART = {
  grid: "#e6ebf1",
  axis: "#b4c0cd",
  text: "#5b6b7f",
  ink: "#0e1c2b",
  surface: "#ffffff",
  accent: "#1f66c9",
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#ffffff",
    border: "1px solid #dce2e9",
    borderRadius: 8,
    color: "#0e1c2b",
    fontSize: 13,
    boxShadow: "0 6px 20px #0e1c2b1a",
  },
  labelStyle: { color: "#5b6b7f", marginBottom: 4 },
  itemStyle: { color: "#0e1c2b" },
  cursor: { fill: "#1f66c910", stroke: "#1f66c9", strokeWidth: 1 },
} as const;
