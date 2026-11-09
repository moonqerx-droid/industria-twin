import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunPicker } from "@/components/layout/RunPicker";
import { ProcessMnemonic } from "@/components/process/ProcessMnemonic";
import { StationPanel } from "@/components/process/StationPanel";
import { StationTable } from "@/components/process/StationTable";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/Status";
import { SyntheticNote } from "@/components/ui/SyntheticNote";
import { fmtDateTime } from "@/lib/format";
import { buildStationViews } from "@/lib/views";
import { getProductionModel } from "@/server/services/modelService";
import { getRunDetail, listRuns, resolveRunId } from "@/server/services/simulationService";

export const metadata: Metadata = { title: "Процесс" };

export default async function ProcessPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runParam } = await searchParams;
  const runId = await resolveRunId(runParam ?? null).catch(() => null);
  const [model, run, runs] = await Promise.all([getProductionModel(), runId ? getRunDetail(runId) : null, listRuns({ limit: 40 })]);
  const stations = buildStationViews(model, run);
  return (
    <>
      <PageHeader
        title="Мнемосхема процесса"
        description={
          <>
            {model.process.name}. Показатели узлов — из прогона «{run?.scenarioName ?? "нет расчёта"}»
            {run ? ` от ${fmtDateTime(run.createdAt)}` : ""}.
          </>
        }
        actions={run ? <RunPicker runs={runs} currentId={run.id} /> : null}
      />
      <div className="grid gap-5 2xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title="Поток изделия"
            subtitle="Нажмите на участок: подсветка синхронизирована с 3D-сценой и таблицами"
            actions={
              <div className="flex flex-wrap gap-3 text-xs">
                <StatusBadge status="normal" />
                <StatusBadge status="high" />
                <StatusBadge status="critical" />
              </div>
            }
          >
            <ProcessMnemonic nodes={model.nodes} edges={model.edges} stations={stations} />
            <p className="mt-3 text-xs text-faint">
              Оранжевые метки слева от участка — средняя очередь (одна метка ≈ одно изделие). Пунктир — возврат на доработку и
              списание после превышения лимита доработок. Цветная полоса узла — состояние: до 75% — норма, 75–90% — высокая загрузка,
              от 90% или накопление очереди — перегрузка.
            </p>
          </Panel>
          <Panel title="Участки и ресурсы">
            <StationTable stations={stations} />
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Узел процесса">
            <StationPanel stations={stations} runId={run?.id ?? null} context="process" />
          </Panel>
          <SyntheticNote />
        </div>
      </div>
    </>
  );
}
