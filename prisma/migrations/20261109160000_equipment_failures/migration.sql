-- Отказы оборудования: MTBF/MTTR на участок сценария (NULL — без отказов)
ALTER TABLE "ScenarioStationParameter" ADD COLUMN "mtbfMin" REAL;
ALTER TABLE "ScenarioStationParameter" ADD COLUMN "mttrMin" REAL;
