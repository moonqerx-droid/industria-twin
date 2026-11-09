import { describe, expect, it } from "vitest";
import { buildMoves, MAX_TRANSIT, MIN_TRANSIT } from "@/components/factory3d/ReplayFlow";
import { runSimulation } from "@/domain/simulation/engine";
import { BASELINE_PARAMETERS, STATIONS } from "@/domain/model/demoData";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";
import { EVENT_TYPES } from "@/domain/simulation/types";

describe("Движение изделий в воспроизведении", () => {
  const r = runSimulation({ ...buildSimulationConfig(BASELINE_PARAMETERS), recordEvents: true });
  const stationIds = STATIONS.map((s) => s.id as string);
  const events = r.events.map((e) => [e.t, EVENT_TYPES.indexOf(e.type), e.unitId, e.stationId ? stationIds.indexOf(e.stationId) : -1, e.defect ? 1 : 0] as [number, number, number, number, number]);
  const moves = buildMoves({ events, eventTypes: EVENT_TYPES, stationIds });

  it("каждое поступление в очередь, отгрузка и списание дают перемещение", () => {
    const expected = r.events.filter((e) => e.type === "QUEUE_ENTER" || e.type === "DEPARTURE" || e.type === "SCRAP").length;
    expect(moves.length).toBe(expected);
  });

  it("перемещения упорядочены по времени, длительность в допустимых пределах, путь непрерывен", () => {
    for (let i = 1; i < moves.length; i += 1) expect(moves[i]!.t0).toBeGreaterThanOrEqual(moves[i - 1]!.t0);
    for (const m of moves) {
      expect(m.dur).toBeGreaterThanOrEqual(MIN_TRANSIT);
      expect(m.dur).toBeLessThanOrEqual(MAX_TRANSIT);
      expect(m.path.length).toBeGreaterThanOrEqual(2);
      expect(m.cum.length).toBe(m.path.length);
    }
  });
});
