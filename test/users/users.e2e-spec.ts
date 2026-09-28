import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { PrismaService } from "../../src/prisma/prisma.service";
import { apiPath, createTestApp } from "../helpers/app";
import { readProfile, signIn, signUp } from "../helpers/auth";

describe("Users (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = `users-${Date.now()}@example.com`;
  const password = "password1";
  const firstName = "Alisher";
  const lastName = "Test";

  let accessToken = "";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const auth = await signUp(app, { email, password, firstName, lastName });
    accessToken = auth.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("updates the authenticated profile", async () => {
    const updated = await request(app.getHttpServer())
      .patch(apiPath("/users/me"))
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ firstName: "New", lastName: "Name" })
      .expect(200);

    expect(readProfile(updated.body)).toMatchObject({
      email,
      firstName: "New",
      lastName: "Name",
    });
  });

  it("rejects profile update without a bearer token", async () => {
    await request(app.getHttpServer())
      .patch(apiPath("/users/me"))
      .send({ firstName: "New", lastName: "Name" })
      .expect(401);
  });

  it("changes the authenticated password", async () => {
    await request(app.getHttpServer())
      .patch(apiPath("/users/me/password"))
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword: "password2" })
      .expect(204);

    const auth = await signIn(app, { email, password: "password2" });
    accessToken = auth.accessToken;
  });

  it("rejects password change with the wrong current password", async () => {
    await request(app.getHttpServer())
      .patch(apiPath("/users/me/password"))
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "wrong-password", newPassword: "password3" })
      .expect(401);
  });

  it("returns 400 when password change payload is invalid", async () => {
    await request(app.getHttpServer())
      .patch(apiPath("/users/me/password"))
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "password2", newPassword: "short" })
      .expect(400);
  });
});
