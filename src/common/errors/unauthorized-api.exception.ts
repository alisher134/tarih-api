import { HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "./api-error-codes";
import { ApiException } from "./api-exception";

export class UnauthorizedApiException extends ApiException {
  constructor(code: ApiErrorCode, message: string) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}
