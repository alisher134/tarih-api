import * as argon2 from "argon2";
import { PrismaService } from "../../src/prisma/prisma.service";

type CreateAdminUserParams = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type AdminUserBody = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
};

export type PaginatedUsersBody = {
  data: AdminUserBody[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function readAdminUser(body: unknown): AdminUserBody {
  if (typeof body !== "object" || body == null) {
    throw new Error("Expected admin user object");
  }

  const record = body as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.email !== "string" ||
    typeof record.firstName !== "string" ||
    typeof record.lastName !== "string" ||
    typeof record.isAdmin !== "boolean"
  ) {
    throw new Error("Invalid admin user shape");
  }

  return {
    id: record.id,
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
    isAdmin: record.isAdmin,
  };
}

export function readPaginatedUsers(body: unknown): PaginatedUsersBody {
  if (typeof body !== "object" || body == null) {
    throw new Error("Expected paginated users object");
  }

  const record = body as Record<string, unknown>;
  const data = record.data;
  const meta = record.meta;

  if (!Array.isArray(data) || typeof meta !== "object" || meta == null) {
    throw new Error("Invalid paginated users shape");
  }

  const metaRecord = meta as Record<string, unknown>;
  if (
    typeof metaRecord.page !== "number" ||
    typeof metaRecord.limit !== "number" ||
    typeof metaRecord.total !== "number" ||
    typeof metaRecord.totalPages !== "number"
  ) {
    throw new Error("Invalid pagination meta shape");
  }

  return {
    data: data.map(readAdminUser),
    meta: {
      page: metaRecord.page,
      limit: metaRecord.limit,
      total: metaRecord.total,
      totalPages: metaRecord.totalPages,
    },
  };
}

export async function createAdminUser(
  prisma: PrismaService,
  params: CreateAdminUserParams,
) {
  return prisma.user.create({
    data: {
      email: params.email,
      passwordHash: await argon2.hash(params.password),
      firstName: params.firstName,
      lastName: params.lastName,
      isAdmin: true,
    },
  });
}
