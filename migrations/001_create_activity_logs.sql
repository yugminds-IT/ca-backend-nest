-- Run this migration once to create the activity_logs table.
-- Connect to your database and execute this file.

CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id"             SERIAL PRIMARY KEY,
  "type"           VARCHAR(50)  NOT NULL,
  "userId"         INTEGER,
  "userEmail"      VARCHAR(255),
  "userRole"       VARCHAR(100),
  "organizationId" INTEGER,
  "orgName"        VARCHAR(255),
  "method"         VARCHAR(10),
  "path"           VARCHAR(500),
  "description"    TEXT,
  "ipAddress"      VARCHAR(100),
  "userAgent"      VARCHAR(500),
  "statusCode"     INTEGER,
  "durationMs"     INTEGER,
  "isError"        BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_activity_logs_type"      ON "activity_logs" ("type");
CREATE INDEX IF NOT EXISTS "IDX_activity_logs_createdAt" ON "activity_logs" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IDX_activity_logs_userId"    ON "activity_logs" ("userId");
