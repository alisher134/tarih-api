import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class UpdateLessonProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  watchedSeconds: number;
}
