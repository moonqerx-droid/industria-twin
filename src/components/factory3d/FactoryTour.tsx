"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { Grid2x2, Maximize2, Minimize2, Scan } from "lucide-react";
import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { STATION_IDS, isStationId, type StationId } from "@/domain/model/demoData";
import { AGGREGATE_METRICS, STATION_METRICS, formatMetricValue, type AggregateMetricKey, type StationMetricKey } from "@/domain/model/metrics";
import { fmtClock, fmtDateTime } from "@/lib/format";
import type { StationView } from "@/lib/views";
import type { PoiDto, TourDto } from "@/server/services/tourService";
import type { ReplayDto, RunDetailDto } from "@/server/services/simulationService";
import { StationPanel } from "@/components/process/StationPanel";
import { useSelection } from "@/store/selection";
import { FactoryPlan2D } from "./FactoryPlan2D";
import { CAMERA_PRESETS, cameraForStation } from "./sceneContract";
import { useScene, type QualityLevel } from "./sceneStore";
import type { StationSceneData } from "./StationAnchor";

const FactoryCanvas = dynamic(() => import("./FactoryCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted" role="status">
      Загрузка 3D-сцены…
    </div>
  ),
});

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type View = "3d" | "plan";

export function FactoryTour({
  stations,
  pois,
  tours,
  run,
}: {
  stations: StationView[];
  pois: PoiDto[];
  tours: TourDto[];
  run: RunDetailDto | null;
}) {
  const mode = useScene((s) => s.mode);
  const setMode = useScene((s) => s.setMode);
  const flyTo = useScene((s) => s.flyTo);
  const quality = useScene((s) => s.quality);
  const setQuality = useScene((s) => s.setQuality);
  const effectiveQuality = useScene((s) => s.effectiveQuality);
  const frameIndex = useScene((s) => s.replayFrame);
  const setFrame = useScene((s) => s.setReplayFrame);
  const playing = useScene((s) => s.playing);
  const setPlaying = useScene((s) => s.setPlaying);
  const speed = useScene((s) => s.speed);
  const setSpeed = useScene((s) => s.setSpeed);
  const selectedId = useSelection((s) => s.selectedStationId);
  const select = useSelection((s) => s.selectStation);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("3d");
  const [sceneFailed, setSceneFailed] = useState(false);
  const [stopIndex, setStopIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [replay, setReplay] = useState<ReplayDto | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === viewportRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewportRef.current?.requestFullscreen();
    } catch { /* Browser may deny fullscreen; the embedded viewport remains usable. */ }
  }

  const tour = tours[0];
  const stops = tour?.stops ?? [];
  const stop = stops[stopIndex];
  const stopPoi = stop ? pois.find((p) => p.id === stop.poiId) : undefined;

  useEffect(() => {
    const ok = detectWebGL();
    setWebgl(ok);
    if (!ok) setView("plan");
    // На узких экранах начинаем с облегчённого качества.
    if (window.matchMedia("(max-width: 767px)").matches) useScene.getState().setQuality("low");
  }, []);

  // При открытии страницы с выбранным участком — перелёт к нему.
  useEffect(() => {
    const id = useSelection.getState().selectedStationId;
    if (id) flyTo(cameraForStation(id).id);
    else flyTo("cam-overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToStop = useCallback(
    (i: number) => {
      const s = stops[i];
      if (!s) return;
      setStopIndex(i);
      const poi = pois.find((p) => p.id === s.poiId);
      if (!poi) return;
      flyTo(poi.cameraPresetId);
      select(poi.stationId && isStationId(poi.stationId) ? poi.stationId : null);
    },
    [stops, pois, flyTo, select],
  );

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => {
      if (stopIndex < stops.length - 1) goToStop(stopIndex + 1);
      else setAutoplay(false);
    }, 9000);
    return () => window.clearTimeout(t);
  }, [autoplay, stopIndex, stops.length, goToStop]);

  // Загрузка журнала событий выбранного прогона при переходе в режим воспроизведения.
  useEffect(() => {
    if (mode !== "replay" || !run || replay?.runId === run.id) return;
    setReplayError(null);
    const controller = new AbortController();
    setPlaying(false);
    fetch(`/api/runs/${run.id}/replay`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Ошибка ${r.status}`);
        return (await r.json()) as ReplayDto;
      })
      .then((d) => {
        setReplay(d);
        setFrame(0);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setReplayError(`Не удалось загрузить журнал событий: ${e.message}`);
      });
    return () => controller.abort();
  }, [mode, run, replay, setFrame, setPlaying]);

  // Воспроизведение: шаг кадра = 5 модельных минут; скорость — кадров в секунду.
  useEffect(() => {
    if (!playing || !replay) return;
    const id = window.setInterval(() => {
      const s = useScene.getState();
      const next = s.replayFrame + 1;
      if (next >= replay.snapshots.length) {
        s.setPlaying(false);
        return;
      }
      s.setReplayFrame(next);
    }, 1000 / (2 * speed));
    return () => window.clearInterval(id);
  }, [playing, replay, speed]);

  const sceneStations: StationSceneData[] = useMemo(() => {
    const frame = mode === "replay" && replay?.runId === run?.id ? replay?.snapshots[frameIndex] : undefined;
    return stations.map((s) => {
      const cap = s.metrics.capacity?.mean ?? 1;
      const id = s.stationId as StationId;
      if (frame) {
        const [q, b] = frame.stations[id] ?? [0, 0];
        return { stationId: id, code: s.code, shortName: s.shortName, capacity: cap, status: s.status, busy: b, queue: q, utilization: b / cap, poiId: s.poiId };
      }
      const u = s.metrics.utilization?.mean ?? null;
      return {
        stationId: id,
        code: s.code,
        shortName: s.shortName,
        capacity: cap,
        status: s.status,
        busy: u !== null ? Math.round(u * cap) : 0,
        queue: s.metrics.avgQueueLength?.mean ?? 0,
        utilization: u,
        poiId: s.poiId,
      };
    });
  }, [stations, mode, replay, frameIndex, run?.id]);

  const replayReady = replay?.runId === run?.id;
  const frame = replayReady ? replay?.snapshots[frameIndex] : undefined;
  const selectedPoi = pois.find((p) => p.stationId === selectedId) ?? (stopPoi?.stationId === null ? stopPoi : undefined);
  const selectedStationView = stations.find((s) => s.stationId === selectedId);

  const show3D = view === "3d" && webgl && !sceneFailed;
  const planFallback = (
    <div className="h-full p-2">
      <FactoryPlan2D stations={sceneStations} />
    </div>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Режим" className="inline-flex rounded-[var(--radius-control)] border border-line-strong bg-surface p-0.5 text-sm">
            {(
              [
                ["tour", "Экскурсия"],
                ["replay", "Воспроизведение прогона"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                disabled={m === "replay" && !run}
                className={clsx("rounded-[5px] px-3 py-1.5", mode === m ? "bg-accent text-white" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => setView(view === "3d" ? "plan" : "3d")}
              disabled={!webgl}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-ink hover:border-accent disabled:opacity-50"
            >
              {view === "3d" ? "План 2D" : "3D-сцена"}
            </button>
            <label className="flex items-center gap-1.5 text-muted">
              Качество
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as QualityLevel)}
                className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-ink"
              >
                <option value="auto">авто ({effectiveQuality === "high" ? "высокое" : "низкое"})</option>
                <option value="low">низкое</option>
                <option value="high">высокое</option>
              </select>
            </label>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="factory-viewport relative h-[60vh] min-h-[360px] overflow-hidden rounded-[var(--radius-panel)] border border-line-strong sm:h-[70vh] [&:fullscreen]:h-dvh [&:fullscreen]:rounded-none"
          data-testid="factory-viewport"
          data-mode={mode}
        >
          {webgl === null ? null : show3D ? (
            <SceneErrorBoundary fallback={planFallback}>
              <FactoryCanvas stations={sceneStations} onError={() => setSceneFailed(true)} />
            </SceneErrorBoundary>
          ) : (
            planFallback
          )}
          {webgl === false && (
            <p role="status" className="absolute left-3 top-3 max-w-xs viewport-chip rounded-md px-3 py-2 text-xs text-warn">
              WebGL недоступен в этом браузере. Показан упрощённый план цеха: маршрут, точки интереса и показатели доступны полностью.
            </p>
          )}
          {sceneFailed && (
            <p role="status" className="absolute left-3 top-3 max-w-xs viewport-chip rounded-md px-3 py-2 text-xs text-warn">
              3D-контекст потерян. Показан план цеха.
            </p>
          )}
          {show3D && (
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
              <button onClick={toggleFullscreen} aria-label={fullscreen ? "Выйти из полноэкранного режима" : "На весь экран"} title={fullscreen ? "Свернуть" : "На весь экран"} className="viewport-chip inline-flex h-9 w-9 items-center justify-center rounded-md">
                {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button onClick={() => flyTo("cam-overview")} className="viewport-chip inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium">
                <Scan className="h-3.5 w-3.5" aria-hidden="true" />Общий план
              </button>
              <button onClick={() => flyTo("cam-top")} className="viewport-chip inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium">
                <Grid2x2 className="h-3.5 w-3.5" aria-hidden="true" />{CAMERA_PRESETS["cam-top"]!.label}
              </button>
              <span className="viewport-chip ml-auto hidden rounded-md px-3 py-2 text-[11px] text-muted sm:block">Вращение: левая кнопка мыши. Масштаб: колесо. Выбор участка: нажатие</span>
            </div>
          )}
          <div className="viewport-chip pointer-events-none absolute right-3 top-3 rounded-md px-3 py-1.5 text-xs text-muted">
            {mode === "replay" && frame ? (
              <>
                Модельное время <span className="font-semibold text-ink">{fmtClock(frame.t)}</span>, в системе {frame.wip}, отгружено {frame.completed}
              </>
            ) : run ? (
              <>Средние по прогону «{run.scenarioName}»</>
            ) : (
              <>Нет расчётов — показатели не отображаются</>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted" aria-label="Легенда состояния участков">
          <span className="text-faint">Состояние участков</span>
          {([["#1d9a66", "Норма"], ["#e08a12", "Высокая загрузка"], ["#d2412f", "Перегрузка"]] as const).map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{label}</span>)}
        </div>

        {mode === "replay" && (
          <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-3" data-testid="replay-controls">
            {replayError ? (
              <p role="alert" className="text-sm text-crit">{replayError}</p>
            ) : !replay || !replayReady ? (
              <p className="text-sm text-muted" role="status">Загрузка журнала событий…</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    if (frameIndex >= replay.snapshots.length - 1) setFrame(0);
                    setPlaying(!playing);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
                  aria-label={playing ? "Пауза" : "Воспроизвести"}
                >
                  {playing ? "Ⅱ" : "▶"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={replay.snapshots.length - 1}
                  value={frameIndex}
                  onChange={(e) => setFrame(Number(e.target.value))}
                  aria-label="Модельное время"
                  className="min-w-[160px] flex-1"
                />
                <span className="w-24 text-sm tabular-nums">
                  {fmtClock(frame?.t ?? 0)} / {fmtClock(replay.horizonMin)}
                </span>
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  Скорость
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-[var(--radius-control)] border border-line-strong bg-field px-2 py-1 text-ink">
                    <option value={1}>10 мин/с</option>
                    <option value={3}>30 мин/с</option>
                    <option value={6}>1 ч/с</option>
                  </select>
                </label>
                <p className="w-full text-xs text-faint">
                  Кадры состояния с шагом 5 модельных минут, полученные из журнала событий репликации №1 (seed {run?.baseSeed}, {replay.events.length} событий
                  {replay.truncated ? ", журнал усечён" : ""}). Очереди и занятость оборудования в сцене соответствуют выбранному кадру.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {tour && (
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface" aria-labelledby="tour-title">
            <header className="border-b border-line px-4 py-3">
              <h2 id="tour-title" className="font-semibold">{tour.name}</h2>
              <p className="text-xs text-muted">{tour.audience}</p>
            </header>
            <div className="p-4">
              <ol className="flex flex-wrap gap-1.5" aria-label="Остановки маршрута">
                {stops.map((s, i) => (
                  <li key={s.order}>
                    <button
                      onClick={() => goToStop(i)}
                      aria-current={i === stopIndex ? "step" : undefined}
                      className={clsx(
                        "h-8 min-w-8 rounded-[var(--radius-control)] border px-2 text-xs",
                        i === stopIndex ? "border-accent bg-accent/15 text-ink" : "border-line-strong text-muted hover:text-ink",
                      )}
                      title={s.title}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
              {stop && (
                <div className="mt-3" data-testid="tour-stop">
                  <h3 className="font-semibold">
                    {stopIndex + 1}. {stop.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{stop.narrative}</p>
                </div>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => goToStop(Math.max(0, stopIndex - 1))} disabled={stopIndex === 0} className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-control)] border border-line-strong px-3 text-sm disabled:opacity-40" aria-label="Предыдущая остановка">
                  Назад
                </button>
                <button onClick={() => goToStop(Math.min(stops.length - 1, stopIndex + 1))} disabled={stopIndex >= stops.length - 1} className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-control)] border border-line-strong px-3 text-sm disabled:opacity-40" aria-label="Следующая остановка" data-testid="tour-next">
                  Далее
                </button>
                <button
                  onClick={() => {
                    if (!autoplay) goToStop(stopIndex);
                    setAutoplay(!autoplay);
                  }}
                  className="ml-auto text-sm text-accent-strong hover:underline"
                >
                  {autoplay ? "Остановить экскурсию" : "Автоматическая экскурсия"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4" aria-label="Точка интереса">
          {selectedPoi ? (
            <div data-testid="poi-card" data-poi-id={selectedPoi.id}>
              <h2 className="font-semibold">{selectedPoi.title}</h2>
              <p className="mt-1 text-sm text-muted">{selectedPoi.description}</p>
              {selectedPoi.bestPractice && (
                <p className="mt-3 border-l-2 border-accent pl-3 text-sm">
                  <span className="text-muted">Практика: </span>
                  {selectedPoi.bestPractice}
                </p>
              )}
              {run && selectedPoi.stationId === null && (
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {selectedPoi.metricKeys.map((k) => {
                    const def = AGGREGATE_METRICS[k as AggregateMetricKey];
                    if (!def) return null;
                    return (
                      <div key={k}>
                        <dt className="text-xs text-muted">{def.label}</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatMetricValue(def, run.aggregate[k as AggregateMetricKey]?.mean)} {def.unit}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {run && selectedStationView && selectedPoi.stationId && (
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {selectedPoi.metricKeys.map((k) => {
                    const def = STATION_METRICS[k as StationMetricKey];
                    if (!def) return null;
                    return (
                      <div key={k}>
                        <dt className="text-xs text-muted">{def.label}</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatMetricValue(def, selectedStationView.metrics[k as StationMetricKey]?.mean)} {def.unit}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Нажмите на участок или его табличку в сцене, чтобы открыть точку интереса.</p>
          )}
        </section>

        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4" aria-label="Метрики участка">
          <StationPanel stations={stations} runId={run?.id ?? null} context="factory" emptyHint="Выберите участок, чтобы увидеть рассчитанные показатели." />
        </section>

        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Перейти к участку</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {STATION_IDS.map((id) => {
              const s = stations.find((x) => x.stationId === id)!;
              return (
                <li key={id}>
                  <button
                    onClick={() => {
                      select(id);
                      flyTo(cameraForStation(id).id);
                    }}
                    className={clsx(
                      "w-full rounded-[var(--radius-control)] border px-2.5 py-1.5 text-left text-sm",
                      selectedId === id ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="font-semibold text-accent-strong">{s.code}</span> {s.shortName}
                  </button>
                </li>
              );
            })}
          </ul>
          {run && (
            <p className="mt-3 text-xs text-faint">
              Показатели: прогон «{run.scenarioName}» от {fmtDateTime(run.createdAt)}.{" "}
              <Link href="/compare" className="text-accent-strong hover:underline">
                Сравнение сценариев
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
