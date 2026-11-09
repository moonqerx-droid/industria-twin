-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "login" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ProductionProcess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProductionProcess_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "Station_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "Resource_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationId" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    CONSTRAINT "ProcessNode_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProductionProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProcessNode_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "label" TEXT,
    "condition" TEXT NOT NULL,
    CONSTRAINT "ProcessEdge_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProductionProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProcessEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "ProcessNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProcessEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "ProcessNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "parentScenarioId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "horizonMin" REAL NOT NULL,
    "releaseWindowMin" REAL NOT NULL,
    "arrivalKind" TEXT NOT NULL,
    "arrivalRatePerHour" REAL NOT NULL,
    "defectProbability" REAL NOT NULL,
    "retestDefectProbability" REAL NOT NULL,
    "maxReworkCycles" INTEGER NOT NULL,
    "materialCostPerUnitRub" REAL NOT NULL,
    "fixedCostRub" REAL NOT NULL,
    "seed" INTEGER NOT NULL,
    "replications" INTEGER NOT NULL,
    CONSTRAINT "Scenario_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProductionProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Scenario_parentScenarioId_fkey" FOREIGN KEY ("parentScenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Scenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioStationParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "distribution" TEXT NOT NULL,
    "timeMin" REAL,
    "timeMode" REAL,
    "timeMax" REAL,
    "timeMean" REAL,
    "timeSd" REAL,
    "hourlyCostRub" REAL NOT NULL,
    "consumablesPerOperationRub" REAL NOT NULL,
    CONSTRAINT "ScenarioStationParameter_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioStationParameter_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "baseSeed" INTEGER NOT NULL,
    "replications" INTEGER NOT NULL,
    "horizonMin" REAL NOT NULL,
    "configJson" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulationRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimulationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AggregateMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "mean" REAL,
    "sd" REAL,
    "min" REAL,
    "max" REAL,
    "ci95" REAL,
    CONSTRAINT "AggregateMetric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StationMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "mean" REAL,
    "sd" REAL,
    "min" REAL,
    "max" REAL,
    "ci95" REAL,
    CONSTRAINT "StationMetric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StationMetric_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplicationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "replicationIndex" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "aggregateJson" TEXT NOT NULL,
    "stationsJson" TEXT NOT NULL,
    CONSTRAINT "ReplicationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SimulationEventLog" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "formatVersion" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL,
    "eventsJson" TEXT NOT NULL,
    "snapshotsJson" TEXT NOT NULL,
    CONSTRAINT "SimulationEventLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointOfInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factoryId" TEXT NOT NULL,
    "stationId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bestPractice" TEXT,
    "cameraPresetId" TEXT NOT NULL,
    "metricKeys" TEXT NOT NULL,
    CONSTRAINT "PointOfInterest_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PointOfInterest_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "Tour_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TourStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tourId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "poiId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    CONSTRAINT "TourStop_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TourStop_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "PointOfInterest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poiId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MediaAsset_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "PointOfInterest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Station_factoryId_code_key" ON "Station"("factoryId", "code");

-- CreateIndex
CREATE INDEX "Resource_stationId_idx" ON "Resource"("stationId");

-- CreateIndex
CREATE INDEX "ProcessNode_processId_idx" ON "ProcessNode"("processId");

-- CreateIndex
CREATE INDEX "ProcessNode_stationId_idx" ON "ProcessNode"("stationId");

-- CreateIndex
CREATE INDEX "ProcessEdge_processId_idx" ON "ProcessEdge"("processId");

-- CreateIndex
CREATE INDEX "Scenario_processId_idx" ON "Scenario"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioStationParameter_scenarioId_stationId_key" ON "ScenarioStationParameter"("scenarioId", "stationId");

-- CreateIndex
CREATE INDEX "SimulationRun_scenarioId_createdAt_idx" ON "SimulationRun"("scenarioId", "createdAt");

-- CreateIndex
CREATE INDEX "SimulationRun_createdAt_idx" ON "SimulationRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AggregateMetric_runId_metricKey_key" ON "AggregateMetric"("runId", "metricKey");

-- CreateIndex
CREATE INDEX "StationMetric_stationId_idx" ON "StationMetric"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "StationMetric_runId_stationId_metricKey_key" ON "StationMetric"("runId", "stationId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReplicationResult_runId_replicationIndex_key" ON "ReplicationResult"("runId", "replicationIndex");

-- CreateIndex
CREATE INDEX "PointOfInterest_stationId_idx" ON "PointOfInterest"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "TourStop_tourId_order_key" ON "TourStop"("tourId", "order");
