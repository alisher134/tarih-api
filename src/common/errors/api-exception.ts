import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "./api-error-codes";

export class ApiException extends HttpException {
  constructor(code: ApiErrorCode, message: string, status: HttpStatus) {
    super({ statusCode: status, message, code }, status);
  }
}
