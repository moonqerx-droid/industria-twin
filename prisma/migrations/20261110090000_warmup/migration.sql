-- Период разгона, исключаемый из статистики (0 — статистика с пустой системы)
ALTER TABLE "Scenario" ADD COLUMN "warmupMin" REAL NOT NULL DEFAULT 0;
