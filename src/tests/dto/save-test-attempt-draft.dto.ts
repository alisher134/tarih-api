import { Type } from "class-transformer";
import { IsArray, IsString, ValidateNested } from "class-validator";

export class DraftAnswerDto {
  @IsString()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  optionIds: string[];
}

export class SaveTestAttemptDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftAnswerDto)
  answers: DraftAnswerDto[];
}
