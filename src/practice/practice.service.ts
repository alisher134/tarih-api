import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { CourseStatus, QuestionType } from "../generated/prisma/client";
import { API_ERROR_CODE } from "../common/errors/api-error-codes";
import { ForbiddenApiException } from "../common/errors/forbidden-api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { PublicUser } from "../users/users.service";
import type { StartPracticeDto } from "./dto/start-practice.dto";
import type { SubmitPracticeDto } from "./dto/submit-practice.dto";

export type PracticeTopicItem = {
  testId: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  questionsCount: number;
  bestScore: number;
  attemptsCount: number;
  lastCompletedAt: Date | null;
};

export type QuestionResultDetail = {
  questionId: string;
  questionText: string;
  type: QuestionType;
  points: number;
  earnedPoints: number;
  isCorrect: boolean;
  selectedOptionIds: string[];
  options: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
};

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Asserts that the user has an active subscription or is an administrator.
   */
  async assertActiveSubscription(user: PublicUser): Promise<void> {
    if (user.isAdmin) {
      return;
    }

    const hasActiveSubscription =
      await this.subscriptionsService.hasActiveSubscription(user.id);

    if (!hasActiveSubscription) {
      throw new ForbiddenApiException(
        API_ERROR_CODE.ACTIVE_SUBSCRIPTION_REQUIRED,
        "Active subscription required",
      );
    }
  }

  /**
   * Returns only tests from lessons that the user has ALREADY passed.
   * If a user hasn't completed or passed a test, it is strictly excluded.
   */
  async getAvailableTopics(user: PublicUser): Promise<PracticeTopicItem[]> {
    await this.assertActiveSubscription(user);
    // 1. Find all completed and passed lesson test attempts for this user
    const passedAttempts = await this.prisma.testAttempt.findMany({
      where: {
        userId: user.id,
        passed: true,
        completedAt: { not: null },
      },
      select: {
        testId: true,
        score: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
    });

    if (passedAttempts.length === 0) {
      return [];
    }

    // Map each testId to its best score, attempts count and latest completedAt
    const testStatsMap = new Map<
      string,
      { bestScore: number; attemptsCount: number; lastCompletedAt: Date | null }
    >();

    for (const attempt of passedAttempts) {
      const existing = testStatsMap.get(attempt.testId);
      const score = attempt.score ?? 0;
      if (!existing) {
        testStatsMap.set(attempt.testId, {
          bestScore: score,
          attemptsCount: 1,
          lastCompletedAt: attempt.completedAt,
        });
      } else {
        existing.attemptsCount += 1;
        if (score > existing.bestScore) {
          existing.bestScore = score;
        }
      }
    }

    const passedTestIds = [...testStatsMap.keys()];

    // 2. Fetch the tests that correspond to these passed attempts
    const tests = await this.prisma.lessonTest.findMany({
      where: {
        id: { in: passedTestIds },
        lesson: {
          course: {
            status: CourseStatus.PUBLISHED,
          },
        },
      },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            order: true,
            course: {
              select: {
                id: true,
                title: true,
                slug: true,
                order: true,
              },
            },
          },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: [
        { lesson: { course: { order: "asc" } } },
        { lesson: { order: "asc" } },
      ],
    });

    return tests
      .filter((t) => t._count.questions > 0)
      .map((t) => {
        const stats = testStatsMap.get(t.id);
        return {
          testId: t.id,
          lessonId: t.lesson.id,
          lessonTitle: t.lesson.title,
          lessonOrder: t.lesson.order,
          courseId: t.lesson.course.id,
          courseTitle: t.lesson.course.title,
          courseSlug: t.lesson.course.slug,
          questionsCount: t._count.questions,
          bestScore: stats?.bestScore ?? 0,
          attemptsCount: stats?.attemptsCount ?? 1,
          lastCompletedAt: stats?.lastCompletedAt ?? null,
        };
      });
  }

  /**
   * Starts a practice session by gathering questions from the chosen passed tests.
   */
  async startPracticeSession(user: PublicUser, dto: StartPracticeDto) {
    await this.assertActiveSubscription(user);
    if (!dto.testIds || dto.testIds.length === 0) {
      throw new BadRequestException("At least one test must be selected");
    }

    const uniqueTestIds = [...new Set(dto.testIds)];

    // Verify user has passed all requested testIds
    await this.assertUserPassedAllTests(user.id, uniqueTestIds);

    const questions = await this.prisma.question.findMany({
      where: { testId: { in: uniqueTestIds } },
      include: {
        options: {
          select: { id: true, text: true, order: true },
          orderBy: { order: "asc" },
        },
        test: {
          select: {
            id: true,
            title: true,
            lesson: {
              select: { title: true },
            },
          },
        },
      },
    });

    if (questions.length === 0) {
      throw new BadRequestException("No questions found for selected topics");
    }

    // Shuffle questions if not explicitly disabled
    const shuffle = dto.shuffle !== false;
    let selectedQuestions = questions;
    if (shuffle) {
      selectedQuestions = this.shuffleArray([...questions]);
    }

    // Limit questions count if requested
    if (dto.questionLimit != null && dto.questionLimit > 0) {
      selectedQuestions = selectedQuestions.slice(0, dto.questionLimit);
    }

    return {
      testIds: uniqueTestIds,
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions.map((q) => {
        const options = shuffle ? this.shuffleArray([...q.options]) : q.options;

        return {
          id: q.id,
          text: q.text,
          type: q.type,
          points: q.points,
          testId: q.testId,
          lessonTitle: q.test.lesson.title,
          options: options.map((opt) => ({
            id: opt.id,
            text: opt.text,
          })),
        };
      }),
    };
  }

  /**
   * Submits practice session answers, calculates scores, and saves to PracticeSession.
   */
  async submitPracticeSession(user: PublicUser, dto: SubmitPracticeDto) {
    await this.assertActiveSubscription(user);
    if (!dto.testIds || dto.testIds.length === 0) {
      throw new BadRequestException("At least one test must be selected");
    }

    const uniqueTestIds = [...new Set(dto.testIds)];
    await this.assertUserPassedAllTests(user.id, uniqueTestIds);

    if (!dto.answers || dto.answers.length === 0) {
      throw new BadRequestException("Answers must not be empty");
    }

    const questionIds = dto.answers.map((a) => a.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        options: true,
        test: {
          include: {
            lesson: {
              select: { title: true },
            },
          },
        },
      },
    });

    const answerMap = new Map(
      dto.answers.map((a) => [a.questionId, a.optionIds]),
    );

    let totalPoints = 0;
    let earnedPoints = 0;
    let correctCount = 0;
    const questionResults: QuestionResultDetail[] = [];

    for (const question of questions) {
      totalPoints += question.points;
      const selectedOptionIds = new Set(answerMap.get(question.id) ?? []);
      const correctOptionIds = new Set(
        question.options.filter((o) => o.isCorrect).map((o) => o.id),
      );

      const { isCorrect, fraction } = this.evaluateAnswer(
        question.type,
        selectedOptionIds,
        correctOptionIds,
      );

      const qEarned = question.points * fraction;
      earnedPoints += qEarned;
      if (isCorrect) {
        correctCount += 1;
      }

      questionResults.push({
        questionId: question.id,
        questionText: question.text,
        type: question.type,
        points: question.points,
        earnedPoints: qEarned,
        isCorrect,
        selectedOptionIds: [...selectedOptionIds],
        options: question.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          isCorrect: opt.isCorrect,
        })),
      });
    }

    const score =
      totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);

    // Generate descriptive title for session
    let sessionTitle = "";
    if (uniqueTestIds.length === 1 && questions[0]) {
      sessionTitle = questions[0].test.lesson.title;
    } else {
      const topicCount = uniqueTestIds.length;
      sessionTitle = `${topicCount} тақырып бойынша жаттығу`;
    }

    // Save practice attempt to database
    const session = await this.prisma.practiceSession.create({
      data: {
        userId: user.id,
        title: sessionTitle,
        testIds: uniqueTestIds,
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        score,
        timeSpentSeconds: dto.timeSpentSeconds ?? 0,
        details: questionResults,
      },
    });

    return {
      session: {
        id: session.id,
        title: session.title,
        testIds: session.testIds,
        totalQuestions: session.totalQuestions,
        correctAnswers: session.correctAnswers,
        score: session.score,
        timeSpentSeconds: session.timeSpentSeconds,
        createdAt: session.createdAt,
      },
      score,
      passed: score >= 60,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      earnedPoints,
      totalPoints,
      questionResults,
    };
  }

  /**
   * Retrieves practice history for user.
   */
  async getPracticeHistory(user: PublicUser) {
    await this.assertActiveSubscription(user);
    return this.prisma.practiceSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Retrieves unified test history (combining both official lesson tests and practice sessions).
   */
  async getUnifiedHistory(user: PublicUser) {
    await this.assertActiveSubscription(user);
    const [lessonAttempts, practiceSessions] = await Promise.all([
      this.prisma.testAttempt.findMany({
        where: {
          userId: user.id,
          completedAt: { not: null },
        },
        include: {
          test: {
            include: {
              lesson: {
                select: {
                  title: true,
                  course: { select: { title: true, slug: true } },
                },
              },
              _count: { select: { questions: true } },
            },
          },
        },
        orderBy: { completedAt: "desc" },
        take: 50,
      }),
      this.prisma.practiceSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    type UnifiedItem = {
      id: string;
      type: "LESSON" | "PRACTICE";
      title: string;
      courseTitle?: string;
      score: number;
      passed: boolean;
      totalQuestions: number;
      correctAnswers?: number;
      date: Date;
      timeSpentSeconds?: number;
    };

    const unified: UnifiedItem[] = [];

    for (const attempt of lessonAttempts) {
      if (attempt.completedAt) {
        unified.push({
          id: attempt.id,
          type: "LESSON",
          title: attempt.test.lesson.title,
          courseTitle: attempt.test.lesson.course.title,
          score: attempt.score ?? 0,
          passed: attempt.passed === true,
          totalQuestions: attempt.test._count.questions,
          date: attempt.completedAt,
        });
      }
    }

    for (const session of practiceSessions) {
      unified.push({
        id: session.id,
        type: "PRACTICE",
        title: session.title,
        score: session.score,
        passed: session.score >= 60,
        totalQuestions: session.totalQuestions,
        correctAnswers: session.correctAnswers,
        date: session.createdAt,
        timeSpentSeconds: session.timeSpentSeconds,
      });
    }

    // Sort combined history by date descending
    unified.sort((a, b) => b.date.getTime() - a.date.getTime());

    return unified;
  }

  private async assertUserPassedAllTests(
    userId: string,
    testIds: string[],
  ): Promise<void> {
    const passedAttempts = await this.prisma.testAttempt.findMany({
      where: {
        userId,
        testId: { in: testIds },
        passed: true,
        completedAt: { not: null },
      },
      select: { testId: true },
    });

    const passedSet = new Set(passedAttempts.map((a) => a.testId));
    for (const testId of testIds) {
      if (!passedSet.has(testId)) {
        throw new ForbiddenException(
          `Test ${testId} has not been completed yet. Only tests from passed lessons can be practiced.`,
        );
      }
    }
  }

  private evaluateAnswer(
    type: QuestionType,
    selectedOptionIds: Set<string>,
    correctOptionIds: Set<string>,
  ): { isCorrect: boolean; fraction: number } {
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

      return { isCorrect: fraction === 1, fraction };
    }

    if (selectedOptionIds.size !== correctOptionIds.size) {
      return { isCorrect: false, fraction: 0 };
    }

    for (const optionId of selectedOptionIds) {
      if (!correctOptionIds.has(optionId)) {
        return { isCorrect: false, fraction: 0 };
      }
    }

    return { isCorrect: true, fraction: 1 };
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
