import "dotenv/config";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import * as Minio from "minio";
import {
  CourseStatus,
  LessonMaterialType,
  PrismaClient,
  QuestionType,
} from "../src/generated/prisma/client";

const VIDEO_PATH =
  process.env.SEED_VIDEO_PATH ??
  `${process.env.HOME}/Downloads/file_example_MP4_1920_18MG.mp4`;
const PDF_PATH =
  process.env.SEED_PDF_PATH ??
  `${process.env.HOME}/Downloads/Рахманов Алишер Алматбекович.pdf`;

const VIDEO_OBJECT_KEY = "seed/shared/video/file_example_MP4_1920_18MG.mp4";
const PDF_OBJECT_KEY =
  "seed/shared/materials/rahmanov-alisher-almatbekovich.pdf";
const VIDEO_DURATION_SECONDS = 30;

const courses = [
  {
    title: "Древний Казахстан",
    slug: "ancient-kazakhstan",
    description:
      "Первые цивилизации, скифы и саки на территории современного Казахстана.",
    lessons: [
      "Введение в древнюю историю",
      "Скифская культура",
      "Андроновская культура",
    ],
  },
  {
    title: "Великий шёлковый путь",
    slug: "silk-road-history",
    description:
      "Торговые маршруты, города-оазисы и культурный обмен между Востоком и Западом.",
    lessons: ["Что такое шёлковый путь", "Города на маршруте", "Наследие пути"],
  },
  {
    title: "Казахское ханство",
    slug: "kazakh-khanate",
    description:
      "Формирование казахского ханства, объединение жузов и политическая история.",
    lessons: ["Образование ханства", "Три жуза", "Внутренние процессы"],
  },
  {
    title: "Казахстан в составе Российской империи",
    slug: "kazakhstan-russian-empire",
    description:
      "Присоединение, административные реформы и социальные изменения XIX века.",
    lessons: ["Присоединение", "Реформы XIX века", "Восстания и протесты"],
  },
  {
    title: "Советский период",
    slug: "soviet-kazakhstan",
    description:
      "Индустриализация, коллективизация и формирование советской республики.",
    lessons: ["Казахская АССР", "Индустриализация", "Культура советского времени"],
  },
  {
    title: "Независимость Казахстана",
    slug: "kazakhstan-independence",
    description:
      "Путь к суверенитету, принятие Конституции и становление современного государства.",
    lessons: ["1991 год", "Конституция", "Первые годы независимости"],
  },
  {
    title: "Вторая мировая война в Центральной Азии",
    slug: "ww2-central-asia",
    description:
      "Тыл, эвакуация, вклад региона в победу и послевоенное восстановление.",
    lessons: ["Мобилизация", "Тыловой вклад", "После войны"],
  },
  {
    title: "Кочевая культура",
    slug: "nomadic-culture",
    description:
      "Быт, традиции, экономика и социальная организация кочевого общества.",
    lessons: ["Кочевое хозяйство", "Байга и традиции", "Юрта и быт"],
  },
  {
    title: "Средневековая Центральная Азия",
    slug: "medieval-central-asia",
    description:
      "Государства и культурные центры Средневековья на территории региона.",
    lessons: ["Караханидский период", "Наука и образование", "Архитектура"],
  },
  {
    title: "Современный Казахстан",
    slug: "modern-kazakhstan",
    description:
      "Политика, экономика и общество Казахстана в XXI веке.",
    lessons: ["Государственное устройство", "Экономика", "Общество сегодня"],
  },
] as const;

