import type { AggregateMetricKey, StationMetricKey } from "../model/metrics";
import { runSimulation } from "./engine";
import { deriveSeed } from "./rng";
import { summarize, type SummaryStats } from "./statistics";
import type { AggregateResult, SimulationConfig, SimulationResult, StationResult } from "./types";

export const MAX_REPLICATIONS = 30;

export interface ReplicationOutcome {
  index: number;
  seed: number;
  aggregate: AggregateResult;
  stations: StationResult[];
}

export interface ReplicatedResult {
  baseSeed: number;
  replications: ReplicationOutcome[];
  aggregate: Record<AggregateMetricKey, SummaryStats>;
  stations: Record<string, Record<StationMetricKey, SummaryStats>>;
  /** Репликация №0 с журналом событий и кадрами состояния (для воспроизведения в 3D). */
  representative: SimulationResult;
}

/**
 * Выполняет R независимых репликаций с производными seed.
 * Репликация 0 использует сам baseSeed, поэтому одиночный прогон совпадает с первой репликацией.
 */
export function runReplications(config: SimulationConfig, replications: number): ReplicatedResult {
  const r = Math.max(1, Math.min(MAX_REPLICATIONS, Math.floor(replications)));
  const outcomes: ReplicationOutcome[] = [];
  let representative: SimulationResult | null = null;
  for (let i = 0; i < r; i += 1) {
    const seed = i === 0 ? config.seed >>> 0 : deriveSeed(config.seed, i);
    const result = runSimulation({ ...config, seed, recordEvents: i === 0 ? (config.recordEvents ?? true) : false });
    if (i === 0) representative = result;
    outcomes.push({ index: i, seed, aggregate: result.aggregate, stations: result.stations });
  }

  const aggKeys = Object.keys(outcomes[0]!.aggregate) as AggregateMetricKey[];
  const aggregate = {} as Record<AggregateMetricKey, SummaryStats>;
  for (const key of aggKeys) aggregate[key] = summarize(outcomes.map((o) => o.aggregate[key]));

  const stations: Record<string, Record<StationMetricKey, SummaryStats>> = {};
  for (const st of outcomes[0]!.stations) {
    const keys = Object.keys(st).filter((k) => k !== "stationId" && k !== "name") as StationMetricKey[];
    const perKey = {} as Record<StationMetricKey, SummaryStats>;
    for (const key of keys) {
      perKey[key] = summarize(
        outcomes.map((o) => {
          const s = o.stations.find((x) => x.stationId === st.stationId);
          return s ? (s[key] as number) : null;
        }),
      );
    }
    stations[st.stationId] = perKey;
  }

  return { baseSeed: config.seed >>> 0, replications: outcomes, aggregate, stations, representative: representative! };
}
