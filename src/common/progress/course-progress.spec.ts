import { CourseEnrollmentStatus } from "../../generated/prisma/client";
import {
  isLessonCompletedByWatch,
  recalculateAllCourseEnrollmentsProgress,
  recalculateCourseEnrollmentProgress,
} from "./course-progress";

describe("course-progress", () => {
  it("marks lesson completed after threshold percent", () => {
    expect(isLessonCompletedByWatch(90, 100, 90)).toBe(true);
    expect(isLessonCompletedByWatch(89, 100, 90)).toBe(false);
  });

  it("recalculates enrollment progress for all enrolled users", async () => {
    const prisma = {
      courseEnrollment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ userId: "user-1" }, { userId: "user-2" }])
          .mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lesson: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "lesson-1",
            test: { id: "test-1" },
          },
        ]),
      },
      userLessonProgress: {
        findMany: jest.fn().mockResolvedValue([{ lessonId: "lesson-1" }]),
      },
      testAttempt: {
        findMany: jest.fn().mockResolvedValue([{ testId: "test-1" }]),
      },
    };

    await recalculateAllCourseEnrollmentsProgress(prisma as never, "course-1");

    expect(prisma.courseEnrollment.findMany).toHaveBeenCalledWith({
      where: { courseId: "course-1" },
      select: { userId: true },
    });
    expect(prisma.courseEnrollment.updateMany).toHaveBeenCalledTimes(2);
  });

  it("marks enrollment completed when all lessons and tests are done", async () => {
    const prisma = {
      courseEnrollment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lesson: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "lesson-1",
            test: { id: "test-1" },
          },
        ]),
      },
      userLessonProgress: {
        findMany: jest.fn().mockResolvedValue([{ lessonId: "lesson-1" }]),
      },
      testAttempt: {
        findMany: jest.fn().mockResolvedValue([{ testId: "test-1" }]),
      },
    };

    await recalculateCourseEnrollmentProgress(
      prisma as never,
      "user-1",
      "course-1",
    );

    const updateCalls = prisma.courseEnrollment.updateMany.mock.calls as Array<
      [
        {
          where: { userId: string; courseId: string };
          data: {
            progress: number;
            status: CourseEnrollmentStatus;
            completedAt: Date;
          };
        },
      ]
    >;

    expect(updateCalls[0]?.[0].where).toEqual({
      userId: "user-1",
      courseId: "course-1",
    });
    expect(updateCalls[0]?.[0].data.progress).toBe(100);
    expect(updateCalls[0]?.[0].data.status).toBe(
      CourseEnrollmentStatus.COMPLETED,
    );
    expect(updateCalls[0]?.[0].data.completedAt).toBeInstanceOf(Date);
  });
});
