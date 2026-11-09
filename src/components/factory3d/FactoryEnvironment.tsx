"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { STATIONS } from "@/domain/model/demoData";
import { useSceneResources } from "./resources";
import { HALL, STATION_LAYOUT } from "./sceneContract";
import { useScene } from "./sceneStore";

/** Текстура напольной маркировки зоны: код участка и название (рисуется на canvas, без внешних файлов). */
function useZoneLabelTexture(code: string, name: string) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#1f66c9";
    ctx.font = "600 150px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillText(code, 16, 186);
    ctx.fillStyle = "#4a5868";
    ctx.font = "500 92px 'IBM Plex Sans', system-ui, sans-serif";
    ctx.fillText(name, 260, 178);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [code, name]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

function ZoneMarking({ code, name, position, footprint }: { code: string; name: string; position: [number, number, number]; footprint: [number, number] }) {
  const { g, m } = useSceneResources();
  const tex = useZoneLabelTexture(code, name);
  const [w, d] = footprint;
  const t = 0.1;
  return (
    <group position={[position[0], 0.012, position[2]]}>
      <mesh geometry={g.plane} material={m.zone} rotation={FLAT} scale={[w, d, 1]} receiveShadow />
      {/* Границы зоны — жёлтая напольная разметка, уголки утолщены */}
      {[
        [0, -d / 2, w, t],
        [0, d / 2, w, t],
        [-w / 2, 0, t, d],
        [w / 2, 0, t, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={g.plane} material={m.zoneLine} rotation={FLAT} position={[x!, 0.004, z!]} scale={[sx!, sz!, 1]} />
      ))}
      {tex && (
        <mesh rotation={FLAT} position={[-w / 2 + 2.6, 0.008, d / 2 - 0.85]} scale={[4.6, 1.15, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Окружение цеха в «разрезе»: пол на бетонной плите, задняя стена с остеклением,
 * низкие торцевые стены, колонны только у задней стены — обзор с изометрической камеры не перекрыт.
 */
export function FactoryEnvironment() {
  const { g, m } = useSceneResources();
  const quality = useScene((s) => s.effectiveQuality);
  const halfW = HALL.width / 2;
  const halfD = HALL.depth / 2;
  const bays = useMemo(() => Array.from({ length: 7 }, (_, i) => -30 + i * 10), []);
  return (
    <group dispose={null}>
      <hemisphereLight args={["#ffffff", "#8c97a4", 0.75]} />
      <directionalLight
        position={[24, 42, 26]}
        intensity={2.4}
        color="#fff8ee"
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-28, 20, -14]} intensity={0.7} color="#cfe2ff" />
      <directionalLight position={[-10, 12, 30]} intensity={0.55} color="#ffffff" />

      {/* Бетонная плита с фаской-торцом */}
      <mesh geometry={g.box} material={m.slab} position={[0, -0.4, 0]} scale={[HALL.width + 1.2, 0.8, HALL.depth + 1.2]} receiveShadow />
      <mesh geometry={g.plane} material={m.floor} rotation={FLAT} scale={[HALL.width + 1.2, HALL.depth + 1.2, 1]} receiveShadow />
      {/* Деформационные швы пола */}
      {Array.from({ length: 13 }, (_, i) => (
        <mesh key={`jx-${i}`} geometry={g.plane} material={m.joint} rotation={FLAT} position={[-30 + i * 5, 0.003, 0]} scale={[0.03, HALL.depth, 1]} />
      ))}
      {[-12, -6, 0, 6, 12].map((z) => (
        <mesh key={`jz-${z}`} geometry={g.plane} material={m.joint} rotation={FLAT} position={[0, 0.003, z]} scale={[HALL.width, 0.03, 1]} />
      ))}

      {/* Проезд вдоль конвейера с белой разметкой и пешеходными переходами */}
      <mesh geometry={g.plane} material={m.aisle} rotation={FLAT} position={[1.5, 0.006, 4.6]} scale={[HALL.width - 4, 2.4, 1]} receiveShadow />
      {[3.4, 5.8].map((z) => (
        <mesh key={z} geometry={g.plane} material={m.zoneLine} rotation={FLAT} position={[1.5, 0.01, z]} scale={[HALL.width - 4, 0.09, 1]} />
      ))}
      {[-25, -10, 5, 20].map((x) => (
        <group key={`crossing-${x}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} geometry={g.plane} material={m.aisleLine} rotation={FLAT} position={[x + i * 0.36, 0.014, 4.6]} scale={[0.2, 2, 1]} />
          ))}
        </group>
      ))}

      {STATIONS.map((s) => {
        const l = STATION_LAYOUT[s.id];
        return <ZoneMarking key={s.id} code={s.code} name={s.shortName} position={l.position} footprint={l.footprint} />;
      })}

      {/* Задняя стена: сэндвич-панели, ленточное остекление, колонны и подкрановый путь */}
      <mesh geometry={g.box} material={m.wall} position={[0, HALL.wallHeight / 2, -halfD]} scale={[HALL.width, HALL.wallHeight, 0.3]} receiveShadow />
      <mesh geometry={g.box} material={m.wallPanel} position={[0, 0.6, -halfD + 0.17]} scale={[HALL.width, 1.2, 0.05]} />
      <mesh geometry={g.box} material={m.glass} position={[0, 4.7, -halfD + 0.17]} scale={[HALL.width - 2, 2.1, 0.04]} />
      {bays.map((x) => (
        <group key={`bay-${x}`} position={[x, 0, -halfD + 0.55]}>
          <mesh geometry={g.box} material={m.machineAccent} position={[0, HALL.wallHeight / 2, 0]} scale={[0.45, HALL.wallHeight, 0.45]} castShadow />
          <mesh geometry={g.box} material={m.safetyYellow} position={[0, 0.5, 0]} scale={[0.58, 1, 0.58]} />
        </group>
      ))}
      <mesh geometry={g.box} material={m.rackBeam} position={[0, HALL.wallHeight - 0.45, -halfD + 1.1]} scale={[HALL.width - 1, 0.3, 0.3]} />
      <mesh geometry={g.box} material={m.led} position={[0, HALL.wallHeight - 0.05, -halfD + 0.4]} scale={[HALL.width - 2, 0.08, 0.3]} />

      {/* Торцевые стены — низкий парапет и ворота приёмки/отгрузки */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={g.box} material={m.wall} position={[side * halfW, 1.1, (-halfD + 1.6) / 2]} scale={[0.3, 2.2, halfD + 1.6]} receiveShadow />
          <mesh geometry={g.box} material={m.wall} position={[side * halfW, 1.1, (halfD + 6.4) / 2]} scale={[0.3, 2.2, halfD - 6.4]} />
          <mesh geometry={g.box} material={m.safetyYellow} position={[side * (halfW - 0.05), 1.3, 1.8]} scale={[0.32, 2.6, 0.18]} />
          <mesh geometry={g.box} material={m.safetyYellow} position={[side * (halfW - 0.05), 1.3, 6.2]} scale={[0.32, 2.6, 0.18]} />
          <mesh geometry={g.box} material={m.safetyYellow} position={[side * (halfW - 0.05), 2.6, 4]} scale={[0.32, 0.18, 4.6]} />
        </group>
      ))}
      {/* Передний край — только бортик, чтобы цех читался как разрез */}
      <mesh geometry={g.box} material={m.wallPanel} position={[0, 0.15, halfD]} scale={[HALL.width, 0.3, 0.2]} />
    </group>
  );
}
