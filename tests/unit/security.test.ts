import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safeRedirect";
import { neutralizeFormula, stationsToCsv } from "@/domain/model/scenarioExchange";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";

describe("Безопасный адрес возврата после входа", () => {
  it("пропускает пути приложения", () => {
    expect(safeNextPath("/factory?station=st-assembly")).toBe("/factory?station=st-assembly");
    expect(safeNextPath("/compare#x")).toBe("/compare#x");
  });
  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "/\u0000x", "", null, undefined, "dashboard"])(
    "отклоняет %j",
    (v) => expect(safeNextPath(v as string | null | undefined)).toBe("/dashboard"),
  );
});

describe("Защита CSV от формул", () => {
  it("нейтрализует опасные текстовые ячейки и не трогает числа", () => {
    expect(neutralizeFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(neutralizeFormula("+cmd")).toBe("'+cmd");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("-429,2")).toBe("-429,2");
    expect(neutralizeFormula("Сборка")).toBe("Сборка");
  });
  it("шаблон CSV не содержит ячеек-формул", () => {
    for (const line of stationsToCsv(BASELINE_PARAMETERS).split(/\r?\n/).slice(1)) {
      for (const cell of line.split(";")) expect(cell).not.toMatch(/^[=+@]/);
    }
  });
});
