import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const email = (process.env.ADMIN_EMAIL ?? "zharbol.rakhmanoff@mail.ru")
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "zharbol.rakhmanoff1991";
  const firstName = process.env.ADMIN_FIRST_NAME ?? "Zharbol";
  const lastName = process.env.ADMIN_LAST_NAME ?? "Rakhmanov";

  const hashedPassword = await argon2.hash(password);
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      isAdmin: true,
      firstName,
      lastName,
    },
    create: {
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      isAdmin: true,
    },
  });
  console.log(`Admin user ensured: ${email}`);

  // Re-run the part of the seed that enrolls admin in all courses
  const adminUser = await prisma.user.findUnique({
    where: { email },
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
