import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { API_ERROR_CODE } from "../../common/errors/api-error-codes";
import { UnauthorizedApiException } from "../../common/errors/unauthorized-api.exception";
import { UsersService, toPublicUser } from "../../users/users.service";
import type { JwtPayload } from "../types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    if (typeof payload.tokenVersion !== "number") {
      throw new UnauthorizedException("Invalid access token");
    }

    const authUser = await this.usersService.findAuthById(payload.sub);
    if (!authUser) {
      throw new UnauthorizedException("Invalid access token");
    }

    if (authUser.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedApiException(
        API_ERROR_CODE.TOKEN_VERSION_MISMATCH,
        "Invalid access token",
      );
    }

    return toPublicUser(authUser);
  }
}
