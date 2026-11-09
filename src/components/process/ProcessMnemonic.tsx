"use client";

import type { StationId } from "@/domain/model/demoData";
import { STATUS_LABELS } from "@/domain/analysis/bottleneck";
import { fmtNumber, fmtPercent, fmtRub } from "@/lib/format";
import { STATUS_COLOR } from "@/lib/status";
import type { StationView } from "@/lib/views";
import { useSelection } from "@/store/selection";

interface NodeDto {
  id: string;
  type: string;
  name: string;
  stationId: string | null;
  x: number;
  y: number;
}
interface EdgeDto {
  id: string;
  from: string;
  to: string;
  label: string | null;
  condition: string;
}

const W = 1200;
const H = 560;
const NODE_W = 158;
const NODE_H = 128;
const px = (x: number) => (x / 100) * W;
const py = (y: number) => (y / 100) * H;

function nodeBox(n: NodeDto) {
  const cx = px(n.x);
  const cy = py(n.y);
  if (n.type === "task") return { cx, cy, hw: NODE_W / 2, hh: NODE_H / 2 };
  if (n.type === "gateway") return { cx, cy, hw: 26, hh: 26 };
  return { cx, cy, hw: 20, hh: 20 };
}

/** Ортогональная «трубопроводная» трасса между узлами. */
function edgePath(a: NodeDto, b: NodeDto): { d: string; lx: number; ly: number; mid?: boolean } {
  const A = nodeBox(a);
  const B = nodeBox(b);
  if (Math.abs(A.cy - B.cy) < 1) {
    const dir = B.cx > A.cx ? 1 : -1;
    const x1 = A.cx + dir * A.hw;
    const x2 = B.cx - dir * B.hw;
    return { d: `M${x1},${A.cy} L${x2},${B.cy}`, lx: (x1 + x2) / 2, ly: A.cy - 8 };
  }
  if (Math.abs(A.cx - B.cx) < 1) {
    const dir = B.cy > A.cy ? 1 : -1;
    const y1 = A.cy + dir * A.hh;
    const y2 = B.cy - dir * B.hh;
    return { d: `M${A.cx},${y1} L${B.cx},${y2}`, lx: A.cx + 10, ly: (y1 + y2) / 2 };
  }
  // Вниз, затем горизонтально к цели.
  const y1 = A.cy + (B.cy > A.cy ? A.hh : -A.hh);
  const x2 = B.cx + (A.cx > B.cx ? B.hw : -B.hw);
  // Подпись — над горизонтальным участком трассы, чтобы ветки из одного шлюза не накладывались.
  return { d: `M${A.cx},${y1} L${A.cx},${B.cy} L${x2},${B.cy}`, lx: (A.cx + x2) / 2, ly: B.cy - 8, mid: true };
}

