import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";
import type { AuthenticatedRequest } from "../../auth/types";

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("AdminAudit");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const isAdminRoute = request.url.includes("/admin/");

    if (!isAdminRoute || request.method === "GET") {
      return next.handle();
    }

    const user = (request as AuthenticatedRequest).user;
    const actorId = user?.id ?? "unknown";

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            actorId,
            method: request.method,
            path: request.url,
            requestId: request.headers["x-request-id"],
          }),
        );
      }),
    );
  }
}
