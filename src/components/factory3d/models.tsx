"use client";

/**
 * Процедурные модели оборудования. Каждая модель собрана из нескольких примитивов,
 * формирующих узнаваемый промышленный силуэт. Модели не содержат бизнес-логики:
 * они получают только число единиц ресурса, число занятых единиц и цвет состояния.
 * Для замены на GLB достаточно реализовать тот же интерфейс EquipmentModelProps (см. ASSET_MANIFEST.md).
 */
import { Html } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { StationKind } from "@/domain/model/demoData";
import { emissiveMaterial, useSceneResources } from "./resources";
import { useReducedMotion } from "./useReducedMotion";
import type { Vec3 } from "./sceneContract";

export interface EquipmentModelProps {
  kind: StationKind;
  /** Число единиц ресурса (станков, постов, стендов) — из параметров выбранного прогона. */
  capacity: number;
  /** Число занятых единиц в текущем кадре (тур — среднее по прогону, воспроизведение — кадр события). */
  busy: number;
  /** Число единиц в ремонте (только в режиме воспроизведения). */
  down?: number;
  statusColor: string;
  footprint: [number, number];
}

function Box({ p, s, m, r }: { p: Vec3; s: Vec3; m: THREE.Material; r?: Vec3 }) {
  const { g } = useSceneResources();
  return <mesh geometry={g.box} material={m} position={p} scale={s} rotation={r} castShadow receiveShadow />;
}

function Cyl({ p, s, m, r, low }: { p: Vec3; s: Vec3; m: THREE.Material; r?: Vec3; low?: boolean }) {
  const { g } = useSceneResources();
  return <mesh geometry={low ? g.cylLow : g.cyl} material={m} position={p} scale={s} rotation={r} castShadow />;
}

/** Сигнальная колонна (андон): нижняя секция — работа, верхние — предупреждение/авария. */
export function StackLight({ position, statusColor, active }: { position: Vec3; statusColor: string; active: boolean }) {
  const { m } = useSceneResources();
  // Единица в ремонте: горит только красная секция, независимо от занятости.
  const broken = statusColor === BROKEN_COLOR;
  const lit = (c: string) =>
    broken ? (c === "#d2412f" ? emissiveMaterial(c) : m.lampOff) : active && statusColor === c ? emissiveMaterial(c) : m.lampOff;
  return (
    <group position={position}>
      <Cyl p={[0, 0.25, 0]} s={[0.05, 0.5, 0.05]} m={m.darkSteel} low />
      <Cyl p={[0, 0.58, 0]} s={[0.16, 0.16, 0.16]} m={lit("#1d9a66")} low />
      <Cyl p={[0, 0.75, 0]} s={[0.16, 0.16, 0.16]} m={lit("#e08a12")} low />
      <Cyl p={[0, 0.92, 0]} s={[0.16, 0.16, 0.16]} m={lit("#d2412f")} low />
    </group>
  );
}

/** Центробежный насос: рама, электродвигатель, улитка, патрубки. Единица — 1 изделие. */
export function PumpModel({ position = [0, 0, 0], scale = 1 }: { position?: Vec3; scale?: number }) {
  const { g, m } = useSceneResources();
  return (
    <group position={position} scale={scale}>
      <Box p={[0, 0.06, 0]} s={[0.9, 0.12, 0.42]} m={m.darkSteel} />
      {Array.from({ length: 7 }, (_, i) => <Cyl key={i} p={[-0.4 + i * 0.07, 0.34, 0]} s={[0.4, 0.025, 0.4]} m={m.pumpMotor} r={[0, 0, Math.PI / 2]} />)}
      {[-0.32, 0.32].map((x) => [-0.15, 0.15].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.14, z]} s={[0.045, 0.04, 0.045]} m={m.steel} low />))}
      <Cyl p={[-0.18, 0.34, 0]} s={[0.36, 0.5, 0.36]} m={m.pumpMotor} r={[0, 0, Math.PI / 2]} />
      <Cyl p={[0.24, 0.36, 0]} s={[0.5, 0.2, 0.5]} m={m.pumpBody} r={[Math.PI / 2, 0, 0]} />
      <mesh geometry={g.torus} material={m.pumpBody} position={[0.24, 0.36, 0]} scale={[0.6, 0.6, 0.9]} />
      <Cyl p={[0.24, 0.66, 0]} s={[0.14, 0.22, 0.14]} m={m.pumpBody} />
      <Cyl p={[0.42, 0.36, 0]} s={[0.14, 0.2, 0.14]} m={m.pumpBody} r={[0, 0, Math.PI / 2]} />
    </group>
  );
}

