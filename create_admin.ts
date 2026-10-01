import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";
import * as argon2 from "argon2";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const hashedPassword = await argon2.hash("admin123456");
  await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: { passwordHash: hashedPassword, isAdmin: true },
    create: {
      email: "admin@gmail.com",
      passwordHash: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      isAdmin: true,
    },
  });
  console.log("Admin created with password: admin123456");

  // Re-run the part of the seed that enrolls admin in all courses
  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@gmail.com" },
  });
  if (adminUser) {
    const courses = await prisma.course.findMany({ select: { id: true } });
    for (const course of courses) {
      await prisma.courseEnrollment.upsert({
        where: {
          userId_courseId: {
            userId: adminUser.id,
            courseId: course.id,
          },
        },
        create: { userId: adminUser.id, courseId: course.id },
        update: {},
      });
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
