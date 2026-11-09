"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { fitHallCamera } from "./cameraFraming";
import { CAMERA_PRESETS } from "./sceneContract";
import { useScene } from "./sceneStore";

/**
 * Камера: свободное вращение/масштабирование (OrbitControls) + плавные перелёты к предустановленным ракурсам.
 * Перелёт прерывается, если пользователь начинает управлять камерой сам.
 */
export function FactoryCameraController() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const request = useScene((s) => s.cameraRequest);
  const presetId = useScene((s) => s.cameraPresetId);
  const flight = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const p = CAMERA_PRESETS[presetId] ?? CAMERA_PRESETS["cam-overview"]!;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = new THREE.Vector3(...p.target);
    // На узких (портретных) экранах отодвигаем камеру, чтобы ракурс помещался по ширине.
    const aspect = size.width / Math.max(1, size.height);
    const k = aspect < 1.3 ? Math.min(2.2, 1.3 / aspect) : 1;
    const pos = (presetId === "cam-overview" || presetId === "cam-top") && camera instanceof THREE.PerspectiveCamera
      ? fitHallCamera(p, aspect, camera.fov)
      : new THREE.Vector3(...p.position).sub(target).multiplyScalar(k).add(target);
    if (reduced || request === 0) {
      camera.position.copy(pos);
      controls.current?.target.copy(target);
      controls.current?.update();
      flight.current = null;
    } else {
      flight.current = { pos, target };
    }
  }, [request, presetId, camera, size.width, size.height]);

  useFrame((_, dt) => {
    const f = flight.current;
    const c = controls.current;
    if (!f || !c) return;
    const k = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(f.pos, k);
    c.target.lerp(f.target, k);
    c.update();
    if (camera.position.distanceTo(f.pos) < 0.05 && c.target.distanceTo(f.target) < 0.05) flight.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={300}
      maxPolarAngle={Math.PI / 2.15}
      onStart={() => {
        flight.current = null;
      }}
    />
  );
}
