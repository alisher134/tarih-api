-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('VIDEO', 'MATERIAL');

-- CreateEnum
CREATE TYPE "UploadIntentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "courseId" TEXT,
    "lessonId" TEXT,
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadIntent_userId_status_idx" ON "UploadIntent"("userId", "status");

-- CreateIndex
CREATE INDEX "UploadIntent_expiresAt_idx" ON "UploadIntent"("expiresAt");

-- CreateIndex
CREATE INDEX "UploadIntent_objectKey_idx" ON "UploadIntent"("objectKey");

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100);
ALTER TABLE "LessonTest" ADD CONSTRAINT "LessonTest_passingScore_check" CHECK ("passingScore" >= 0 AND "passingScore" <= 100);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_videoDuration_check" CHECK ("videoDuration" > 0);

-- Partial unique index: one in-progress attempt per user/test
CREATE UNIQUE INDEX "TestAttempt_userId_testId_in_progress_key" ON "TestAttempt"("userId", "testId") WHERE "completedAt" IS NULL;

-- Index for completed attempts counting
CREATE INDEX "TestAttempt_userId_testId_completed_idx" ON "TestAttempt"("userId", "testId") WHERE "completedAt" IS NOT NULL;

-- Index for course analytics
CREATE INDEX "CourseEnrollment_courseId_idx" ON "CourseEnrollment"("courseId");

-- Trigram search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Course_title_trgm_idx" ON "Course" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Course_slug_trgm_idx" ON "Course" USING gin ("slug" gin_trgm_ops);
CREATE INDEX "User_email_trgm_idx" ON "User" USING gin ("email" gin_trgm_ops);
CREATE INDEX "User_firstName_trgm_idx" ON "User" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX "User_lastName_trgm_idx" ON "User" USING gin ("lastName" gin_trgm_ops);
