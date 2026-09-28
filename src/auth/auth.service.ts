import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { API_ERROR_CODE } from "../common/errors/api-error-codes";
import { UnauthorizedApiException } from "../common/errors/unauthorized-api.exception";
import {
  UsersService,
  type AuthUser,
  toPublicUser,
} from "../users/users.service";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { SignInDto } from "./dto/sign-in.dto";
import type { SignUpDto } from "./dto/sign-up.dto";
import type {
  AuthTokensResponse,
  JwtPayload,
  RefreshTokenPayload,
} from "./types";

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly accessExpiresIn: JwtSignOptions["expiresIn"];
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: JwtSignOptions["expiresIn"];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>("JWT_ACCESS_SECRET");
    this.accessExpiresIn = config.getOrThrow<string>(
      "JWT_ACCESS_EXPIRES_IN",
    ) as JwtSignOptions["expiresIn"];
    this.refreshSecret = config.getOrThrow<string>("JWT_REFRESH_SECRET");
    this.refreshExpiresIn = config.getOrThrow<string>(
      "JWT_REFRESH_EXPIRES_IN",
    ) as JwtSignOptions["expiresIn"];
  }

  async signUp(dto: SignUpDto): Promise<AuthTokensResponse> {
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const authUser = await this.usersService.findAuthById(user.id);
    if (!authUser) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.createTokenPair(authUser);
  }

  async signIn(dto: SignInDto): Promise<AuthTokensResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isMatch = await argon2.verify(user.passwordHash, dto.password);
    if (!isMatch) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const authUser = await this.usersService.findAuthById(user.id);
    if (!authUser) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createTokenPair(authUser);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        dto.refreshToken,
        { secret: this.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (typeof payload.tokenVersion !== "number") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const authUser = await this.usersService.findAuthById(payload.sub);
    if (!authUser) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (authUser.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedApiException(
        API_ERROR_CODE.TOKEN_VERSION_MISMATCH,
        "Invalid refresh token",
      );
    }

    return this.createTokenPair(authUser);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.usersService.revokeAllSessions(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    await this.usersService.createPasswordResetToken(dto.email);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    try {
      await this.usersService.resetPasswordWithToken(
        dto.token,
        dto.newPassword,
      );
    } catch {
      throw new UnauthorizedApiException(
        API_ERROR_CODE.INVALID_RESET_TOKEN,
        "Invalid reset token",
      );
    }
  }

  private async createTokenPair(user: AuthUser): Promise<AuthTokensResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn,
      }),
    ]);

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken,
    };
  }
}
