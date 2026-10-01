import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, QuestionType } from "../generated/prisma/client";
import { CourseAccessService } from "../common/access/course-access.service";
import {
  ensureCourseEnrollment,
  touchEnrollmentActivity,
} from "../common/enrollment/ensure-enrollment";
import { API_ERROR_CODE } from "../common/errors/api-error-codes";
import { BadRequestApiException } from "../common/errors/bad-request-api.exception";
import { ForbiddenApiException } from "../common/errors/forbidden-api.exception";
import { recalculateCourseEnrollmentProgress } from "../common/progress/course-progress";
import { LearningEventsService } from "../learning-events/learning-events.service";
import { stripCorrectAnswers } from "../common/validation/question-validation";
import { PrismaService } from "../prisma/prisma.service";
import type { PublicUser } from "../users/users.service";
import type { SaveTestAttemptDraftDto } from "./dto/save-test-attempt-draft.dto";
import type { SubmitTestAttemptDto } from "./dto/submit-test-attempt.dto";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";

type DraftAnswer = {
  questionId: string;
  optionIds: string[];
};

type AttemptWithTest = NonNullable<
  Awaited<ReturnType<TestsService["loadOwnedInProgressAttempt"]>>
>;

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly learningEvents: LearningEventsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getTestByLessonId(user: PublicUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        test: { select: { id: true } },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (!lesson.test) {
      throw new NotFoundException(`Test for lesson ${lessonId} not found`);
    }

    return this.getTestForStudent(user, lesson.test.id);
  }

  async getTestForStudent(user: PublicUser, testId: string) {
    const test = await this.prisma.lessonTest.findUnique({
      where: { id: testId },
      include: {
        lesson: {
          select: {
            id: true,
            courseId: true,
          },
        },
        questions: {
          orderBy: { order: "asc" },
          include: {
            options: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException(`Test ${testId} not found`);
    }

    await this.courseAccess.assertCourseContentAccess(
      user,
      test.lesson.courseId,
    );
    await this.assertLessonCompletedForTest(user.id, test.lesson.id);

    return {
      ...test,
      questions: test.questions.map((question) => ({
        ...question,
        options: stripCorrectAnswers(question.options),
      })),
    };
  }

  async startAttempt(user: PublicUser, testId: string) {
    const test = await this.prisma.lessonTest.findUnique({
      where: { id: testId },
      include: {
        lesson: {
          select: {
            id: true,
            courseId: true,
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException(`Test ${testId} not found`);
    }

    await this.courseAccess.assertCourseContentAccess(
      user,
      test.lesson.courseId,
    );
    await this.assertLessonCompletedForTest(user.id, test.lesson.id);

    await this.ensureEnrollmentForTest(user.id, test.lesson.courseId);

    const { attempt, createdNew } = await this.prisma.$transaction(
      async (tx) => {
        // Lock user row to prevent race conditions during test attempt creation
        await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;

        if (test.attemptsLimit != null) {
          const attemptsCount = await tx.testAttempt.count({
            where: {
              userId: user.id,
              testId,
              completedAt: { not: null },
            },
          });

          if (attemptsCount >= test.attemptsLimit) {
            throw new ForbiddenApiException(
              API_ERROR_CODE.TEST_ATTEMPTS_LIMIT_REACHED,
              "Test attempts limit reached",
            );
          }
        }

        const inProgressAttempt = await tx.testAttempt.findFirst({
          where: {
            userId: user.id,
            testId,
            completedAt: null,
          },
        });

        if (inProgressAttempt) {
          if (
            test.timeLimit != null &&
            this.isAttemptExpired(inProgressAttempt.startedAt, test.timeLimit)
          ) {
            await tx.testAttempt.update({
              where: { id: inProgressAttempt.id },
              data: {
                completedAt: new Date(),
                score: 0,
                passed: false,
                draftAnswers: Prisma.DbNull,
              },
            });

            throw new BadRequestApiException(
              API_ERROR_CODE.TEST_TIME_LIMIT_EXCEEDED,
              "Test time limit exceeded",
            );
          }

          return { attempt: inProgressAttempt, createdNew: false };
        }

        try {
          return {
            attempt: await tx.testAttempt.create({
              data: {
                userId: user.id,
                testId,
              },
            }),
            createdNew: true,
          };
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            const existingAttempt = await tx.testAttempt.findFirst({
              where: {
                userId: user.id,
                testId,
                completedAt: null,
              },
            });

            if (existingAttempt) {
              return { attempt: existingAttempt, createdNew: false };
            }
          }

          throw error;
        }
      },
    );

    if (createdNew) {
      await this.learningEvents.recordTestStarted(
        user.id,
        test.lesson.courseId,
        test.lesson.id,
        testId,
      );
    }

    await touchEnrollmentActivity(this.prisma, user.id, test.lesson.courseId);

    return attempt;
  }

  async getActiveAttempt(user: PublicUser, testId: string) {
    const test = await this.prisma.lessonTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new NotFoundException(`Test ${testId} not found`);
    }

    const inProgressAttempt = await this.prisma.testAttempt.findFirst({
      where: {
        userId: user.id,
        testId,
        completedAt: null,
      },
    });

    if (!inProgressAttempt) {
      throw new NotFoundException("Active attempt not found");
    }

    if (
      test.timeLimit != null &&
      this.isAttemptExpired(inProgressAttempt.startedAt, test.timeLimit)
    ) {
      await this.prisma.testAttempt.update({
        where: { id: inProgressAttempt.id },
        data: {
          completedAt: new Date(),
          score: 0,
          passed: false,
          draftAnswers: Prisma.DbNull,
        },
      });

      throw new BadRequestApiException(
        API_ERROR_CODE.TEST_TIME_LIMIT_EXCEEDED,
        "Test time limit exceeded",
      );
    }

    return inProgressAttempt;
  }

  async getAttemptDraft(user: PublicUser, attemptId: string) {
    const attempt = await this.loadOwnedInProgressAttempt(user, attemptId);

    return {
      answers: this.parseDraftAnswers(attempt.draftAnswers),
    };
  }

  async saveAttemptDraft(
    user: PublicUser,
    attemptId: string,
    dto: SaveTestAttemptDraftDto,
  ) {
    const attempt = await this.loadOwnedInProgressAttempt(user, attemptId);
    const answers = this.validateDraftAnswers(
      attempt.test.questions,
      dto.answers,
    );

    await this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: { draftAnswers: answers },
    });

    return { answers };
  }

  async submitAttempt(
    user: PublicUser,
    attemptId: string,
    dto: SubmitTestAttemptDto,
  ) {
    const attempt = await this.loadOwnedInProgressAttempt(user, attemptId);
    await this.assertLessonCompletedForTest(user.id, attempt.test.lesson.id);

    const questionMap = new Map(
      attempt.test.questions.map((question) => [question.id, question]),
    );

    if (dto.answers.length !== attempt.test.questions.length) {
      throw new BadRequestException("All questions must be answered");
    }

    const seenQuestionIds = new Set<string>();
    let earnedPoints = 0;
    let totalPoints = 0;
    const answerCreates: Array<{
      questionId: string;
      isCorrect: boolean;
      selectedOptions: { optionId: string }[];
    }> = [];

    for (const answer of dto.answers) {
      if (seenQuestionIds.has(answer.questionId)) {
        throw new BadRequestException(
          `Duplicate answer for question ${answer.questionId}`,
        );
      }
      seenQuestionIds.add(answer.questionId);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(`Unknown question ${answer.questionId}`);
      }

      totalPoints += question.points;

      const optionIds = new Set(answer.optionIds);
      const questionOptionIds = new Set(question.options.map((o) => o.id));

      for (const optionId of optionIds) {
        if (!questionOptionIds.has(optionId)) {
          throw new BadRequestException(
            `Option ${optionId} does not belong to question ${question.id}`,
          );
        }
      }

      this.validateAnswerShape(question.type, optionIds.size);

      const correctOptionIds = new Set(
        question.options.filter((option) => option.isCorrect).map((o) => o.id),
      );

      const { isCorrect, pointsEarnedFraction } = this.evaluateAnswer(
        question.type,
        optionIds,
        correctOptionIds,
      );

      earnedPoints += question.points * pointsEarnedFraction;

      answerCreates.push({
        questionId: question.id,
        isCorrect,
        selectedOptions: [...optionIds].map((optionId) => ({ optionId })),
      });
    }

    const score =
      totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);
    const passed = score >= attempt.test.passingScore;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.testAttempt.updateMany({
        where: {
          id: attemptId,
          userId: user.id,
          completedAt: null,
        },
        data: {
          score,
          passed,
          completedAt: new Date(),
          draftAnswers: Prisma.DbNull,
        },
      });

      if (updated.count === 0) {
        throw new BadRequestException("Attempt already submitted");
      }

      await tx.testAnswer.createMany({
        data: answerCreates.map((answer) => ({
          attemptId,
          questionId: answer.questionId,
          isCorrect: answer.isCorrect,
        })),
      });

      const createdAnswers = await tx.testAnswer.findMany({
        where: { attemptId },
        select: { id: true, questionId: true },
      });
      const answerIdByQuestionId = new Map(
        createdAnswers.map((answer) => [answer.questionId, answer.id]),
      );

      const optionRows = answerCreates.flatMap((answer) =>
        answer.selectedOptions.map((option) => ({
          answerId: answerIdByQuestionId.get(answer.questionId)!,
          optionId: option.optionId,
        })),
      );

      if (optionRows.length > 0) {
        await tx.testAnswerOption.createMany({ data: optionRows });
      }

      return tx.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    });

    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: attempt.test.lesson.courseId,
        },
      },
    });

    if (enrollment) {
      await recalculateCourseEnrollmentProgress(
        this.prisma,
        user.id,
        attempt.test.lesson.courseId,
      );
    }

    await this.learningEvents.recordTestSubmitted(
      user.id,
      attempt.test.lesson.courseId,
      attempt.test.lesson.id,
      attempt.testId,
      score,
      passed,
    );

    await touchEnrollmentActivity(
      this.prisma,
      user.id,
      attempt.test.lesson.courseId,
    );

    return result;
  }

  private async loadOwnedInProgressAttempt(
    user: PublicUser,
    attemptId: string,
  ) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            lesson: {
              select: {
                id: true,
                courseId: true,
              },
            },
            questions: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    if (!attempt || attempt.userId !== user.id) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }

    if (attempt.completedAt) {
      throw new BadRequestException("Attempt already submitted");
    }

    await this.courseAccess.assertCourseContentAccess(
      user,
      attempt.test.lesson.courseId,
    );

    if (
      attempt.test.timeLimit != null &&
      this.isAttemptExpired(attempt.startedAt, attempt.test.timeLimit)
    ) {
      await this.prisma.testAttempt.update({
        where: { id: attempt.id },
        data: {
          completedAt: new Date(),
          score: 0,
          passed: false,
          draftAnswers: Prisma.DbNull,
        },
      });

      throw new BadRequestApiException(
        API_ERROR_CODE.TEST_TIME_LIMIT_EXCEEDED,
        "Test time limit exceeded",
      );
    }

    return attempt;
  }

  private parseDraftAnswers(draftAnswers: unknown): DraftAnswer[] {
    if (!Array.isArray(draftAnswers)) {
      return [];
    }

    return draftAnswers.filter((item): item is DraftAnswer =>
      this.isDraftAnswerItem(item),
    );
  }

  private isDraftAnswerItem(item: unknown): item is DraftAnswer {
    if (typeof item !== "object" || item == null) {
      return false;
    }

    const record = item as Record<string, unknown>;
    const optionIds = record.optionIds;

    return (
      typeof record.questionId === "string" &&
      Array.isArray(optionIds) &&
      optionIds.every((optionId) => typeof optionId === "string")
    );
  }

  private validateDraftAnswers(
    questions: AttemptWithTest["test"]["questions"],
    answers: DraftAnswer[],
  ): DraftAnswer[] {
    const questionMap = new Map(
      questions.map((question) => [question.id, question]),
    );
    const seenQuestionIds = new Set<string>();
    const validated: DraftAnswer[] = [];

    for (const answer of answers) {
      if (seenQuestionIds.has(answer.questionId)) {
        throw new BadRequestException(
          `Duplicate answer for question ${answer.questionId}`,
        );
      }
      seenQuestionIds.add(answer.questionId);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(`Unknown question ${answer.questionId}`);
      }

      const optionIds = new Set(answer.optionIds);
      const questionOptionIds = new Set(question.options.map((o) => o.id));

      for (const optionId of optionIds) {
        if (!questionOptionIds.has(optionId)) {
          throw new BadRequestException(
            `Option ${optionId} does not belong to question ${question.id}`,
          );
        }
      }

      if (optionIds.size > 0) {
        this.validateAnswerShape(question.type, optionIds.size);
      }

      validated.push({
        questionId: answer.questionId,
        optionIds: [...optionIds],
      });
    }

    return validated;
  }

  private async assertLessonCompletedForTest(
    userId: string,
    lessonId: string,
  ): Promise<void> {
    const progress = await this.prisma.userLessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
      select: { completed: true },
    });

    if (!progress?.completed) {
      throw new ForbiddenApiException(
        API_ERROR_CODE.LESSON_NOT_COMPLETED,
        "Complete the lesson before taking the test",
      );
    }
  }

  private async ensureEnrollmentForTest(
    userId: string,
    courseId: string,
  ): Promise<void> {
    const existing = await this.prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    const hasSubscription =
      await this.subscriptionsService.hasActiveSubscription(userId);

    if (!hasSubscription) {
      return;
    }

    const { isNew } = await ensureCourseEnrollment(
      this.prisma,
      userId,
      courseId,
    );

    if (isNew) {
      await this.learningEvents.recordCourseStarted(userId, courseId);
    }
  }

  private isAttemptExpired(startedAt: Date, timeLimitSeconds: number): boolean {
    const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;
    // Add 10 seconds grace period for network latency
    return elapsedSeconds > timeLimitSeconds + 10;
  }

  private validateAnswerShape(type: QuestionType, selectedCount: number) {
    if (type === QuestionType.SINGLE_CHOICE && selectedCount !== 1) {
      throw new BadRequestException(
        "Single choice question requires exactly one option",
      );
    }

    if (type === QuestionType.TRUE_FALSE && selectedCount !== 1) {
      throw new BadRequestException(
        "True/false question requires exactly one option",
      );
    }

    if (type === QuestionType.MULTIPLE_CHOICE && selectedCount < 1) {
      throw new BadRequestException(
        "Multiple choice question requires at least one option",
      );
    }
  }

  private evaluateAnswer(
    type: QuestionType,
    selectedOptionIds: Set<string>,
    correctOptionIds: Set<string>,
  ): { isCorrect: boolean; pointsEarnedFraction: number } {
    if (type === QuestionType.MULTIPLE_CHOICE) {
      let correctSelected = 0;
      let wrongSelected = 0;

      for (const optionId of selectedOptionIds) {
        if (correctOptionIds.has(optionId)) {
          correctSelected++;
        } else {
          wrongSelected++;
        }
      }

      const fraction = Math.max(
        0,
        (correctSelected - wrongSelected) / correctOptionIds.size,
      );

      return { isCorrect: fraction === 1, pointsEarnedFraction: fraction };
    }

    if (selectedOptionIds.size !== correctOptionIds.size) {
      return { isCorrect: false, pointsEarnedFraction: 0 };
    }

    for (const optionId of selectedOptionIds) {
      if (!correctOptionIds.has(optionId)) {
        return { isCorrect: false, pointsEarnedFraction: 0 };
      }
    }

    return { isCorrect: true, pointsEarnedFraction: 1 };
  }
}