function Worker({ position, active }: { position: Vec3; active: boolean }) {
  const { g, m } = useSceneResources();
  if (!active) return null;
  return (
    <group position={position}>
      <Box p={[0, 0.9, 0]} s={[0.42, 0.58, 0.26]} m={m.worker} />
      {[-0.13, 0.13].map((x) => <group key={x}>
        <Cyl p={[x, 0.36, 0]} s={[0.15, 0.65, 0.15]} m={m.darkSteel} low />
        <Box p={[x, 0.06, 0.06]} s={[0.18, 0.12, 0.3]} m={m.rubber} />
        <Cyl p={[x * 2.05, 0.9, 0.12]} s={[0.13, 0.5, 0.13]} m={m.worker} r={[-0.4, 0, x < 0 ? -0.2 : 0.2]} low />
      </group>)}
      <Box p={[0, 0.96, 0.14]} s={[0.44, 0.06, 0.02]} m={m.worktop} />
      <Cyl p={[0, 1.56, 0]} s={[0.4, 0.12, 0.4]} m={m.safetyYellow} />
      <mesh geometry={g.sphere} material={m.workerHead} position={[0, 1.42, 0]} scale={0.32} castShadow />
    </group>
  );
}

function slots(capacity: number, span: number, maxSpacing: number): number[] {
  const n = Math.max(1, capacity);
  const spacing = Math.min(maxSpacing, span / n);
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * spacing);
}

function CncMachine({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { m } = useSceneResources();
  const reduced = useReducedMotion();
  const spindle = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spindle.current && active && !reduced) spindle.current.rotation.y += dt * 9;
  });
  return (
    <group position={position}>
      <Box p={[0, 0.25, 0]} s={[2.4, 0.5, 2]} m={m.darkSteel} />
      {/* Open machining chamber: rear enclosure, side panels and visible work bed. */}
      <Box p={[0, 1.35, -0.9]} s={[2.4, 1.7, 0.2]} m={m.machineBody} />
      {[-1.08, 1.08].map((x) => <Box key={x} p={[x, 1.35, -0.15]} s={[0.24, 1.7, 1.5]} m={m.machineBody} />)}
      <Box p={[0, 0.7, -0.1]} s={[1.8, 0.3, 1.2]} m={m.steel} />
      {[-0.6, -0.3, 0, 0.3, 0.6].map((x) => <Box key={x} p={[x, 0.86, -0.1]} s={[0.035, 0.025, 1.1]} m={m.darkSteel} />)}
      <Cyl p={[0.15, 1, -0.1]} s={[0.55, 0.2, 0.55]} m={m.pumpBody} />
      <Box p={[0, 2.12, -0.2]} s={[1.8, 0.04, 0.1]} m={active ? m.led : m.lampOff} />
      {[-0.56, 0.86].map((x) => <Box key={x} p={[x, 1.4, 0.66]} s={[0.06, 1.25, 0.08]} m={m.steel} />)}
      <Box p={[0.65, 1.35, 0.72]} s={[0.05, 0.45, 0.07]} m={m.darkSteel} />
      {[-0.75, 0.75].map((x) => <Box key={x} p={[x, 0.08, 0]} s={[0.35, 0.16, 1.6]} m={m.rubber} />)}
      {Array.from({ length: 6 }, (_, i) => <Box key={i} p={[-1.21, 1.1 + i * 0.11, -0.3]} s={[0.02, 0.035, 0.65]} m={m.darkSteel} />)}
      <Box p={[0.15, 1.4, 0.62]} s={[1.3, 1.1, 0.06]} m={m.glass} />
      <Box p={[-0.95, 1.4, 0.62]} s={[0.4, 1.3, 0.08]} m={m.machineAccent} />
      <Box p={[0, 2.3, -0.2]} s={[2.4, 0.2, 1.6]} m={m.machineAccent} />
      <group position={[1.45, 1.35, 0.5]} rotation={[0, -0.5, 0]}>
        <Box p={[0, 0, 0]} s={[0.65, 0.85, 0.15]} m={m.darkSteel} />
        <Box p={[0, 0.12, 0.085]} s={[0.5, 0.42, 0.02]} m={active ? emissiveMaterial("#5bb8d6", 0.8) : m.lampOff} />
      </group>
      <Cyl p={[1.58, 1.08, 0.63]} s={[0.1, 0.04, 0.1]} m={emissiveMaterial("#d2412f", 0.3)} r={[Math.PI / 2, 0, 0]} />
      <group ref={spindle} position={[0.15, 1.55, -0.1]}>
        <Cyl p={[0, 0, 0]} s={[0.22, 0.5, 0.22]} m={m.steel} />
        <Box p={[0.12, -0.2, 0]} s={[0.05, 0.15, 0.05]} m={m.steel} />
      </group>
      <StackLight position={[-1.05, 2.4, -0.8]} statusColor={statusColor} active={active} />
    </group>
  );
}

