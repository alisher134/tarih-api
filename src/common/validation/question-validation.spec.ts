import { BadRequestException } from "@nestjs/common";
import { QuestionType } from "../../generated/prisma/client";
import {
  stripCorrectAnswers,
  validateQuestionOptions,
} from "./question-validation";

describe("question-validation", () => {
  it("requires at least two options", () => {
    expect(() =>
      validateQuestionOptions(QuestionType.SINGLE_CHOICE, [
        { text: "Only one", isCorrect: true },
      ]),
    ).toThrow(BadRequestException);
  });

  it("validates single choice has one correct option", () => {
    expect(() =>
      validateQuestionOptions(QuestionType.SINGLE_CHOICE, [
        { text: "A", isCorrect: false },
        { text: "B", isCorrect: false },
      ]),
    ).toThrow(BadRequestException);
  });

  it("strips correct answers from public payload", () => {
    const options = stripCorrectAnswers([
      { id: "1", text: "A", isCorrect: true, order: 0 },
      { id: "2", text: "B", isCorrect: false, order: 1 },
    ]);

    expect(options).toEqual([
      { id: "1", text: "A", order: 0 },
      { id: "2", text: "B", order: 1 },
    ]);
  });
});
