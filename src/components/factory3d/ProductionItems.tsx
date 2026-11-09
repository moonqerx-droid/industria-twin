"use client";

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { STATION_IDS, type StationId } from "@/domain/model/demoData";
import { useSceneResources } from "./resources";
import { MAX_QUEUE_ITEMS_PER_STATION, QUEUE_ITEM_SPACING, STATION_LAYOUT } from "./sceneContract";

const CAPACITY = STATION_IDS.length * MAX_QUEUE_ITEMS_PER_STATION;
const tmp = new THREE.Object3D();

/**
 * Изделия в очередях перед участками (ProductionItem): паллета + корпус насоса + двигатель.
 * Три InstancedMesh на всю сцену; матрицы пересчитываются только при изменении длин очередей,
 * без React-компонента на каждое изделие.
 */
export function ProductionItems({ queues }: { queues: Record<StationId, number> }) {
  const { g, m } = useSceneResources();
  const pallets = useRef<THREE.InstancedMesh>(null);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const motors = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    let i = 0;
    for (const id of STATION_IDS) {
      const l = STATION_LAYOUT[id];
      const n = Math.min(MAX_QUEUE_ITEMS_PER_STATION, Math.max(0, Math.round(queues[id] ?? 0)));
      for (let k = 0; k < n; k += 1) {
        const row = Math.floor(k / 7);
        const col = k % 7;
        const x = l.position[0] + l.queueOffset[0] + l.queueDirection[0] * col * QUEUE_ITEM_SPACING;
        const z = l.position[2] + l.queueOffset[2] + l.queueDirection[2] * col * QUEUE_ITEM_SPACING + row * 1.1;
        tmp.position.set(x, 0.07, z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(0.9, 0.14, 0.9);
        tmp.updateMatrix();
        pallets.current?.setMatrixAt(i, tmp.matrix);
        tmp.position.set(x + 0.12, 0.42, z);
        tmp.rotation.set(Math.PI / 2, 0, 0);
        tmp.scale.set(0.5, 0.22, 0.5);
        tmp.updateMatrix();
        bodies.current?.setMatrixAt(i, tmp.matrix);
        tmp.position.set(x - 0.2, 0.38, z);
        tmp.rotation.set(0, 0, Math.PI / 2);
        tmp.scale.set(0.32, 0.42, 0.32);
        tmp.updateMatrix();
        motors.current?.setMatrixAt(i, tmp.matrix);
        i += 1;
      }
    }
    for (const ref of [pallets, bodies, motors]) {
      if (!ref.current) continue;
      ref.current.count = i;
      ref.current.instanceMatrix.needsUpdate = true;
    }
  }, [queues]);

  return (
    <group dispose={null}>
      <instancedMesh ref={pallets} args={[g.box, m.pallet, CAPACITY]} castShadow />
      <instancedMesh ref={bodies} args={[g.cyl, m.pumpBody, CAPACITY]} castShadow />
      <instancedMesh ref={motors} args={[g.cyl, m.pumpMotor, CAPACITY]} castShadow />
    </group>
  );
}
