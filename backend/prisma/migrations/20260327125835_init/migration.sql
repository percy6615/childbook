-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARENT', 'TEACHER', 'UNBOUND');

-- CreateEnum
CREATE TYPE "EntryMode" AS ENUM ('MANUAL', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW_', 'NEEDED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('HAPPY', 'STABLE', 'ANGRY', 'CRYING', 'OTHER');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('MILK', 'SOLID');

-- CreateEnum
CREATE TYPE "SleepQuality" AS ENUM ('GOOD', 'NORMAL', 'POOR');

-- CreateEnum
CREATE TYPE "BowelQuality" AS ENUM ('NORMAL', 'HARD', 'WATERY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'UNBOUND',
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATE,
    "gender" TEXT,
    "notes" TEXT,
    "avatarUrl" TEXT,
    "parentBindingCode" TEXT NOT NULL,
    "teacherBindingCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadTask" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "rawAiData" JSONB,
    "errorMsg" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "recordDate" DATE NOT NULL,
    "dropOffTime" TEXT,
    "pickUpTime" TEXT,
    "mood" "Mood",
    "homeBowel" BOOLEAN NOT NULL DEFAULT false,
    "homeEatingNotes" TEXT,
    "notesTeacher" TEXT,
    "notesParent" TEXT,
    "entryMode" "EntryMode" NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietRecord" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "type" "DietType" NOT NULL,
    "volumeCc" INTEGER,
    "items" TEXT,

    CONSTRAINT "DietRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepRecord" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "quality" "SleepQuality",

    CONSTRAINT "SleepRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BowelRecord" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "quality" "BowelQuality" NOT NULL,

    CONSTRAINT "BowelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "symptoms" TEXT[],

    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ChildParents" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ChildTeachers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Child_parentBindingCode_key" ON "Child"("parentBindingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Child_teacherBindingCode_key" ON "Child"("teacherBindingCode");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecord_taskId_key" ON "DailyRecord"("taskId");

-- CreateIndex
CREATE INDEX "DailyRecord_childId_recordDate_idx" ON "DailyRecord"("childId", "recordDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecord_childId_recordDate_key" ON "DailyRecord"("childId", "recordDate");

-- CreateIndex
CREATE UNIQUE INDEX "_ChildParents_AB_unique" ON "_ChildParents"("A", "B");

-- CreateIndex
CREATE INDEX "_ChildParents_B_index" ON "_ChildParents"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ChildTeachers_AB_unique" ON "_ChildTeachers"("A", "B");

-- CreateIndex
CREATE INDEX "_ChildTeachers_B_index" ON "_ChildTeachers"("B");

-- AddForeignKey
ALTER TABLE "UploadTask" ADD CONSTRAINT "UploadTask_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecord" ADD CONSTRAINT "DailyRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecord" ADD CONSTRAINT "DailyRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UploadTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietRecord" ADD CONSTRAINT "DietRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepRecord" ADD CONSTRAINT "SleepRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BowelRecord" ADD CONSTRAINT "BowelRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DailyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChildParents" ADD CONSTRAINT "_ChildParents_A_fkey" FOREIGN KEY ("A") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChildParents" ADD CONSTRAINT "_ChildParents_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChildTeachers" ADD CONSTRAINT "_ChildTeachers_A_fkey" FOREIGN KEY ("A") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChildTeachers" ADD CONSTRAINT "_ChildTeachers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
