import type { Metadata } from "next";
import { FactoryTour } from "@/components/factory3d/FactoryTour";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunPicker } from "@/components/layout/RunPicker";
import { SyntheticNote } from "@/components/ui/SyntheticNote";
import { buildStationViews } from "@/lib/views";
import { getProductionModel } from "@/server/services/modelService";
import { listRuns } from "@/server/services/simulationService";
import { getTourState } from "@/server/services/tourService";

export const metadata: Metadata = { title: "3D-тур по цеху" };

export default async function FactoryPage({ searchParams }: { searchParams: Promise<{ run?: string; tour?: string }> }) {
  const { run: runParam, tour: tourParam } = await searchParams;
  const [model, state, runs] = await Promise.all([
    getProductionModel(),
    getTourState(runParam ?? null).catch(() => getTourState(null)),
    listRuns({ limit: 40 }),
  ]);
  const stations = buildStationViews(model, state.run);
  return (
    <>
      <PageHeader
        title="3D-тур по цеху"
        description="Экскурсия по участкам и воспроизведение рассчитанного прогона. Каждый объект сцены связан с тем же участком, что мнемосхема и аналитика."
        actions={state.run ? <RunPicker runs={runs} currentId={state.run.id} /> : null}
      />
      <FactoryTour key={state.run?.id ?? "none"} stations={stations} pois={state.pois} tours={state.tours} run={state.run} cases={state.cases} initialTourId={tourParam ?? null} />
      <div className="mt-6">
        <SyntheticNote />
      </div>
    </>
  );
}
