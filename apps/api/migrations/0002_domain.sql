-- Duck Ninja domain tables

CREATE TABLE IF NOT EXISTS "project_invite_code" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "revokedAt" TEXT,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id")
);

CREATE TABLE IF NOT EXISTS "sprint" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "capacityLimit" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "lockedCapacity" INTEGER,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id")
);

CREATE TABLE IF NOT EXISTS "demand" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL,
  "assigneeId" TEXT,
  "dueDate" TEXT,
  "storyPoints" INTEGER,
  "boardColumn" TEXT NOT NULL,
  "sprintId" TEXT,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("sprintId") REFERENCES "sprint" ("id")
);

CREATE TABLE IF NOT EXISTS "subtask" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "storyPoints" INTEGER,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("demandId") REFERENCES "demand" ("id")
);

CREATE TABLE IF NOT EXISTS "case_folder" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("parentId") REFERENCES "case_folder" ("id")
);

CREATE TABLE IF NOT EXISTS "test_case" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "folderId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "precondition" TEXT,
  "stepsJson" TEXT NOT NULL,
  "priority" TEXT,
  "severity" TEXT,
  "type" TEXT,
  "tagsJson" TEXT,
  "maintainerId" TEXT,
  "estimatedMinutes" INTEGER,
  "status" TEXT NOT NULL,
  "paramsJson" TEXT,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("folderId") REFERENCES "case_folder" ("id")
);

CREATE TABLE IF NOT EXISTS "case_demand_link" (
  "caseId" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  PRIMARY KEY ("caseId", "demandId"),
  FOREIGN KEY ("caseId") REFERENCES "test_case" ("id"),
  FOREIGN KEY ("demandId") REFERENCES "demand" ("id")
);

CREATE TABLE IF NOT EXISTS "test_plan" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("sprintId") REFERENCES "sprint" ("id")
);

CREATE TABLE IF NOT EXISTS "test_plan_case" (
  "planId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  PRIMARY KEY ("planId", "caseId"),
  FOREIGN KEY ("planId") REFERENCES "test_plan" ("id"),
  FOREIGN KEY ("caseId") REFERENCES "test_case" ("id")
);

CREATE TABLE IF NOT EXISTS "test_execution" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL,
  "archivedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id"),
  FOREIGN KEY ("planId") REFERENCES "test_plan" ("id"),
  FOREIGN KEY ("sprintId") REFERENCES "sprint" ("id")
);

CREATE TABLE IF NOT EXISTS "execution_case_snapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "executionId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "precondition" TEXT,
  "stepsJson" TEXT NOT NULL,
  "paramsJson" TEXT,
  "sortOrder" INTEGER NOT NULL,
  FOREIGN KEY ("executionId") REFERENCES "test_execution" ("id"),
  FOREIGN KEY ("caseId") REFERENCES "test_case" ("id")
);

CREATE TABLE IF NOT EXISTS "execution_result" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "executionId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL,
  "lastEditorId" TEXT,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("executionId") REFERENCES "test_execution" ("id"),
  FOREIGN KEY ("snapshotId") REFERENCES "execution_case_snapshot" ("id")
);

CREATE TABLE IF NOT EXISTS "result_comment" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "resultId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("resultId") REFERENCES "execution_result" ("id")
);

CREATE TABLE IF NOT EXISTS "attachment" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES "organization" ("id")
);

CREATE INDEX IF NOT EXISTS "demand_project_idx" ON "demand" ("projectId");
CREATE INDEX IF NOT EXISTS "sprint_project_idx" ON "sprint" ("projectId");
CREATE INDEX IF NOT EXISTS "test_case_project_idx" ON "test_case" ("projectId");
CREATE INDEX IF NOT EXISTS "test_plan_sprint_idx" ON "test_plan" ("sprintId");
CREATE INDEX IF NOT EXISTS "execution_plan_idx" ON "test_execution" ("planId");
