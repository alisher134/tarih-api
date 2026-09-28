-- Rename storage URL columns to object keys
ALTER TABLE "Lesson" RENAME COLUMN "videoUrl" TO "videoObjectKey";
ALTER TABLE "LessonMaterial" RENAME COLUMN "fileUrl" TO "fileObjectKey";
