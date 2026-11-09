"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { STATION_IDS, type StationId } from "@/domain/model/demoData";
import type { ReplayDto } from "@/server/services/simulationService";
import { useSceneResources } from "./resources";
import { useScene } from "./sceneStore";
import { STATION_LAYOUT, type Vec3 } from "./sceneContract";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Движение изделий в режиме воспроизведения (ReplayFlow).
 *
 * Строится по журналу событий репликации №1: каждое поступление, переход между участками, возврат на
 * доработку и отгрузка превращаются в «перемещение» по полилинии через главный конвейер. В модели
 * переходы мгновенны (транспорт не моделируется), поэтому анимация иллюстративна: перемещение
 * показывается после события в течение времени, пропорционального длине пути (от MIN_TRANSIT до MAX_TRANSIT
 * модельных минут), а счётчики очередей участков
 * берутся из кадров состояния. Все изделия — один InstancedMesh на деталь, матрицы обновляются в useFrame
 * без перерисовки React.
 */
export const MIN_TRANSIT = 2.5;
export const MAX_TRANSIT = 6;
/** Иллюстративная скорость перемещения, м за модельную минуту. */
const METERS_PER_MIN = 8;
const MAX_MOVING = 48;
const BELT_Z = 1.5;
const ENTRY: Vec3 = [-34, 0, BELT_Z];
const EXIT: Vec3 = [37, 0, BELT_Z];

export interface Move {
  t0: number;
  /** Длительность анимации, модельные мин. */
  dur: number;
  path: Vec3[];
  /** Накопленные длины сегментов (для равномерной скорости). */
  cum: number[];
  scrap: boolean;
}

const queuePoint = (id: StationId): Vec3 => {
  const l = STATION_LAYOUT[id];
  return [l.position[0] + l.queueOffset[0], 0, l.position[2] + l.queueOffset[2]];
};
const workPoint = (id: StationId): Vec3 => {
  const p = STATION_LAYOUT[id].position;
  return [p[0], 0, p[2] + 3.2];
};

/** Полилиния от точки до точки через ближайшую линию конвейера (выход к ленте → вдоль ленты → к цели). */
function route(from: Vec3, to: Vec3): Vec3[] {
  const pts: Vec3[] = [from, [from[0], 0, BELT_Z], [to[0], 0, BELT_Z], to];
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[2] - pts[i - 1]![2]) > 0.05);
}

function withLengths(t0: number, path: Vec3[], scrap = false): Move {
  const cum = [0];
  for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![2] - path[i - 1]![2]));
  const len = cum[cum.length - 1]!;
  return { t0, dur: Math.min(MAX_TRANSIT, Math.max(MIN_TRANSIT, len / METERS_PER_MIN)), path, cum, scrap };
}

/** Перемещения по журналу: [t, тип, изделие, индекс участка, дефект]. */
export function buildMoves(replay: Pick<ReplayDto, "events" | "eventTypes" | "stationIds">): Move[] {
  const type = (i: number) => replay.eventTypes[i];
  const lastStation = new Map<number, StationId>();
  const moves: Move[] = [];
  for (const [t, ti, unit, si] of replay.events) {
    const ev = type(ti);
    const st = si >= 0 ? (replay.stationIds[si] as StationId | undefined) : undefined;
    if (ev === "QUEUE_ENTER" && st && (STATION_IDS as readonly string[]).includes(st)) {
      const prev = lastStation.get(unit);
      const from = prev ? workPoint(prev) : ENTRY;
      moves.push(withLengths(t, route(from, queuePoint(st))));
      lastStation.set(unit, st);
    } else if (ev === "DEPARTURE" || ev === "SCRAP") {
      const prev = lastStation.get(unit);
      if (prev) moves.push(withLengths(t, route(workPoint(prev), ev === "SCRAP" ? [EXIT[0], 0, 12] : EXIT), ev === "SCRAP"));
      lastStation.delete(unit);
    }
  }
  return moves.sort((a, b) => a.t0 - b.t0);
}

