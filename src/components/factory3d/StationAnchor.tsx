"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import type { StationId } from "@/domain/model/demoData";
import { selectStation, useSelection } from "@/store/selection";
import { EquipmentModel } from "./models";
import { useSceneResources } from "./resources";
import { SCENE_STATUS_COLOR, STATION_LAYOUT, cameraForStation } from "./sceneContract";
import { useReducedMotion } from "./useReducedMotion";
import { useScene } from "./sceneStore";

export interface StationSceneData {
  stationId: StationId;
  code: string;
  shortName: string;
  capacity: number;
  status: "normal" | "high" | "critical" | null;
  /** Значения для отображения в текущем режиме. */
  busy: number;
  /** Единиц в ремонте (воспроизведение) или среднее (экскурсия). */
  down: number;
  queue: number;
  utilization: number | null;
  poiId: string | null;
}

/**
 * Подсветка участка (SelectionOutline): контур зоны в цвете состояния и полупрозрачная заливка.
 * Выбранный участок «дышит» контуром, при наведении контур проявляется.
 */
function StationHighlight({ footprint, color, selected, hovered }: { footprint: [number, number]; color: string; selected: boolean; hovered: boolean }) {
  const { g } = useSceneResources();
  const reduced = useReducedMotion();
  const frame = useRef<THREE.Group>(null);
  const [w, d] = footprint;
  const t = 0.16;
  useFrame(({ clock }) => {
    if (!frame.current) return;
    const s = selected && !reduced ? 1 + Math.sin(clock.elapsedTime * 2.4) * 0.008 : 1;
    frame.current.scale.set(s, 1, s);
  });
  const lineOpacity = selected ? 1 : hovered ? 0.75 : 0;
  const fillOpacity = selected ? 0.16 : hovered ? 0.09 : 0;
  return (
    <group ref={frame} position={[0, 0.03, 0]}>
      <mesh geometry={g.plane} rotation={[-Math.PI / 2, 0, 0]} scale={[w, d, 1]} visible={fillOpacity > 0}>
        <meshBasicMaterial color={color} transparent opacity={fillOpacity} depthWrite={false} toneMapped={false} />
      </mesh>
      {[
        [0, -d / 2 - t / 2, w + t * 2, t],
        [0, d / 2 + t / 2, w + t * 2, t],
        [-w / 2 - t / 2, 0, t, d],
        [w / 2 + t / 2, 0, t, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={g.plane} rotation={[-Math.PI / 2, 0, 0]} position={[x!, 0.002, z!]} scale={[sx!, sz!, 1]} visible={lineOpacity > 0}>
          <meshBasicMaterial color={color} transparent opacity={lineOpacity} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Выноска с метриками над участком (MetricsOverlay) и точка интереса (PointOfInterest). */
function MetricsOverlay({ data, height, selected, expanded }: { data: StationSceneData; height: number; selected: boolean; expanded: boolean }) {
  const color = SCENE_STATUS_COLOR[data.status ?? "none"];
  const { g, m } = useSceneResources();
  return (
    <>
      {/* Тонкая стойка-указатель от оборудования к выноске */}
      <mesh geometry={g.cylLow} material={m.darkSteel} position={[0, height / 2 + 0.9, 0]} scale={[0.035, height - 1.8, 0.035]} />
      <Html position={[0, height, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="station-label pointer-events-auto select-none whitespace-nowrap rounded-lg border bg-white/95 px-2.5 py-1.5 text-[12px] leading-tight text-[#0e1c2b]"
          style={{ borderColor: selected ? "#1f66c9" : "#d3dbe4", boxShadow: selected ? "0 0 0 3px #1f66c92e, 0 6px 18px #0e1c2b1c" : undefined }}
        >
          <button
            type="button"
            data-poi-id={data.poiId ?? undefined}
            data-station-id={data.stationId}
            onClick={() => {
              selectStation(data.stationId);
              useScene.getState().flyTo(cameraForStation(data.stationId).id);
            }}
            className="flex items-center gap-2 font-medium"
            aria-label={`Точка интереса: ${data.shortName}`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px ${color}2e` }} />
            <span className="font-mono font-semibold text-[#1f66c9]">{data.code}</span>
            {expanded && data.shortName}
          </button>
          {expanded && (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-[#526377]">
              <span><span className="font-semibold text-[#0e1c2b]">{data.utilization !== null ? `${(data.utilization * 100).toFixed(0)}%` : "—"}</span> загрузка</span>
              <span><span className="font-semibold text-[#0e1c2b]">{Math.round(data.queue)}</span> в очереди</span>
              {Math.round(data.down) > 0 && (
                <span className="font-semibold text-[#c0392b]">{Math.round(data.down)} в ремонте</span>
              )}
            </div>
          )}
          {expanded && data.utilization !== null && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e6ebf1]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, data.utilization * 100))}%`, background: color }} />
            </div>
          )}
        </div>
      </Html>
    </>
  );
}

export function StationAnchor({ data }: { data: StationSceneData }) {
  const layout = STATION_LAYOUT[data.stationId];
  const selected = useSelection((s) => s.selectedStationId === data.stationId);
  const hovered = useSelection((s) => s.hoveredStationId === data.stationId);
  const hover = useSelection((s) => s.hoverStation);
  const color = SCENE_STATUS_COLOR[data.status ?? "none"];

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectStation(data.stationId);
    useScene.getState().flyTo(cameraForStation(data.stationId).id);
  };

  return (
    <group
      position={layout.position}
      name={data.stationId}
      userData={{ stationId: data.stationId }}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(data.stationId);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hover(null);
        document.body.style.cursor = "";
      }}
      dispose={null}
    >
      <StationHighlight footprint={layout.footprint} color={color} selected={selected} hovered={hovered} />
      <EquipmentModel kind={layout.kind} capacity={data.capacity} busy={Math.round(data.busy)} down={Math.round(data.down)} statusColor={color} footprint={layout.footprint} />
      <MetricsOverlay data={data} height={layout.labelHeight} selected={selected} expanded={selected || hovered} />
    </group>
  );
}
