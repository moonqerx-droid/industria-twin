import type { Metadata } from "next";
import { CompareView } from "@/components/compare/CompareView";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { SyntheticNote } from "@/components/ui/SyntheticNote";
import { isStationId } from "@/domain/model/demoData";
import { compareRuns } from "@/server/services/comparisonService";
import { latestRunPerScenario, listRuns } from "@/server/services/simulationService";
import { ApiError } from "@/server/http";

export const metadata: Metadata = { title: "Сравнение сценариев" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string; runs?: string; station?: string }>;
}) {
  const sp = await searchParams;
  const [runs, latest] = await Promise.all([listRuns({ limit: 100 }), latestRunPerScenario()]);
  if (runs.length < 2) {
    return (
      <>
        <PageHeader title="Сравнение сценариев" />
        <EmptyState title="Для сравнения нужно минимум два прогона" action={<LinkButton href="/scenarios" variant="primary">Перейти в студию сценариев</LinkButton>}>
          Запустите моделирование базового и альтернативного сценариев.
        </EmptyState>
      </>
    );
  }
  const baselineRun = latest.find((r) => r.isBaselineScenario) ?? latest[0]!;
  const baselineId = sp.baseline ?? baselineRun.id;
  const altIds = (sp.runs ? sp.runs.split(",") : latest.filter((r) => r.id !== baselineId).slice(0, 3).map((r) => r.id))
    .filter((id) => id && id !== baselineId)
    .slice(0, 3);
  let data = null;
  let error: string | null = null;
  try {
    data = altIds.length ? await compareRuns(baselineId, altIds) : null;
  } catch (e) {
    if (e instanceof ApiError) error = e.message;
    else throw e;
  }
  return (
    <>
      <PageHeader
        title="Сравнение сценариев"
        description="Значения до и после, абсолютные и относительные изменения, статистическая различимость и смещение узкого места. Все данные — из сохранённых прогонов."
      />
      {error && <p role="alert" className="mb-4 rounded-[var(--radius-control)] border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
      <CompareView data={data} runs={runs} focusStationId={sp.station && isStationId(sp.station) ? sp.station : null} />
      <div className="mt-6">
        <SyntheticNote />
      </div>
    </>
  );
}
