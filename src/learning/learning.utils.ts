export type LessonWithTest = {
  id: string;
  title: string;
  order: number;
  videoDuration: number;
  test: { id: string } | null;
};

export type LessonProgressMap = Map<
  string,
  { watchedSeconds: number; completed: boolean }
>;

export type NextAction =
  | { type: "LESSON"; lessonId: string; testId?: never }
  | { type: "TEST"; lessonId: string; testId: string };

export type ResolvedLearningState = {
  lesson: {
    id: string;
    title: string;
    order: number;
    videoDuration: number;
    watchedSeconds: number;
    completed: boolean;
  };
  nextAction: NextAction;
};

export function resolveLearningState(
  lessons: LessonWithTest[],
  progressMap: LessonProgressMap,
  passedTestIds: Set<string>,
): ResolvedLearningState | null {
  for (const lesson of lessons) {
    const progress = progressMap.get(lesson.id);
    const watchedSeconds = progress?.watchedSeconds ?? 0;
    const completed = progress?.completed ?? false;

    if (!completed) {
      return {
        lesson: {
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
          videoDuration: lesson.videoDuration,
          watchedSeconds,
          completed,
        },
        nextAction: { type: "LESSON", lessonId: lesson.id },
      };
    }

    if (lesson.test && !passedTestIds.has(lesson.test.id)) {
      return {
        lesson: {
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
          videoDuration: lesson.videoDuration,
          watchedSeconds,
          completed,
        },
        nextAction: {
          type: "TEST",
          lessonId: lesson.id,
          testId: lesson.test.id,
        },
      };
    }
  }

  return null;
}

export function countCompletedLessons(
  lessons: LessonWithTest[],
  progressMap: LessonProgressMap,
  passedTestIds: Set<string>,
): number {
  let count = 0;

  for (const lesson of lessons) {
    const progress = progressMap.get(lesson.id);
    const lessonCompleted = progress?.completed ?? false;
    const testCompleted = lesson.test
      ? passedTestIds.has(lesson.test.id)
      : true;

    if (lessonCompleted && testCompleted) {
      count += 1;
    }
  }

  return count;
}
