-- Migration: v2.2 - Email auth, UNBOUND role, Many-to-Many binding
CREATE TYPE "Role"         AS ENUM ('ADMIN','PARENT','TEACHER','UNBOUND');
CREATE TYPE "EntryMode"    AS ENUM ('MANUAL','AI_ASSISTED');
CREATE TYPE "TaskStatus"   AS ENUM ('PENDING','PROCESSING','REVIEW_NEEDED','COMPLETED','FAILED');
CREATE TYPE "Mood"         AS ENUM ('HAPPY','STABLE','ANGRY','CRYING','OTHER');
CREATE TYPE "DietType"     AS ENUM ('MILK','SOLID');
CREATE TYPE "SleepQuality" AS ENUM ('GOOD','NORMAL','POOR');
CREATE TYPE "BowelQuality" AS ENUM ('NORMAL','HARD','WATERY','OTHER');

CREATE TABLE "User" (
  "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "email"             TEXT        NOT NULL,
  "passwordHash"      TEXT        NOT NULL,
  "displayName"       TEXT,
  "role"              "Role"      NOT NULL DEFAULT 'UNBOUND',
  "resetToken"        TEXT,
  "resetTokenExpiry"  TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key"       ON "User"("email");
CREATE UNIQUE INDEX "User_resetToken_key"  ON "User"("resetToken");

CREATE TABLE "Child" (
  "id"                 TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "name"               TEXT        NOT NULL,
  "birthDate"          DATE,
  "gender"             TEXT,
  "notes"              TEXT,
  "avatarUrl"          TEXT,
  "parentBindingCode"  TEXT        NOT NULL DEFAULT '',
  "teacherBindingCode" TEXT        NOT NULL DEFAULT '',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Child_parentBindingCode_key"  ON "Child"("parentBindingCode");
CREATE UNIQUE INDEX "Child_teacherBindingCode_key" ON "Child"("teacherBindingCode");

-- Implicit M2M tables (Prisma convention)
CREATE TABLE "_ChildParents"  ("A" TEXT NOT NULL, "B" TEXT NOT NULL);
CREATE TABLE "_ChildTeachers" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);
CREATE UNIQUE INDEX "_ChildParents_AB_unique"  ON "_ChildParents"("A","B");
CREATE INDEX "_ChildParents_B_index"           ON "_ChildParents"("B");
CREATE UNIQUE INDEX "_ChildTeachers_AB_unique" ON "_ChildTeachers"("A","B");
CREATE INDEX "_ChildTeachers_B_index"          ON "_ChildTeachers"("B");
ALTER TABLE "_ChildParents"  ADD FOREIGN KEY ("A") REFERENCES "Child"("id") ON DELETE CASCADE;
ALTER TABLE "_ChildParents"  ADD FOREIGN KEY ("B") REFERENCES "User"("id")  ON DELETE CASCADE;
ALTER TABLE "_ChildTeachers" ADD FOREIGN KEY ("A") REFERENCES "Child"("id") ON DELETE CASCADE;
ALTER TABLE "_ChildTeachers" ADD FOREIGN KEY ("B") REFERENCES "User"("id")  ON DELETE CASCADE;

CREATE TABLE "UploadTask" (
  "id"         TEXT       NOT NULL DEFAULT gen_random_uuid()::text,
  "childId"    TEXT       NOT NULL,
  "imageUrl"   TEXT       NOT NULL,
  "status"     "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "rawAiData"  JSONB,
  "errorMsg"   TEXT,
  "retryCount" INT        NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "UploadTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyRecord" (
  "id"              TEXT       NOT NULL DEFAULT gen_random_uuid()::text,
  "childId"         TEXT       NOT NULL,
  "recordDate"      DATE       NOT NULL,
  "dropOffTime"     TEXT, "pickUpTime" TEXT,
  "mood"            "Mood",
  "homeBowel"       BOOLEAN    NOT NULL DEFAULT false,
  "homeEatingNotes" TEXT, "notesTeacher" TEXT, "notesParent" TEXT,
  "entryMode"       "EntryMode" NOT NULL,
  "taskId"          TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "DailyRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyRecord_taskId_key"               ON "DailyRecord"("taskId");
CREATE UNIQUE INDEX "DailyRecord_childId_recordDate_key"   ON "DailyRecord"("childId","recordDate");
CREATE INDEX        "DailyRecord_childId_recordDate_idx"   ON "DailyRecord"("childId","recordDate");

CREATE TABLE "DietRecord"   ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "recordId" TEXT NOT NULL, "time" TEXT NOT NULL, "type" "DietType" NOT NULL, "volumeCc" INT, "items" TEXT, CONSTRAINT "DietRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SleepRecord"  ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "recordId" TEXT NOT NULL, "startTime" TEXT NOT NULL, "endTime" TEXT, "quality" "SleepQuality", CONSTRAINT "SleepRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "BowelRecord"  ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "recordId" TEXT NOT NULL, "time" TEXT NOT NULL, "quality" "BowelQuality" NOT NULL, CONSTRAINT "BowelRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "HealthRecord" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "recordId" TEXT NOT NULL, "time" TEXT NOT NULL, "temperature" FLOAT, "symptoms" TEXT[], CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id"));

ALTER TABLE "UploadTask"  ADD FOREIGN KEY ("childId")  REFERENCES "Child"("id");
ALTER TABLE "DailyRecord" ADD FOREIGN KEY ("childId")  REFERENCES "Child"("id");
ALTER TABLE "DailyRecord" ADD FOREIGN KEY ("taskId")   REFERENCES "UploadTask"("id");
ALTER TABLE "DietRecord"  ADD FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE;
ALTER TABLE "SleepRecord" ADD FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE;
ALTER TABLE "BowelRecord" ADD FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE;
ALTER TABLE "HealthRecord"ADD FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE;
