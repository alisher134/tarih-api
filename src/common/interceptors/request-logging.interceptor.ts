import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = randomUUID();
    const startedAt = Date.now();

    request.headers["x-request-id"] = requestId;
    response.setHeader("x-request-id", requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            JSON.stringify({
              requestId,
              method: request.method,
              path: request.url,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
            }),
          );
        },
        error: (error: unknown) => {
          this.logger.error(
            JSON.stringify({
              requestId,
              method: request.method,
              path: request.url,
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        },
      }),
    );
  }
}
