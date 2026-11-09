import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScenarioStudio } from "@/components/scenarios/ScenarioStudio";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyntheticNote } from "@/components/ui/SyntheticNote";
import { can } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { listScenarios } from "@/server/services/scenarioService";
import { getRunDetail, resolveRunId } from "@/server/services/simulationService";

export const metadata: Metadata = { title: "Студия сценариев" };

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [user, scenarios] = await Promise.all([getCurrentUser(), listScenarios()]);
  if (scenarios.length === 0) {
    return <EmptyState title="Сценариев нет">Заполните базу демонстрационными данными: npm run db:seed</EmptyState>;
  }
  const selected = scenarios.find((s) => s.id === id) ?? scenarios[0]!;
  const [baselineRunId, lastRun] = await Promise.all([
    resolveRunId(null),
    selected.latestRun ? getRunDetail(selected.latestRun.id) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="Студия сценариев"
        description="Создавайте альтернативы, меняйте нагрузку, ресурсы и качество, запускайте моделирование и сравнивайте с базовым вариантом."
      />
      <ScenarioStudio
        key={selected.id}
        scenarios={scenarios}
        selectedId={selected.id}
        canEdit={!!user && can(user.role, "scenario:write")}
        baselineRunId={baselineRunId}
        lastRun={lastRun}
      />
      <div className="mt-6">
        <SyntheticNote />
      </div>
    </>
  );
}
