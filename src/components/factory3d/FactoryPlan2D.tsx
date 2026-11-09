"use client";

import type { StationId } from "@/domain/model/demoData";
import { selectStation, useSelection } from "@/store/selection";
import { CONVEYORS, HALL, SCENE_STATUS_COLOR, STATION_LAYOUT } from "./sceneContract";
import type { StationSceneData } from "./StationAnchor";

/**
 * Упрощённый план цеха (вид сверху) по тем же координатам сцены.
 * Используется как резервный режим без WebGL и как облегчённый режим на слабых устройствах.
 */
export function FactoryPlan2D({ stations }: { stations: StationSceneData[] }) {
  const selected = useSelection((s) => s.selectedStationId);
  const pad = 1;
  const vb = `${-HALL.width / 2 - pad} ${-HALL.depth / 2 - pad} ${HALL.width + 2 * pad} ${HALL.depth + 2 * pad}`;
  return (
    <svg viewBox={vb} className="h-full w-full" role="group" aria-label="План цеха, вид сверху" data-testid="factory-plan-2d">
      <rect x={-HALL.width / 2} y={-HALL.depth / 2} width={HALL.width} height={HALL.depth} fill="#f7f9fb" stroke="#c2ccd7" strokeWidth={0.3} />
      {CONVEYORS.map((c) => (
        <line key={c.id} x1={c.from[0]} y1={c.from[2]} x2={c.to[0]} y2={c.to[2]} stroke="#9fb0c2" strokeWidth={1} strokeLinecap="round" />
      ))}
      {stations.map((s) => {
        const l = STATION_LAYOUT[s.stationId];
        const [w, d] = l.footprint;
        const color = SCENE_STATUS_COLOR[s.status ?? "none"];
        const isSel = selected === s.stationId;
        const q = Math.min(14, Math.round(s.queue));
        return (
          <g
            key={s.stationId}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            data-station-id={s.stationId}
            aria-label={`${s.code} ${s.shortName}`}
            onClick={() => selectStation(s.stationId as StationId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectStation(s.stationId as StationId);
              }
            }}
            className="cursor-pointer outline-none"
          >
            <rect
              x={l.position[0] - w / 2}
              y={l.position[2] - d / 2}
              width={w}
              height={d}
              rx={0.6}
              fill={isSel ? "#e8f0fb" : "#ffffff"}
              stroke={isSel ? "#1f66c9" : color}
              strokeWidth={isSel ? 0.5 : 0.3}
            />
            <text x={l.position[0] - w / 2 + 0.8} y={l.position[2] - d / 2 + 2.2} fill="#1f66c9" fontSize={1.7} fontWeight={700}>
              {s.code}
            </text>
            <text x={l.position[0] - w / 2 + 0.8} y={l.position[2] - d / 2 + 4.3} fill="#0e1c2b" fontSize={1.5}>
              {s.shortName}
            </text>
            <text x={l.position[0] - w / 2 + 0.8} y={l.position[2] - d / 2 + 6.2} fill="#526377" fontSize={1.2}>
              {s.utilization !== null ? `${(s.utilization * 100).toFixed(0)}%` : "—"}, очередь {Math.round(s.queue)}, ресурс {s.capacity}
            </text>
            <circle cx={l.position[0] + w / 2 - 1.2} cy={l.position[2] - d / 2 + 1.4} r={0.6} fill={color} />
            {Array.from({ length: q }).map((_, i) => (
              <rect
                key={i}
                x={l.position[0] + l.queueOffset[0] + l.queueDirection[0] * (i % 7) * 1.05 - 0.4}
                y={l.position[2] + l.queueOffset[2] + Math.floor(i / 7) * 1.1 - 0.4}
                width={0.8}
                height={0.8}
                rx={0.15}
                fill="#e08a12"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
