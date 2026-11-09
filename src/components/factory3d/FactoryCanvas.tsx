"use client";

import { Environment, Grid, Lightformer } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { STATION_IDS, type StationId } from "@/domain/model/demoData";
import { useSelection } from "@/store/selection";
import { ConveyorSystem } from "./ConveyorSystem";
import { FactoryCameraController } from "./FactoryCameraController";
import { FactoryLogistics } from "./FactoryLogistics";
import { FactoryEnvironment } from "./FactoryEnvironment";
import { ProductionItems } from "./ProductionItems";
import { ReplayFlow } from "./ReplayFlow";
import type { ReplayDto } from "@/server/services/simulationService";
import { SceneResourcesProvider } from "./resources";
import { CAMERA_PRESETS } from "./sceneContract";
import { SceneQualityController } from "./SceneQualityController";
import { StationAnchor, type StationSceneData } from "./StationAnchor";

/** Раскладка участков (FactoryLayout): по одному StationAnchor на каждый stationId. */
function FactoryLayout({ stations }: { stations: StationSceneData[] }) {
  const queues = Object.fromEntries(STATION_IDS.map((id) => [id, stations.find((s) => s.stationId === id)?.queue ?? 0])) as Record<StationId, number>;
  return (
    <>
      {stations.map((s) => (
        <StationAnchor key={s.stationId} data={s} />
      ))}
      <ProductionItems queues={queues} />
    </>
  );
}

/** Корневой компонент 3D-сцены. Загружается лениво (next/dynamic, ssr: false). */
export default function FactoryCanvas({
  stations,
  onError,
  replay = null,
}: {
  stations: StationSceneData[];
  onError?: () => void;
  /** Журнал событий для анимации движения изделий (только в режиме воспроизведения). */
  replay?: Pick<ReplayDto, "events" | "eventTypes" | "stationIds"> | null;
}) {
  const overview = CAMERA_PRESETS["cam-overview"]!;
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: overview.position, fov: 42, near: 0.5, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onError?.();
        });
      }}
      onPointerMissed={() => useSelection.getState().hoverStation(null)}
      aria-label="Интерактивная 3D-сцена цеха"
    >
      {/* Фон — CSS-градиент вьюпорта (прозрачный canvas); туман того же тона растворяет дальнюю сетку. */}
      <fog attach="fog" args={["#e1e7ed", 120, 260]} />
      <Grid
        position={[0, -0.81, 0]}
        args={[400, 400]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#c3ccd6"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#a9b5c2"
        fadeDistance={170}
        fadeStrength={1.6}
        infiniteGrid
      />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.1} color="#ffffff" position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[50, 25, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#dcecff" position={[-30, 6, 0]} rotation={[0, Math.PI / 2, 0]} scale={[25, 12, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#ffe6bd" position={[30, 8, -10]} rotation={[0, -Math.PI / 2, 0]} scale={[25, 8, 1]} />
      </Environment>
      <SceneResourcesProvider>
        <SceneQualityController />
        <FactoryEnvironment />
        <ConveyorSystem />
        <FactoryLogistics />
        <FactoryLayout stations={stations} />
        {replay && <ReplayFlow replay={replay} />}
      </SceneResourcesProvider>
      <FactoryCameraController />
    </Canvas>
  );
}
