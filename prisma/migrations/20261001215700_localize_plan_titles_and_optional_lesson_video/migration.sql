-- AlterTable
ALTER TABLE "Lesson" ALTER COLUMN "videoObjectKey" DROP NOT NULL;
ALTER TABLE "Lesson" ALTER COLUMN "videoDuration" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "titleRu" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubscriptionPlan" ADD COLUMN "titleKz" TEXT NOT NULL DEFAULT '';

-- Migrate existing titles if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SubscriptionPlan' AND column_name = 'title'
  ) THEN
    UPDATE "SubscriptionPlan" SET "titleRu" = "title", "titleKz" = "title";
    ALTER TABLE "SubscriptionPlan" DROP COLUMN "title";
  END IF;
END $$;
