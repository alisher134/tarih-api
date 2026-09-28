import { IsString, MinLength } from "class-validator";

export class GrantSubscriptionDto {
  @IsString()
  @MinLength(1)
  planId: string;
}