function buildLessonTest(lessonTitle: string, courseTitle: string) {
  return {
    title: `Тест: ${lessonTitle}`,
    description: `Проверка знаний по уроку «${lessonTitle}» (${courseTitle}).`,
    passingScore: 70,
    timeLimit: 600,
    attemptsLimit: 3,
    questions: {
      create: [
        {
          text: `Какой теме посвящён урок «${lessonTitle}»?`,
          type: QuestionType.SINGLE_CHOICE,
          points: 1,
          order: 0,
          options: {
            create: [
              {
                text: courseTitle,
                isCorrect: true,
                order: 0,
              },
              {
                text: "Современная кулинария Европы",
                isCorrect: false,
                order: 1,
              },
              {
                text: "Космическая программа NASA",
                isCorrect: false,
                order: 2,
              },
            ],
          },
        },
        {
          text: `Какие утверждения верны для урока «${lessonTitle}»?`,
          type: QuestionType.MULTIPLE_CHOICE,
          points: 2,
          order: 1,
          options: {
            create: [
              {
                text: "Урок входит в программу курса",
                isCorrect: true,
                order: 0,
              },
              {
                text: "Материалы урока доступны после просмотра видео",
                isCorrect: true,
                order: 1,
              },
              {
                text: "Урок не связан с темой курса",
                isCorrect: false,
                order: 2,
              },
              {
                text: "Тест необязателен для завершения курса",
                isCorrect: false,
                order: 3,
              },
            ],
          },
        },
        {
          text: `Урок «${lessonTitle}» относится к курсу «${courseTitle}».`,
          type: QuestionType.TRUE_FALSE,
          points: 1,
          order: 2,
          options: {
            create: [
              { text: "Верно", isCorrect: true, order: 0 },
              { text: "Неверно", isCorrect: false, order: 1 },
            ],
          },
        },
      ],
    },
  };
}

async function uploadFile(
  client: Minio.Client,
  bucket: string,
  objectKey: string,
  filePath: string,
  contentType: string,
) {
  const fileStat = statSync(filePath);
  await client.putObject(
    bucket,
    objectKey,
    createReadStream(filePath),
    fileStat.size,
    { "Content-Type": contentType },
  );
  console.log(`Uploaded ${basename(filePath)} -> ${objectKey}`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const bucket = process.env.MINIO_BUCKET ?? "tarih-storage";
  const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? "9000"),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ROOT_USER ?? "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? "minioadmin",
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const bucketExists = await minioClient.bucketExists(bucket);
    if (!bucketExists) {
      await minioClient.makeBucket(bucket);
      console.log(`Created bucket: ${bucket}`);
    }

    await uploadFile(
      minioClient,
      bucket,
      VIDEO_OBJECT_KEY,
      VIDEO_PATH,
      "video/mp4",
    );
    await uploadFile(
      minioClient,
      bucket,
      PDF_OBJECT_KEY,
      PDF_PATH,
      "application/pdf",
    );

    const pdfSize = statSync(PDF_PATH).size;

    await prisma.course.deleteMany({
      where: { slug: { in: courses.map((course) => course.slug) } },
    });

    for (const [courseIndex, courseData] of courses.entries()) {
      const course = await prisma.course.create({
        data: {
          title: courseData.title,
          slug: courseData.slug,
          description: courseData.description,
          status: CourseStatus.PUBLISHED,
          order: courseIndex,
          lessons: {
            create: courseData.lessons.map((lessonTitle, lessonIndex) => ({
              title: lessonTitle,
              description: `Урок «${lessonTitle}» курса «${courseData.title}».`,
              videoObjectKey: VIDEO_OBJECT_KEY,
              videoDuration: VIDEO_DURATION_SECONDS,
              order: lessonIndex,
              materials: {
                create: [
                  {
                    title: "Конспект к уроку",
                    type: LessonMaterialType.PDF,
                    fileObjectKey: PDF_OBJECT_KEY,
                    fileName: "Рахманов Алишер Алматбекович.pdf",
                    fileSize: pdfSize,
                    order: 0,
                  },
                ],
              },
              test: {
                create: buildLessonTest(lessonTitle, courseData.title),
              },
            })),
          },
        },
        include: {
          lessons: {
            include: { materials: true, test: { include: { questions: true } } },
          },
        },
      });

      const testsCount = course.lessons.filter((lesson) => lesson.test).length;
      console.log(
        `Created course "${course.title}" with ${course.lessons.length} lessons and ${testsCount} tests`,
      );
    }

    console.log(
      "Seed completed: 10 courses with lessons, videos, materials and tests.",
    );

    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@gmail.com" },
    });

    if (adminUser) {
      const seededCourses = await prisma.course.findMany({
        where: { slug: { in: courses.map((course) => course.slug) } },
        select: { id: true },
      });

      for (const course of seededCourses) {
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

      console.log(
        `Re-enrolled admin@gmail.com in ${seededCourses.length} courses`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
