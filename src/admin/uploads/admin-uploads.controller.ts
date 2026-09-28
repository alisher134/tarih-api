import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../../auth/types";
import { AdminGuard } from "../guards/admin.guard";
import { AdminUploadsService } from "./admin-uploads.service";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";

@Controller("admin/uploads")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUploadsController {
  constructor(private readonly adminUploadsService: AdminUploadsService) {}

  @Post("intent")
  createIntent(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateUploadIntentDto,
  ) {
    return this.adminUploadsService.createIntent(req.user.id, dto);
  }

  @Post("intent/:objectKey/confirm")
  confirmIntent(
    @Req() req: AuthenticatedRequest,
    @Param("objectKey") objectKey: string,
  ) {
    return this.adminUploadsService.confirmIntent(
      req.user.id,
      decodeURIComponent(objectKey),
    );
  }
}
