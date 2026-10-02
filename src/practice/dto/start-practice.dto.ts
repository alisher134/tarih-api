import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class StartPracticeDto {
  @IsArray()
  @IsString({ each: true })
  testIds: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  questionLimit?: number;

  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;
}
