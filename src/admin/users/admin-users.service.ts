import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma } from "../../generated/prisma/client";
import { clampPagination } from "../../common/constants/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import { PublicUser, USER_PUBLIC_SELECT } from "../../users/users.service";
import type { CreateAdminUserDto } from "./dto/create-admin-user.dto";
import type { ListAdminUsersQueryDto } from "./dto/list-admin-users-query.dto";
import type { ResetAdminUserPasswordDto } from "./dto/reset-admin-user-password.dto";
import type { UpdateAdminUserDto } from "./dto/update-admin-user.dto";

export type PaginatedUsers = {
  data: PublicUser[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAdminUsersQueryDto): Promise<PaginatedUsers> {
    const { page, limit } = clampPagination(query.page, query.limit);
    const sort = query.sort ?? "createdAt";
    const order = query.order ?? "desc";

    const where: Prisma.UserWhereInput = {
      ...(query.isAdmin !== undefined ? { isAdmin: query.isAdmin } : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: { contains: query.search, mode: "insensitive" },
              },
              {
                firstName: { contains: query.search, mode: "insensitive" },
              },
              {
                lastName: { contains: query.search, mode: "insensitive" },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_PUBLIC_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sort]: order },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  async create(dto: CreateAdminUserDto): Promise<PublicUser> {
    const passwordHash = await argon2.hash(dto.password);

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isAdmin: dto.isAdmin ?? false,
        },
        select: USER_PUBLIC_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Email already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
    actorId: string,
  ): Promise<PublicUser> {
    const user = await this.findById(id);

    if (dto.isAdmin === false && user.isAdmin) {
      await this.ensureAnotherAdminExists(id);
    }

    if (id === actorId && dto.isAdmin === false) {
      throw new BadRequestException("Cannot remove admin role from yourself");
    }

    if (
      Object.keys(dto).length === 0 ||
      (dto.email === undefined &&
        dto.firstName === undefined &&
        dto.lastName === undefined &&
        dto.isAdmin === undefined)
    ) {
      throw new BadRequestException("At least one field must be provided");
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.isAdmin !== undefined ? { isAdmin: dto.isAdmin } : {}),
        },
        select: USER_PUBLIC_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Email already exists");
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new BadRequestException("Cannot delete your own account");
    }

    const user = await this.findById(id);

    if (user.isAdmin) {
      await this.ensureAnotherAdminExists(id);
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }
      throw error;
    }
  }

  async resetPassword(
    id: string,
    dto: ResetAdminUserPasswordDto,
  ): Promise<void> {
    await this.findById(id);

    const passwordHash = await argon2.hash(dto.newPassword);

    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }
      throw error;
    }
  }

  private async ensureAnotherAdminExists(excludeId: string): Promise<void> {
    const otherAdmins = await this.prisma.user.count({
      where: {
        isAdmin: true,
        NOT: { id: excludeId },
      },
    });

    if (otherAdmins === 0) {
      throw new BadRequestException("Cannot remove the last admin");
    }
  }
}
