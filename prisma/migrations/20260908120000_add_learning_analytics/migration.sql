-- CreateEnum
CREATE TYPE "LearningEventType" AS ENUM ('COURSE_STARTED', 'LESSON_PROGRESS', 'LESSON_COMPLETED', 'TEST_STARTED', 'TEST_SUBMITTED');

-- AlterTable
ALTER TABLE "CourseEnrollment" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill lastActivityAt from enrolledAt for existing rows
UPDATE "CourseEnrollment" SET "lastActivityAt" = "enrolledAt" WHERE "lastActivityAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT,
    "testId" TEXT,
    "type" "LearningEventType" NOT NULL,
    "watchedDeltaSeconds" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseEnrollment_courseId_status_idx" ON "CourseEnrollment"("courseId", "status");

-- CreateIndex
CREATE INDEX "CourseEnrollment_lastActivityAt_idx" ON "CourseEnrollment"("lastActivityAt");

-- CreateIndex
CREATE INDEX "UserLessonProgress_lessonId_completed_idx" ON "UserLessonProgress"("lessonId", "completed");

-- CreateIndex
CREATE INDEX "TestAttempt_testId_completedAt_idx" ON "TestAttempt"("testId", "completedAt");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_createdAt_idx" ON "LearningEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningEvent_courseId_createdAt_idx" ON "LearningEvent"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningEvent_type_createdAt_idx" ON "LearningEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