function pointAt(m: Move, k: number, out: THREE.Vector3): THREE.Vector3 {
  const total = m.cum[m.cum.length - 1]!;
  const d = Math.min(total, Math.max(0, k * total));
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i]! < d) i += 1;
  const a = m.path[i - 1]!;
  const b = m.path[i] ?? a;
  const seg = m.cum[i]! - m.cum[i - 1]!;
  const u = seg > 0 ? (d - m.cum[i - 1]!) / seg : 1;
  return out.set(a[0] + (b[0] - a[0]) * u, 0, a[2] + (b[2] - a[2]) * u);
}

const tmp = new THREE.Object3D();
const pos = new THREE.Vector3();

export function ReplayFlow({ replay }: { replay: Pick<ReplayDto, "events" | "eventTypes" | "stationIds"> }) {
  const { g, m } = useSceneResources();
  const reduced = useReducedMotion();
  const moves = useMemo(() => buildMoves(replay), [replay]);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const motors = useRef<THREE.InstancedMesh>(null);
  const scrapMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.6 }), []);
  const scrapBodies = useRef<THREE.InstancedMesh>(null);
  const pucks = useRef<THREE.InstancedMesh>(null);
  const puckMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#3d86e8", transparent: true, opacity: 0.85, toneMapped: false }), []);
  useEffect(() => () => puckMat.dispose(), [puckMat]);
  useEffect(() => () => scrapMat.dispose(), [scrapMat]);

  useFrame(() => {
    const t = useScene.getState().replayTime;
    // Бинарный поиск первого перемещения, которое ещё может быть активным (t0 > t − MAX_TRANSIT).
    let lo = 0;
    let hi = moves.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (moves[mid]!.t0 <= t - MAX_TRANSIT) lo = mid + 1;
      else hi = mid;
    }
    let n = 0;
    let ns = 0;
    for (let i = lo; i < moves.length && moves[i]!.t0 <= t; i += 1) {
      const mv = moves[i]!;
      if (t - mv.t0 > mv.dur) continue;
      // При reduced-motion изделие показывается в конечной точке без промежуточного движения.
      const k = reduced ? 1 : (t - mv.t0) / mv.dur;
      pointAt(mv, k, pos);
      if (mv.scrap) {
        if (ns >= 8) continue;
        tmp.position.set(pos.x, 0.5, pos.z);
        tmp.rotation.set(Math.PI / 2, 0, 0);
        tmp.scale.set(0.5, 0.22, 0.5);
        tmp.updateMatrix();
        scrapBodies.current?.setMatrixAt(ns, tmp.matrix);
        ns += 1;
        continue;
      }
      if (n >= MAX_MOVING) continue;
      const S = 1.4;
      tmp.position.set(pos.x + 0.12 * S, 0.75, pos.z);
      tmp.rotation.set(Math.PI / 2, 0, 0);
      tmp.scale.set(0.5 * S, 0.22 * S, 0.5 * S);
      tmp.updateMatrix();
      bodies.current?.setMatrixAt(n, tmp.matrix);
      tmp.position.set(pos.x - 0.2 * S, 0.7, pos.z);
      tmp.rotation.set(0, 0, Math.PI / 2);
      tmp.scale.set(0.32 * S, 0.42 * S, 0.32 * S);
      tmp.updateMatrix();
      motors.current?.setMatrixAt(n, tmp.matrix);
      tmp.position.set(pos.x, 0.06, pos.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1.5, 0.04, 1.5);
      tmp.updateMatrix();
      pucks.current?.setMatrixAt(n, tmp.matrix);
      n += 1;
    }
    for (const [ref, count] of [[bodies, n], [motors, n], [pucks, n], [scrapBodies, ns]] as const) {
      if (!ref.current) continue;
      ref.current.count = count;
      ref.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group dispose={null}>
      <instancedMesh ref={bodies} args={[g.cyl, m.pumpBody, MAX_MOVING]} castShadow frustumCulled={false} />
      <instancedMesh ref={motors} args={[g.cyl, m.pumpMotor, MAX_MOVING]} castShadow frustumCulled={false} />
      <instancedMesh ref={pucks} args={[g.cyl, puckMat, MAX_MOVING]} frustumCulled={false} />
      <instancedMesh ref={scrapBodies} args={[g.cyl, scrapMat, 8]} frustumCulled={false} />
    </group>
  );
}