function AssemblyPost({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { m } = useSceneResources();
  return (
    <group position={position}>
      {[-0.9, 0.9].map((x) =>
        [-0.5, 0.5].map((z) => <Box key={`${x}${z}`} p={[x, 0.45, z]} s={[0.08, 0.9, 0.08]} m={m.bench} />),
      )}
      <Box p={[0, 0.92, 0]} s={[2, 0.08, 1.2]} m={m.worktop} />
      <Box p={[0, 0.3, 0]} s={[1.9, 0.04, 1.1]} m={m.bench} />
      <Box p={[0, 2.35, -0.55]} s={[1.8, 0.08, 0.12]} m={m.led} />
      {[-0.65, 0, 0.65].map((x) => <Box key={x} p={[x, 1.15, -0.45]} s={[0.42, 0.3, 0.28]} m={m.machineAccent} />)}
      {/* Портал с талью */}
      <Box p={[-1.15, 1.6, 0]} s={[0.1, 3.2, 0.1]} m={m.safetyYellow} />
      <Box p={[1.15, 1.6, 0]} s={[0.1, 3.2, 0.1]} m={m.safetyYellow} />
      <Box p={[0, 3.15, 0]} s={[2.4, 0.14, 0.14]} m={m.safetyYellow} />
      <Box p={[0.2, 2.95, 0]} s={[0.3, 0.25, 0.25]} m={m.darkSteel} />
      <Cyl p={[0.2, 2.35, 0]} s={[0.02, 1, 0.02]} m={m.steel} low />
      {active && <PumpModel position={[0, 0.96, 0]} scale={1.2} />}
      <Worker position={[0, 0, 1.05]} active={active} />
      <StackLight position={[1.05, 0.96, -0.5]} statusColor={statusColor} active={active} />
    </group>
  );
}

function TestBench({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { g, m } = useSceneResources();
  const reduced = useReducedMotion();
  const gauge = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (gauge.current) gauge.current.rotation.z = active && !reduced ? Math.sin(clock.elapsedTime * 3) * 0.6 : 0.9;
  });
  return (
    <group position={position}>
      <Box p={[0, 0.15, 0]} s={[3, 0.3, 2]} m={m.darkSteel} />
      {[0.5, 1.5].map((y) => <Cyl key={y} p={[-0.9, y, -0.4]} s={[1.14, 0.07, 1.14]} m={m.steel} />)}
      <Box p={[-0.9, 1.1, 0.16]} s={[0.09, 0.8, 0.04]} m={m.machineAccent} />
      <Cyl p={[-0.9, 2.12, -0.4]} s={[0.22, 0.16, 0.22]} m={m.steel} />
      <Cyl p={[-0.9, 1.1, -0.4]} s={[1.1, 1.6, 1.1]} m={m.tank} />
      <mesh geometry={g.sphere} material={m.tank} position={[-0.9, 1.9, -0.4]} scale={[1.1, 0.4, 1.1]} />
      <Cyl p={[0.1, 0.75, -0.4]} s={[0.16, 1.6, 0.16]} m={m.pipe} r={[0, 0, Math.PI / 2]} />
      <Cyl p={[0.85, 0.65, 0]} s={[0.16, 0.9, 0.16]} m={m.pipe} r={[Math.PI / 2, 0, 0]} />
      <Box p={[1.2, 1.35, -0.75]} s={[0.9, 1.7, 0.2]} m={m.machineBody} />
      <mesh geometry={g.cyl} material={m.worktop} position={[1.2, 1.6, -0.63]} scale={[0.5, 0.04, 0.5]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh ref={gauge} geometry={g.box} material={m.pipe} position={[1.2, 1.6, -0.6]} scale={[0.03, 0.2, 0.02]} />
      {active && <PumpModel position={[0.6, 0.3, 0.3]} scale={1.15} />}
      <StackLight position={[1.5, 2.2, -0.75]} statusColor={statusColor} active={active} />
    </group>
  );
}

function ReworkPost({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { m } = useSceneResources();
  return (
    <group position={position}>
      <Box p={[0, 0.45, 0]} s={[2, 0.9, 1]} m={m.bench} />
      <Box p={[0, 0.93, 0]} s={[2.1, 0.06, 1.1]} m={m.worktop} />
      <Box p={[0, 1.7, -0.5]} s={[2, 1.5, 0.08]} m={m.darkSteel} />
      {[-0.6, 0, 0.6].map((x) => (
        <Box key={x} p={[x, 1.7, -0.44]} s={[0.08, 0.4, 0.05]} m={m.steel} />
      ))}
      <Box p={[1.45, 0.7, 0]} s={[0.7, 1.4, 0.8]} m={m.rackBeam} />
      {active && <PumpModel position={[-0.2, 0.96, 0]} scale={1.1} />}
      <Worker position={[-0.2, 0, 0.9]} active={active} />
      <StackLight position={[-0.95, 0.96, -0.4]} statusColor={statusColor} active={active} />
    </group>
  );
}

function PackingLine({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { g, m } = useSceneResources();
  const reduced = useReducedMotion();
  const ring = useRef<THREE.Mesh>(null);
  const turntable = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (turntable.current && active && !reduced) turntable.current.rotation.y = clock.elapsedTime * 0.7;
    if (ring.current) ring.current.position.y = active && !reduced ? 0.9 + Math.sin(clock.elapsedTime * 1.5) * 0.5 : 0.5;
  });
  return (
    <group position={position}>
      <Cyl p={[0, 0.05, 0]} s={[2, 0.1, 2]} m={m.darkSteel} />
      <Box p={[1.2, 1.3, 0]} s={[0.2, 2.6, 0.2]} m={m.machineAccent} />
      <mesh ref={ring} geometry={g.torus} material={m.steel} scale={[2.3, 2.3, 1]} rotation={[Math.PI / 2, 0, 0]} />
      {active && (
        <group ref={turntable} position={[0, 0.1, 0]}>
          <Box p={[0, 0.07, 0]} s={[1.2, 0.14, 1]} m={m.pallet} />
          <Box p={[0, 0.6, 0]} s={[1.1, 0.9, 0.9]} m={m.cardboard} />
        </group>
      )}
      <StackLight position={[1.2, 2.6, 0]} statusColor={statusColor} active={active} />
    </group>
  );
}

function Rack({ position }: { position: Vec3 }) {
  const { m } = useSceneResources();
  const levels = [0.15, 1.35, 2.55, 3.75];
  return (
    <group position={position}>
      {[-1.6, 1.6].map((x) => [-0.5, 0.5].map((z) => <Box key={`${x}${z}`} p={[x, 2.1, z]} s={[0.1, 4.2, 0.1]} m={m.rackUpright} />))}
      {levels.map((y) => (
        <group key={y}>
          <Box p={[0, y, -0.5]} s={[3.3, 0.12, 0.08]} m={m.rackBeam} />
          <Box p={[0, y, 0.5]} s={[3.3, 0.12, 0.08]} m={m.rackBeam} />
          {y < 3.7 &&
            [-0.8, 0.8].map((x) => (
              <group key={x}>
                <Box p={[x, y + 0.14, 0]} s={[1.2, 0.14, 1]} m={m.pallet} />
                <Box p={[x, y + 0.6, 0]} s={[1, 0.8, 0.85]} m={m.cardboard} />
              </group>
            ))}
        </group>
      ))}
    </group>
  );
}

function PickingStation({ position, active, statusColor }: { position: Vec3; active: boolean; statusColor: string }) {
  const { m } = useSceneResources();
  return (
    <group position={position}>
      <Box p={[0, 0.5, 0]} s={[1.6, 1, 0.9]} m={m.bench} />
      <Box p={[0, 1.02, 0]} s={[1.7, 0.05, 1]} m={m.worktop} />
      <Box p={[0.3, 1.2, 0]} s={[0.5, 0.3, 0.4]} m={m.cardboard} />
      <Worker position={[0, 0, 0.85]} active={active} />
      <StackLight position={[-0.7, 1.05, -0.35]} statusColor={statusColor} active={active} />
    </group>
  );
}

/**
 * Маркер ремонта (режим воспроизведения): ограждение из стоек с сигнальной лентой и выноска «Ремонт».
 * Показывается над единицей оборудования, выведенной из работы из-за отказа.
 */
function RepairMarker({ position }: { position: Vec3 }) {
  const { m } = useSceneResources();
  const tape = emissiveMaterial(BROKEN_COLOR);
  const w = 1.7;
  const d = 1.45;
  const corners: Array<[number, number]> = [[-w, -d], [w, -d], [w, d], [-w, d]];
  return (
    <group position={position}>
      {corners.map(([x, z]) => (
        <Cyl key={`${x}${z}`} p={[x, 0.45, z]} s={[0.07, 0.9, 0.07]} m={m.darkSteel} low />
      ))}
      <Box p={[0, 0.78, -d]} s={[w * 2, 0.06, 0.03]} m={tape} />
      <Box p={[0, 0.78, d]} s={[w * 2, 0.06, 0.03]} m={tape} />
      <Box p={[-w, 0.78, 0]} s={[0.03, 0.06, d * 2]} m={tape} />
      <Box p={[w, 0.78, 0]} s={[0.03, 0.06, d * 2]} m={tape} />
      <Html position={[0, 3.1, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <span className="whitespace-nowrap rounded-full bg-[#c0392b] px-2 py-0.5 text-[11px] font-semibold text-white shadow">Ремонт</span>
      </Html>
    </group>
  );
}

/** Цвет сигнальной колонны единицы оборудования в ремонте. */
export const BROKEN_COLOR = "#e0362c";

export function EquipmentModel({ kind, capacity, busy, down = 0, statusColor, footprint }: EquipmentModelProps) {
  const { m } = useSceneResources();
  const span = footprint[0] - 1.5;
  switch (kind) {
    case "warehouse":
      return (
        <group>
          {[-3.6, 0, 3.6].map((x) => (
            <Rack key={x} position={[x, 0, -3.2]} />
          ))}
          {slots(capacity, span, 2.4).map((x, i) => (
            <group key={i}>
              <PickingStation position={[x, 0, 1.4]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, 1.4]} />}
            </group>
          ))}
        </group>
      );
    case "machining":
      return (
        <group>
          {slots(capacity, span, 3.6).map((x, i) => (
            <group key={i}>
              <CncMachine position={[x, 0, -1]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, -1]} />}
            </group>
          ))}
        </group>
      );
    case "assembly":
      return (
        <group>
          {slots(capacity, span, 3.4).map((x, i) => (
            <group key={i}>
              <AssemblyPost position={[x, 0, -0.8]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, -0.8]} />}
            </group>
          ))}
        </group>
      );
    case "testing":
      return (
        <group>
          {slots(capacity, span, 3.8).map((x, i) => (
            <group key={i}>
              <TestBench position={[x, 0, -1]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, -1]} />}
            </group>
          ))}
        </group>
      );
    case "rework":
      return (
        <group>
          {slots(capacity, span, 3.4).map((x, i) => (
            <group key={i}>
              <ReworkPost position={[x, 0, 0]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, 0]} />}
            </group>
          ))}
        </group>
      );
    case "shipping":
      return (
        <group>
          {slots(capacity, span, 3.4).map((x, i) => (
            <group key={i}>
              <PackingLine position={[x, 0, -1.5]} active={i < busy} statusColor={i >= capacity - down ? BROKEN_COLOR : statusColor} />
              {i >= capacity - down && <RepairMarker position={[x, 0, -1.5]} />}
            </group>
          ))}
          {[-2.5, -1.2, 0.1].map((x) => (
            <group key={x} position={[x + 1.2, 0, 2.6]}>
              <Box p={[0, 0.07, 0]} s={[1.2, 0.14, 1]} m={m.pallet} />
              <Box p={[0, 0.6, 0]} s={[1.1, 0.9, 0.9]} m={m.cardboard} />
            </group>
          ))}
        </group>
      );
  }
}
