import { Injectable } from "@nestjs/common";
import { LearningEventType } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type RecordEventParams = {
  userId: string;
  courseId: string;
  type: LearningEventType;
  lessonId?: string;
  testId?: string;
  watchedDeltaSeconds?: number;
  score?: number;
  passed?: boolean;
};

@Injectable()
export class LearningEventsService {
  constructor(private readonly prisma: PrismaService) {}

  recordEvent(params: RecordEventParams) {
    return this.prisma.learningEvent.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        lessonId: params.lessonId,
        testId: params.testId,
        type: params.type,
        watchedDeltaSeconds: params.watchedDeltaSeconds ?? 0,
        score: params.score,
        passed: params.passed,
      },
    });
  }

  recordCourseStarted(userId: string, courseId: string) {
    return this.recordEvent({
      userId,
      courseId,
      type: LearningEventType.COURSE_STARTED,
    });
  }

  recordLessonProgress(
    userId: string,
    courseId: string,
    lessonId: string,
    watchedDeltaSeconds: number,
  ) {
    return this.recordEvent({
      userId,
      courseId,
      lessonId,
      type: LearningEventType.LESSON_PROGRESS,
      watchedDeltaSeconds,
    });
  }

  recordLessonCompleted(userId: string, courseId: string, lessonId: string) {
    return this.recordEvent({
      userId,
      courseId,
      lessonId,
      type: LearningEventType.LESSON_COMPLETED,
    });
  }

  recordTestStarted(
    userId: string,
    courseId: string,
    lessonId: string,
    testId: string,
  ) {
    return this.recordEvent({
      userId,
      courseId,
      lessonId,
      testId,
      type: LearningEventType.TEST_STARTED,
    });
  }

  recordTestSubmitted(
    userId: string,
    courseId: string,
    lessonId: string,
    testId: string,
    score: number,
    passed: boolean,
  ) {
    return this.recordEvent({
      userId,
      courseId,
      lessonId,
      testId,
      type: LearningEventType.TEST_SUBMITTED,
      score,
      passed,
    });
  }
}