export function ProcessMnemonic({ nodes, edges, stations }: { nodes: NodeDto[]; edges: EdgeDto[]; stations: StationView[] }) {
  const selected = useSelection((s) => s.selectedStationId);
  const select = useSelection((s) => s.selectStation);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stationMap = new Map(stations.map((s) => [s.stationId, s]));
  const reworkEdge = (e: EdgeDto) => e.condition === "fail" || e.from === "pn-rework";

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[860px]"
        role="group"
        aria-label="Мнемосхема процесса изготовления насоса"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#7e90a7" />
          </marker>
          <marker id="arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#c27a12" />
          </marker>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0 L0 0 0 24" fill="none" stroke="#f1f5fa" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />

        {edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const p = edgePath(a, b);
          const warn = reworkEdge(e);
          return (
            <g key={e.id}>
              <path
                d={p.d}
                fill="none"
                stroke={warn ? "#c27a12" : "#c8d4e1"}
                strokeWidth={warn ? 2 : 3}
                strokeDasharray={e.condition === "scrap" ? "6 5" : warn ? "8 5" : undefined}
                markerEnd={`url(#${warn ? "arrow-warn" : "arrow"})`}
              />
              {e.label && (
                <text x={p.lx} y={p.ly} fill="#526377" fontSize="13" stroke="#ffffff" strokeWidth={4} paintOrder="stroke" textAnchor={p.mid || Math.abs(a.y - b.y) < 0.01 ? "middle" : "start"}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const box = nodeBox(n);
          if (n.type === "start" || n.type === "end") {
            return (
              <g key={n.id}>
                <circle cx={box.cx} cy={box.cy} r={18} fill="#ffffff" stroke={n.type === "start" ? "#1f66c9" : "#526377"} strokeWidth={n.type === "end" ? 4 : 2} />
                <text x={box.cx} y={box.cy + 38} textAnchor="middle" fill="#526377" fontSize="13">
                  {n.name.split(" ").map((w, i) => (
                    <tspan key={i} x={box.cx} dy={i === 0 ? 0 : 16}>{w}</tspan>
                  ))}
                </text>
              </g>
            );
          }
          if (n.type === "gateway") {
            return (
              <g key={n.id}>
                <path
                  d={`M${box.cx},${box.cy - 26} L${box.cx + 26},${box.cy} L${box.cx},${box.cy + 26} L${box.cx - 26},${box.cy} z`}
                  fill="#ffffff"
                  stroke="#526377"
                  strokeWidth={2}
                />
                <text x={box.cx} y={box.cy + 5} textAnchor="middle" fill="#0e1c2b" fontSize="16" fontWeight={600}>
                  ×
                </text>
                <text x={box.cx} y={box.cy - 36} textAnchor="middle" fill="#526377" fontSize="13">
                  {n.name}
                </text>
              </g>
            );
          }
          const st = n.stationId ? stationMap.get(n.stationId) : undefined;
          const status = st?.status ?? null;
          const color = status ? STATUS_COLOR[status] : "#7e90a7";
          const isSel = !!st && selected === st.stationId;
          const u = st?.metrics.utilization?.mean ?? 0;
          const q = st?.metrics.avgQueueLength?.mean ?? 0;
          const x0 = box.cx - NODE_W / 2;
          const y0 = box.cy - NODE_H / 2;
          const tokens = Math.min(8, Math.round(q));
          const toggle = () => st && select(isSel ? null : (st.stationId as StationId));
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              data-station-id={st?.stationId}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={`${st?.name ?? n.name}: ${status ? STATUS_LABELS[status] : "нет данных"}, загрузка ${fmtPercent(u)}`}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>rect:first-of-type]:stroke-[#1f66c9]"
            >
              {/* Очередь перед участком: одна метка ≈ одно изделие (средняя очередь, округлённо, максимум 8). */}
              {Array.from({ length: tokens }).map((_, i) => (
                <rect key={i} x={x0 - 12 - (i % 4) * 9} y={box.cy - 20 + Math.floor(i / 4) * 12} width={6} height={8} rx={1.5} fill="#c27a12" opacity={0.85} />
              ))}
              <rect
                x={x0}
                y={y0}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isSel ? "#e9f2fc" : "#ffffff"}
                stroke={isSel ? "#1f66c9" : "#c8d4e1"}
                strokeWidth={isSel ? 2.5 : 1.5}
              />
              <rect x={x0} y={y0} width={5} height={NODE_H} rx={2} fill={color} />
              <text x={x0 + 16} y={y0 + 22} fill="#1f66c9" fontSize="13" fontWeight={700}>
                {st?.code}
              </text>
              <circle cx={x0 + NODE_W - 16} cy={y0 + 17} r={6} fill={color}>
                {status === "critical" && <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />}
              </circle>
              <text x={x0 + 16} y={y0 + 42} fill="#0e1c2b" fontSize="15" fontWeight={600}>
                {n.name}
              </text>
              <text x={x0 + 16} y={y0 + 60} fill="#526377" fontSize="12">
                {st ? `${fmtNumber(st.metrics.capacity?.mean, 0)} ${st.unitName}, ${fmtNumber(st.metrics.throughputPerHour?.mean, 2)} оп./ч` : ""}
              </text>
              <text x={x0 + 16} y={y0 + 78} fill="#526377" fontSize="12">
                {st ? `Очередь ${fmtNumber(q, 1)}, ${fmtRub((st.metrics.resourceCostRub?.mean ?? 0) + (st.metrics.consumablesCostRub?.mean ?? 0))}` : ""}
              </text>
              <rect x={x0 + 16} y={y0 + 94} width={NODE_W - 32} height={6} rx={3} fill="#e8eef5" />
              <rect x={x0 + 16} y={y0 + 94} width={(NODE_W - 32) * Math.min(1, u)} height={6} rx={3} fill={color} />
              <text x={x0 + 16} y={y0 + 116} fill="#0e1c2b" fontSize="12">
                Загрузка {fmtPercent(u)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
