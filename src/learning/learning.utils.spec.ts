import { countCompletedLessons, resolveLearningState } from "./learning.utils";

describe("learning.utils", () => {
  const lessons = [
    {
      id: "lesson-1",
      title: "Lesson 1",
      order: 0,
      videoDuration: 100,
      test: { id: "test-1" },
    },
    {
      id: "lesson-2",
      title: "Lesson 2",
      order: 1,
      videoDuration: 200,
      test: null,
    },
  ];

  it("returns lesson next action when lesson is incomplete", () => {
    const progressMap = new Map([
      ["lesson-1", { watchedSeconds: 10, completed: false }],
    ]);

    const state = resolveLearningState(lessons, progressMap, new Set());

    expect(state?.nextAction).toEqual({ type: "LESSON", lessonId: "lesson-1" });
    expect(state?.lesson.watchedSeconds).toBe(10);
  });

  it("returns test next action when lesson completed but test not passed", () => {
    const progressMap = new Map([
      ["lesson-1", { watchedSeconds: 100, completed: true }],
    ]);

    const state = resolveLearningState(lessons, progressMap, new Set());

    expect(state?.nextAction).toEqual({
      type: "TEST",
      lessonId: "lesson-1",
      testId: "test-1",
    });
  });

  it("counts completed lessons with tests", () => {
    const progressMap = new Map([
      ["lesson-1", { watchedSeconds: 100, completed: true }],
      ["lesson-2", { watchedSeconds: 200, completed: true }],
    ]);

    const completed = countCompletedLessons(
      lessons,
      progressMap,
      new Set(["test-1"]),
    );

    expect(completed).toBe(2);
  });

  it("returns null when all lessons and tests are completed", () => {
    const progressMap = new Map([
      ["lesson-1", { watchedSeconds: 100, completed: true }],
      ["lesson-2", { watchedSeconds: 200, completed: true }],
    ]);

    const state = resolveLearningState(
      lessons,
      progressMap,
      new Set(["test-1"]),
    );

    expect(state).toBeNull();
  });
});
