import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { apiPath } from "./app";

export type AuthBody = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
  };
  accessToken: string;
  refreshToken: string;
};

export type ProfileBody = {
  email: string;
  firstName: string;
  lastName: string;
};

export function readAuthBody(body: unknown): AuthBody {
  if (typeof body !== "object" || body == null) {
    throw new Error("Expected auth response object");
  }

  const record = body as Record<string, unknown>;
  const user = record.user;
  if (typeof user !== "object" || user == null) {
    throw new Error("Expected user in auth response");
  }

  const userRecord = user as Record<string, unknown>;
  if (
    typeof record.accessToken !== "string" ||
    typeof record.refreshToken !== "string" ||
    typeof userRecord.email !== "string" ||
    typeof userRecord.id !== "string" ||
    typeof userRecord.firstName !== "string" ||
    typeof userRecord.lastName !== "string" ||
    typeof userRecord.isAdmin !== "boolean"
  ) {
    throw new Error("Invalid auth response shape");
  }

  return {
    user: {
      id: userRecord.id,
      email: userRecord.email,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      isAdmin: userRecord.isAdmin,
    },
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
  };
}

export function readProfile(body: unknown): ProfileBody {
  if (typeof body !== "object" || body == null) {
    throw new Error("Expected profile object");
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.email !== "string" ||
    typeof record.firstName !== "string" ||
    typeof record.lastName !== "string"
  ) {
    throw new Error("Expected profile fields");
  }
  return {
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
  };
}

type SignUpParams = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export async function signUp(
  app: INestApplication<App>,
  params: SignUpParams,
): Promise<AuthBody> {
  const response = await request(app.getHttpServer())
    .post(apiPath("/auth/sign-up"))
    .send(params)
    .expect(201);

  return readAuthBody(response.body);
}

export async function signIn(
  app: INestApplication<App>,
  params: Pick<SignUpParams, "email" | "password">,
): Promise<AuthBody> {
  const response = await request(app.getHttpServer())
    .post(apiPath("/auth/sign-in"))
    .send(params)
    .expect(200);

  return readAuthBody(response.body);
}
