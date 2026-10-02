import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class PracticeAnswerDto {
  @IsString()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  optionIds: string[];
}

export class SubmitPracticeDto {
  @IsArray()
  @IsString({ each: true })
  testIds: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeAnswerDto)
  answers: PracticeAnswerDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;
}
