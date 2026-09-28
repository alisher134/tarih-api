import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  MATERIAL_CONTENT_TYPES,
  VIDEO_CONTENT_TYPES,
} from "../../../storage/storage.types";

const ALL_CONTENT_TYPES = [...VIDEO_CONTENT_TYPES, ...MATERIAL_CONTENT_TYPES];

export class CreateUploadIntentDto {
  @IsIn(["video", "material"])
  purpose: "video" | "material";

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsIn(ALL_CONTENT_TYPES)
  contentType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize: number;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  lessonId?: string;
}
