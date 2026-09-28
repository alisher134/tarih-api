import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { PrismaService } from "../../src/prisma/prisma.service";
import {
  createAdminUser,
  readAdminUser,
  readPaginatedUsers,
} from "../helpers/admin";
import { apiPath, createTestApp } from "../helpers/app";
import { signIn } from "../helpers/auth";

describe("Admin users (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const adminEmail = `admin-${Date.now()}@example.com`;
  const userEmail = `managed-${Date.now()}@example.com`;
  const password = "password1";
  const firstName = "Admin";
  const lastName = "User";

  let adminAccessToken = "";
  let managedUserId = "";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    await createAdminUser(prisma, {
      email: adminEmail,
      password,
      firstName,
      lastName,
    });

    const auth = await signIn(app, { email: adminEmail, password });
    adminAccessToken = auth.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, userEmail] } },
    });
    await app.close();
  });

  it("rejects admin routes for non-admin users", async () => {
    const regularUserEmail = `regular-${Date.now()}@example.com`;

    await request(app.getHttpServer())
      .post(apiPath("/auth/sign-up"))
      .send({
        email: regularUserEmail,
        password,
        firstName: "Regular",
        lastName: "User",
      })
      .expect(201);

    const regularAuth = await signIn(app, {
      email: regularUserEmail,
      password,
    });

    await request(app.getHttpServer())
      .get(apiPath("/admin/users"))
      .set("Authorization", `Bearer ${regularAuth.accessToken}`)
      .expect(403);

    await prisma.user.delete({ where: { email: regularUserEmail } });
  });

  it("lists users for admin", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath("/admin/users"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    const list = readPaginatedUsers(response.body);
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.meta.total).toBeGreaterThan(0);
  });

  it("creates a user", async () => {
    const response = await request(app.getHttpServer())
      .post(apiPath("/admin/users"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        email: userEmail,
        password,
        firstName: "Managed",
        lastName: "User",
      })
      .expect(201);

    const createdUser = readAdminUser(response.body);
    expect(createdUser.email).toBe(userEmail);
    expect(createdUser.isAdmin).toBe(false);
    managedUserId = createdUser.id;
  });

  it("returns a user by id", async () => {
    const response = await request(app.getHttpServer())
      .get(apiPath(`/admin/users/${managedUserId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(readAdminUser(response.body).email).toBe(userEmail);
  });

  it("updates a user", async () => {
    const response = await request(app.getHttpServer())
      .patch(apiPath(`/admin/users/${managedUserId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ firstName: "Updated", lastName: "Name" })
      .expect(200);

    expect(readAdminUser(response.body)).toMatchObject({
      email: userEmail,
      firstName: "Updated",
      lastName: "Name",
    });
  });

  it("resets a user password", async () => {
    await request(app.getHttpServer())
      .patch(apiPath(`/admin/users/${managedUserId}/password`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ newPassword: "password2" })
      .expect(204);

    await signIn(app, { email: userEmail, password: "password2" });
  });

  it("deletes a user", async () => {
    await request(app.getHttpServer())
      .delete(apiPath(`/admin/users/${managedUserId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(apiPath(`/admin/users/${managedUserId}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(404);
  });

  it("rejects deleting own admin account", async () => {
    const meResponse = await request(app.getHttpServer())
      .get(apiPath("/auth/me"))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(200);

    const me = readAdminUser(meResponse.body);

    await request(app.getHttpServer())
      .delete(apiPath(`/admin/users/${me.id}`))
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .expect(400);
  });
});
