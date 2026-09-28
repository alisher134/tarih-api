import { BadRequestException } from "@nestjs/common";
import { QuestionType } from "../../generated/prisma/client";

export type QuestionOptionInput = {
  text: string;
  isCorrect: boolean;
  order?: number;
};

export function validateQuestionOptions(
  type: QuestionType,
  options: QuestionOptionInput[],
): void {
  if (options.length < 2) {
    throw new BadRequestException("Question must have at least two options");
  }

  const correctCount = options.filter((option) => option.isCorrect).length;

  if (type === QuestionType.SINGLE_CHOICE && correctCount !== 1) {
    throw new BadRequestException(
      "Single choice question must have exactly one correct option",
    );
  }

  if (type === QuestionType.MULTIPLE_CHOICE && correctCount < 1) {
    throw new BadRequestException(
      "Multiple choice question must have at least one correct option",
    );
  }

  if (type === QuestionType.TRUE_FALSE) {
    if (options.length !== 2) {
      throw new BadRequestException(
        "True/false question must have exactly two options",
      );
    }
    if (correctCount !== 1) {
      throw new BadRequestException(
        "True/false question must have exactly one correct option",
      );
    }
  }
}

export function stripCorrectAnswers<T extends { isCorrect: boolean }>(
  options: T[],
): Omit<T, "isCorrect">[] {
  return options.map((option) => {
    const { isCorrect, ...rest } = option;
    void isCorrect;
    return rest;
  });
}
