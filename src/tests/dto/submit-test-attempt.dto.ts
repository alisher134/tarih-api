import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from "class-validator";

export class SubmitAnswerDto {
  @IsString()
  questionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  optionIds: string[];
}

export class SubmitTestAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers: SubmitAnswerDto[];
}
