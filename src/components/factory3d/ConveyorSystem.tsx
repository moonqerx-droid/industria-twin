"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneResources } from "./resources";
import { CONVEYORS } from "./sceneContract";

/** Роликовые конвейеры: ролики и стойки рисуются через instancing (один draw call на тип). */
export function ConveyorSystem() {
  const { g, m } = useSceneResources();
  const rollers = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);

  const layout = useMemo(() => {
    const roll: THREE.Matrix4[] = [];
    const leg: THREE.Matrix4[] = [];
    const frames: Array<{ pos: THREE.Vector3; len: number; angle: number }> = [];
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const c of CONVEYORS) {
      const a = new THREE.Vector3(...c.from);
      const b = new THREE.Vector3(...c.to);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const angle = Math.atan2(-dir.z, dir.x);
      frames.push({ pos: a.clone().add(b).multiplyScalar(0.5), len, angle });
      const n = Math.floor(len / 0.45);
      for (let i = 0; i <= n; i += 1) {
        const p = a.clone().add(dir.clone().multiplyScalar(i / n));
        p.y = 0.78;
        // Ролик перпендикулярен направлению движения.
        q.setFromEuler(new THREE.Euler(Math.PI / 2, angle, 0, "YXZ"));
        s.set(0.12, 0.9, 0.12);
        roll.push(new THREE.Matrix4().compose(p, q, s));
      }
      const legsN = Math.max(2, Math.floor(len / 2.5));
      for (let i = 0; i <= legsN; i += 1) {
        const p = a.clone().add(dir.clone().multiplyScalar(i / legsN));
        for (const side of [-0.45, 0.45]) {
          const off = new THREE.Vector3(Math.sin(angle) * side, 0.36, Math.cos(angle) * side);
          leg.push(new THREE.Matrix4().compose(p.clone().add(off), new THREE.Quaternion(), new THREE.Vector3(0.08, 0.72, 0.08)));
        }
      }
    }
    return { roll, leg, frames };
  }, []);

  useLayoutEffect(() => {
    layout.roll.forEach((mx, i) => rollers.current?.setMatrixAt(i, mx));
    layout.leg.forEach((mx, i) => legs.current?.setMatrixAt(i, mx));
    if (rollers.current) rollers.current.instanceMatrix.needsUpdate = true;
    if (legs.current) legs.current.instanceMatrix.needsUpdate = true;
  }, [layout]);

  return (
    <group dispose={null}>
      <instancedMesh ref={rollers} args={[g.cylLow, m.steel, layout.roll.length]} castShadow />
      <instancedMesh ref={legs} args={[g.box, m.darkSteel, layout.leg.length]} />
      {layout.frames.map((f, i) => (
        <group key={i} position={[f.pos.x, 0, f.pos.z]} rotation={[0, f.angle, 0]}>
          <mesh geometry={g.box} material={m.machineAccent} position={[0, 0.76, 0.5]} scale={[f.len, 0.14, 0.06]} />
          <mesh geometry={g.box} material={m.machineAccent} position={[0, 0.76, -0.5]} scale={[f.len, 0.14, 0.06]} />
        </group>
      ))}
    </group>
  );
}
