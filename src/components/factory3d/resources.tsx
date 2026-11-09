"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Общие геометрии и материалы сцены: создаются один раз на Canvas и переиспользуются
 * всеми объектами (снижает число аллокаций и draw-state переключений). Освобождаются при размонтировании.
 */
function create() {
  const g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    sphere: new THREE.SphereGeometry(0.5, 16, 12),
    torus: new THREE.TorusGeometry(0.42, 0.12, 10, 24),
    plane: new THREE.PlaneGeometry(1, 1),
    ring: new THREE.RingGeometry(0.97, 1, 64),
    capsule: new THREE.CapsuleGeometry(0.22, 0.9, 4, 8),
  };
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15, ...extra });
  const m = {
    led: std("#d9f0ff", { emissive: "#bfe4ff", emissiveIntensity: 1.6 }),
    rubber: std("#1e2731", { roughness: 0.95, metalness: 0 }),
    floor: std("#c3cbd3", { roughness: 0.78, metalness: 0.02 }),
    zone: std("#b4bfca", { roughness: 0.85, metalness: 0 }),
    aisle: std("#d3d9df", { roughness: 0.8, metalness: 0 }),
    slab: std("#9aa6b2", { roughness: 0.9 }),
    wall: std("#eef1f4", { roughness: 0.9 }),
    wallPanel: std("#dde3e9", { roughness: 0.85 }),
    steel: std("#a8b2bd", { metalness: 0.7, roughness: 0.32 }),
    darkSteel: std("#46515e", { metalness: 0.45, roughness: 0.5 }),
    machineBody: std("#f3f5f7", { roughness: 0.38, metalness: 0.08 }),
    machineAccent: std("#2d3743", { roughness: 0.42, metalness: 0.3 }),
    brandBlue: std("#1f66c9", { roughness: 0.4, metalness: 0.2 }),
    glass: std("#9cc7e0", { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 }),
    rackUpright: std("#1f66c9", { metalness: 0.25, roughness: 0.5 }),
    rackBeam: std("#e8862e", { metalness: 0.25, roughness: 0.55 }),
    pallet: std("#b58a5a", { roughness: 0.9, metalness: 0 }),
    cardboard: std("#c9a476", { roughness: 0.95, metalness: 0 }),
    pumpBody: std("#2a5f9e", { metalness: 0.4, roughness: 0.38 }),
    pumpMotor: std("#3a4654", { metalness: 0.45, roughness: 0.45 }),
    safetyYellow: std("#f1b72f", { roughness: 0.6 }),
    bench: std("#6b7a8b", { roughness: 0.6, metalness: 0.2 }),
    worktop: std("#c4ccd4", { roughness: 0.5 }),
    tank: std("#d6dde4", { metalness: 0.65, roughness: 0.25 }),
    pipe: std("#d0752e", { metalness: 0.35, roughness: 0.45 }),
    worker: std("#f08a24", { roughness: 0.8 }),
    workerHead: std("#d9b59a", { roughness: 0.9 }),
    lampOff: std("#4a5563", { roughness: 0.4 }),
    conveyorBelt: std("#2a323c", { roughness: 0.9 }),
    zoneLine: new THREE.MeshBasicMaterial({ color: "#f1b72f" }),
    aisleLine: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    joint: new THREE.MeshBasicMaterial({ color: "#b0bac5" }),
  };
  return { g, m };
}

export type SceneResources = ReturnType<typeof create>;
const Ctx = createContext<SceneResources | null>(null);

export function SceneResourcesProvider({ children }: { children: ReactNode }) {
  const res = useMemo(create, []);
  useEffect(
    () => () => {
      Object.values(res.g).forEach((x) => x.dispose());
      Object.values(res.m).forEach((x) => x.dispose());
    },
    [res],
  );
  return <Ctx.Provider value={res}>{children}</Ctx.Provider>;
}

export function useSceneResources(): SceneResources {
  const r = useContext(Ctx);
  if (!r) throw new Error("useSceneResources вне SceneResourcesProvider");
  return r;
}

/** Кэш материалов-ламп по цвету (излучающие материалы для андон-индикации). */
const emissiveCache = new Map<string, THREE.MeshStandardMaterial>();
export function emissiveMaterial(color: string, intensity = 1.6): THREE.MeshStandardMaterial {
  const key = `${color}-${intensity}`;
  let mat = emissiveCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
    emissiveCache.set(key, mat);
  }
  return mat;
}
