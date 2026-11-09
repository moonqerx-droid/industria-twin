"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useScene } from "./sceneStore";

/**
 * Адаптивное качество: в режиме «авто» PerformanceMonitor снижает качество (DPR 1, без теней),
 * если частота кадров устойчиво падает. Вручную можно выбрать «низкое» или «высокое».
 * Конкретные значения FPS не заявляются — решение принимается по измерениям в браузере пользователя.
 */
export function SceneQualityController() {
  const quality = useScene((s) => s.quality);
  const effective = useScene((s) => s.effectiveQuality);
  const setEffective = useScene((s) => s.setEffectiveQuality);
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (quality !== "auto") setEffective(quality);
  }, [quality, setEffective]);

  useEffect(() => {
    const max = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    setDpr(effective === "high" ? Math.min(1.75, max) : 1);
    gl.shadowMap.enabled = effective === "high";
  }, [effective, setDpr, gl]);

  if (quality !== "auto") return null;
  return <PerformanceMonitor onDecline={() => setEffective("low")} onIncline={() => setEffective("high")} flipflops={3} onFallback={() => setEffective("low")} />;
}
