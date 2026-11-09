"use client";

import { useSceneResources } from "./resources";

/** Parked logistics vehicle: scenery only, independent of simulation resource counts. */
export function FactoryLogistics() {
  const { g, m } = useSceneResources();
  return (
    <group position={[-23, 0, 10]} rotation={[0, -0.5, 0]} dispose={null}>
      <mesh geometry={g.box} material={m.safetyYellow} position={[0, 0.65, 0]} scale={[1.6, 0.8, 2.5]} castShadow />
      <mesh geometry={g.box} material={m.darkSteel} position={[0, 0.25, 0]} scale={[1.5, 0.22, 2.4]} castShadow />
      {[-0.8, 0.8].map((x) => [-0.75, 0.8].map((z) => <group key={`${x}${z}`} position={[x, 0.4, z]} rotation={[0, 0, Math.PI / 2]}>
        <mesh geometry={g.cyl} material={m.rubber} scale={[0.8, 0.32, 0.8]} castShadow />
        <mesh geometry={g.cyl} material={m.steel} scale={[0.4, 0.34, 0.4]} />
      </group>))}
      <mesh geometry={g.box} material={m.rubber} position={[0, 1.2, -0.3]} scale={[0.7, 0.22, 0.7]} />
      <mesh geometry={g.box} material={m.rubber} position={[0, 1.55, -0.6]} scale={[0.7, 0.7, 0.15]} />
      {[-0.65, 0.65].map((x) => [-0.85, 0.7].map((z) => <mesh key={`${x}${z}`} geometry={g.box} material={m.darkSteel} position={[x, 1.85, z]} scale={[0.08, 1.8, 0.08]} castShadow />))}
      <mesh geometry={g.box} material={m.safetyYellow} position={[0, 2.8, -0.05]} scale={[1.6, 0.12, 2]} castShadow />
      <mesh geometry={g.box} material={m.glass} position={[0, 1.95, 0.72]} scale={[1.2, 1.5, 0.03]} />
      {[-0.5, 0.5].map((x) => <group key={x}>
        <mesh geometry={g.box} material={m.darkSteel} position={[x, 1.55, 1.4]} scale={[0.15, 3.1, 0.16]} castShadow />
        <mesh geometry={g.box} material={m.steel} position={[x, 0.2, 2.1]} scale={[0.18, 0.1, 1.5]} castShadow />
        <mesh geometry={g.box} material={m.led} position={[x, 0.95, 1.26]} scale={[0.2, 0.18, 0.04]} />
      </group>)}
      <mesh geometry={g.box} material={m.darkSteel} position={[0, 1, 1.45]} scale={[1.25, 0.16, 0.2]} />
    </group>
  );
}
