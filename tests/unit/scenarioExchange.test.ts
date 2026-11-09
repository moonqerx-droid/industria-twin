import { describe, expect, it } from "vitest";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";
import { exportScenario, parseScenarioJson, parseStationsCsv, stationsToCsv } from "@/domain/model/scenarioExchange";

describe("Обмен сценариями", () => {
  it("CSV-шаблон текущего сценария импортируется без изменений (круговая проверка)", () => {
    const r = parseStationsCsv(stationsToCsv(BASELINE_PARAMETERS), BASELINE_PARAMETERS);
    expect(r.errors).toEqual([]);
    expect(r.parameters).toEqual(BASELINE_PARAMETERS);
    expect(r.changedStations).toEqual([]);
  });

  it("применяет изменения по коду участка, десятичной запятой и пустым отказам", () => {
    const csv = "code;capacity;distribution;mean;mtbfMin;mttrMin\nC1;3;exponential;20,5;;\nB1;;;;450;25\n";
    const r = parseStationsCsv(csv, BASELINE_PARAMETERS);
    expect(r.errors).toEqual([]);
    expect(r.parameters!.stations["st-assembly"].capacity).toBe(3);
    expect(r.parameters!.stations["st-assembly"].processTime).toEqual({ kind: "exponential", mean: 20.5 });
    expect(r.parameters!.stations["st-assembly"].failure ?? null).toBeNull();
    expect(r.parameters!.stations["st-machining"].failure).toEqual({ mtbfMin: 450, mttrMin: 25 });
    expect(r.parameters!.stations["st-machining"].capacity).toBe(3);
    expect(r.changedStations).toEqual(["st-machining", "st-assembly"]);
  });

  it("сообщает об ошибках с номером строки и не возвращает параметры", () => {
    const csv = "stationId;capacity;distribution;min;mode;max\nst-assembly;0;triangular;30;10;40\nst-unknown;1;;;;\n";
    const r = parseStationsCsv(csv, BASELINE_PARAMETERS);
    expect(r.parameters).toBeNull();
    expect(r.errors.some((e) => e.startsWith("Строка 2 (C1): capacity"))).toBe(true);
    expect(r.errors.some((e) => e.includes("min ≤ mode ≤ max"))).toBe(true);
    expect(r.errors.some((e) => e.includes("Строка 3: неизвестный участок"))).toBe(true);
  });

  it("JSON-экспорт читается обратно; чужой формат отклоняется", () => {
    const text = JSON.stringify(exportScenario("Тест", "описание", BASELINE_PARAMETERS));
    const r = parseScenarioJson(text);
    expect(r.errors).toEqual([]);
    expect(r.scenario!.parameters).toEqual(BASELINE_PARAMETERS);
    expect(parseScenarioJson("{\"format\":\"other\"}").errors[0]).toContain("Неизвестный формат");
    expect(parseScenarioJson("не json").errors[0]).toContain("JSON");
  });
});

describe("Обмен сценариями: снятие отказов", () => {
  it("пустые mtbfMin и mttrMin снимают заданные отказы", () => {
    const r = parseStationsCsv("code;mtbfMin;mttrMin\nB1;;\n", BASELINE_PARAMETERS);
    expect(r.errors).toEqual([]);
    expect(r.parameters!.stations["st-machining"].failure).toBeNull();
    expect(r.changedStations).toEqual(["st-machining"]);
  });
});
