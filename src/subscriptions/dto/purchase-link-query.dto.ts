import { IsOptional, IsString } from "class-validator";

export class PurchaseLinkQueryDto {
  @IsOptional()
  @IsString()
  planId?: string;
}
