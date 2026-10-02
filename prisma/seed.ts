import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import * as Minio from "minio";
import {
  CourseStatus,
  LessonMaterialType,
  PrismaClient,
  QuestionType,
} from "../src/generated/prisma/client";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "zharbol.rakhmanoff@mail.ru")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "zharbol.rakhmanoff1991";
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME ?? "Zharbol";
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME ?? "Rakhmanov";

const VIDEO_PATH =
  process.env.SEED_VIDEO_PATH ??
  `${process.env.HOME}/Downloads/Big_Buck_Bunny_1080_10s_5MB.mp4`;
const PDF_PATH =
  process.env.SEED_PDF_PATH ??
  `${process.env.HOME}/Downloads/Rakhmanov-Alisher-Frontend.pdf`;

const VIDEO_OBJECT_KEY = "seed/shared/video/Big_Buck_Bunny_1080_10s_5MB.mp4";
const PDF_OBJECT_KEY = "seed/shared/materials/Rakhmanov-Alisher-Frontend.pdf";
const VIDEO_DURATION_SECONDS = 10;

type SeedCourse = {
  title: string;
  slug: string;
  description: string;
  lessons: string[];
};

const courses: SeedCourse[] = [
  {
    title: "Ежелгі Қазақстан",
    slug: "ancient-kazakhstan",
    description:
      "Қазақстан аумағындағы алғашқы өркениеттер, скифтер мен сақтар тарихы.",
    lessons: [
      "Ежелгі тарихқа кіріспе",
      "Скифтер мәдениеті",
      "Андрон мәдениеті",
    ],
  },
  {
    title: "Ұлы Жібек жолы",
    slug: "silk-road-history",
    description:
      "Сауда жолдары, оазис қалалары және Шығыс пен Батыс арасындағы мәдени байланыс.",
    lessons: [
      "Жібек жолының мәні",
      "Жол бойындағы көне қалалар",
      "Ұлы Жібек жолының мұрасы",
    ],
  },
  {
    title: "Қазақ хандығы",
    slug: "kazakh-khanate",
    description:
      "Қазақ хандығының құрылуы, жүздердің бірігуі және саяси тарихы.",
    lessons: [
      "Хандықтың құрылуы",
      "Үш жүздің тарихы",
      "Хандықтағы ішкі үдерістер",
    ],
  },
  {
    title: "Қазақстан Ресей империясының құрамында",
    slug: "kazakhstan-russian-empire",
    description:
      "Қосылу кезеңі, XIX ғасырдағы әкімшілік реформалар мен әлеуметтік өзгерістер.",
    lessons: [
      "Ресей құрамына қосылу",
      "XIX ғасырдағы реформалар",
      "Ұлт-азаттық көтерілістер",
    ],
  },
  {
    title: "Кеңестік кезеңдегі Қазақстан",
    slug: "soviet-kazakhstan",
    description:
      "Индустрияландыру, ұжымдастыру және кеңестік республиканың қалыптасуы.",
    lessons: [
      "Қазақ АКСР кезеңі",
      "Индустрияландыру жылдары",
      "Кеңес дәуірінің мәдениеті",
    ],
  },
  {
    title: "Тәуелсіз Қазақстан",
    slug: "kazakhstan-independence",
    description:
      "Егемендікке қол жеткізу, Конституцияның қабылдануы және заманауи мемлекеттің құрылуы.",
    lessons: [
      "1991 жыл және Тәуелсіздік",
      "Ата Заңның қабылдануы",
      "Тәуелсіздіктің алғашқы жылдары",
    ],
  },
  {
    title: "Орталық Азиядағы Екінші дүниежүзілік соғыс",
    slug: "ww2-central-asia",
    description:
      "Тылдағы еңбек, эвакуация, жеңіске қосқан үлес және соғыстан кейінгі қайта құру.",
    lessons: [
      "Майданға жұмылдыру",
      "Тылдағы жанқиярлық еңбек",
      "Соғыстан кейінгі жылдар",
    ],
  },
  {
    title: "Көшпелілер мәдениеті",
    slug: "nomadic-culture",
    description:
      "Көшпелі қоғамның тұрмыс-тіршілігі, салт-дәстүрлері, экономикасы мен әлеуметтік құрылымы.",
    lessons: [
      "Көшпелі шаруашылық",
      "Ұлттық салт-дәстүрлер",
      "Киіз үй және көшпелі тұрмыс",
    ],
  },
  {
    title: "Ортағасырлық Орталық Азия",
    slug: "medieval-central-asia",
    description:
      "Аймақ аумағындағы ортағасырлық мемлекеттер және мәдени-ғылыми орталықтар.",
    lessons: [
      "Қарахан мемлекеті",
      "Ғылым мен ағарту ісі",
      "Ортағасырлық сәулет өнері",
    ],
  },
  {
    title: "Заманауи Қазақстан",
    slug: "modern-kazakhstan",
    description: "XXI ғасырдағы Қазақстанның саясаты, экономикасы мен қоғамы.",
    lessons: [
      "Мемлекеттік құрылым",
      "Экономикалық даму",
      "Бүгінгі күндегі қоғам",
    ],
  },
] as const;

function buildLessonTest(lessonTitle: string, courseTitle: string) {
  return {
    title: `«${lessonTitle}» тақырыбы бойынша тест`,
    description: `«${courseTitle}» курсының «${lessonTitle}» сабағы бойынша білімді тексеру тесті.`,
    passingScore: 70,
    timeLimit: 600,
    attemptsLimit: 3,
    questions: {
      create: [
        {
          text: `«${lessonTitle}» сабағы қай тақырыпқа арналған?`,
          type: QuestionType.SINGLE_CHOICE,
          points: 1,
          order: 0,
          options: {
            create: [
              {
                text: `${courseTitle} («дұрыс жауап»)`,
                isCorrect: true,
                order: 0,
              },
              {
                text: "Еуропаның заманауи аспаздығы",
                isCorrect: false,
                order: 1,
              },
              {
                text: "NASA ғарыш бағдарламасы",
                isCorrect: false,
                order: 2,
              },
            ],
          },
        },
        {
          text: `«${lessonTitle}» сабағына қатысты қандай тұжырымдар дұрыс?`,
          type: QuestionType.MULTIPLE_CHOICE,
          points: 2,
          order: 1,
          options: {
            create: [
              {
                text: "Сабақ оқу бағдарламасының құрамына кіреді («дұрыс жауап»)",
                isCorrect: true,
                order: 0,
              },
              {
                text: "Сабақ материалдары бейнежазбаны көрген соң қолжетімді («дұрыс жауап»)",
                isCorrect: true,
                order: 1,
              },
              {
                text: "Сабақ курс тақырыбына мүлдем байланысты емес",
                isCorrect: false,
                order: 2,
              },
              {
                text: "Курсты аяқтау үшін бұл тестті тапсыру қажет емес",
                isCorrect: false,
                order: 3,
              },
            ],
          },
        },
        {
          text: `«${lessonTitle}» сабағы «${courseTitle}» курсына жатады.`,
          type: QuestionType.TRUE_FALSE,
          points: 1,
          order: 2,
          options: {
            create: [
              { text: "Ақиқат («дұрыс жауап»)", isCorrect: true, order: 0 },
              { text: "Жалған", isCorrect: false, order: 1 },
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

async function seedAdmin(prisma: PrismaClient) {
  console.log(`==> Seeding admin user: ${ADMIN_EMAIL}...`);
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      isAdmin: true,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      isAdmin: true,
    },
  });

  console.log(
    `==> Admin user ensured: ${admin.email} (isAdmin: ${admin.isAdmin}, id: ${admin.id})`,
  );
  return admin;
}

const defaultPlans = [
  {
    slug: "standard-1m",
    titleRu: "Базовый",
    titleKz: "Базалық",
    description: "Толық курс пен барлық сабақтарға 1 айға қолжетімділік",
    durationMonths: 1,
    priceKzt: 4990,
    order: 0,
    isActive: true,
  },
  {
    slug: "standard-3m",
    titleRu: "Стандарт",
    titleKz: "Стандартты",
    description:
      "Барлық материалдар, тесттер және аналитикаға 3 айға қолжетімділік",
    durationMonths: 3,
    priceKzt: 12990,
    order: 1,
    isActive: true,
  },
  {
    slug: "premium-1y",
    titleRu: "Премиум",
    titleKz: "Премиум",
    description: "Платформаға шектеусіз 1 жылдық толық қолжетімділік",
    durationMonths: 12,
    priceKzt: 39990,
    order: 2,
    isActive: true,
  },
];

async function seedSubscriptionPlans(prisma: PrismaClient) {
  console.log("==> Seeding subscription plans...");
  for (const plan of defaultPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: {
        titleRu: plan.titleRu,
        titleKz: plan.titleKz,
        description: plan.description,
        durationMonths: plan.durationMonths,
        priceKzt: plan.priceKzt,
        order: plan.order,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }
  console.log(`==> Seeded ${defaultPlans.length} subscription plans.`);
}

async function seedCourses(
  prisma: PrismaClient,
  adminUser?: { id: string; email: string },
) {
  const hasVideo = existsSync(VIDEO_PATH);
  const hasPdf = existsSync(PDF_PATH);
  let uploadedVideoKey: string | null = null;
  let uploadedPdfKey: string | null = null;
  let pdfSize = 0;

  if (hasVideo && hasPdf) {
    try {
      const bucket = process.env.MINIO_BUCKET ?? "tarih-storage";
      const minioClient = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
        port: Number(process.env.MINIO_PORT ?? "9000"),
        useSSL: process.env.MINIO_USE_SSL === "true",
        accessKey: process.env.MINIO_ROOT_USER ?? "minioadmin",
        secretKey: process.env.MINIO_ROOT_PASSWORD ?? "minioadmin",
      });

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
      uploadedVideoKey = VIDEO_OBJECT_KEY;
      uploadedPdfKey = PDF_OBJECT_KEY;
      pdfSize = statSync(PDF_PATH).size;
    } catch (err) {
      console.warn("==> MinIO demo media upload skipped:", err);
    }
  } else {
    console.log(
      "==> Mock media files not found on disk, creating courses without mock video/pdf files.",
    );
  }

  await prisma.course.deleteMany({
    where: { slug: { in: courses.map((course) => course.slug) } },
  });

  for (let courseIndex = 0; courseIndex < courses.length; courseIndex++) {
    const courseData = courses[courseIndex];
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
            description: `«${courseData.title}» курсының «${lessonTitle}» сабағы.`,
            videoObjectKey: uploadedVideoKey,
            videoDuration: uploadedVideoKey ? VIDEO_DURATION_SECONDS : null,
            order: lessonIndex,
            materials: uploadedPdfKey
              ? {
                  create: [
                    {
                      title: "Презентация",
                      type: LessonMaterialType.PRESENTATION,
                      fileObjectKey: uploadedPdfKey,
                      fileName: "Rakhmanov-Alisher-Frontend.pdf",
                      fileSize: pdfSize,
                      order: 0,
                    },
                  ],
                }
              : undefined,
            test: {
              create: buildLessonTest(lessonTitle, courseData.title),
            },
          })),
        },
      },
      include: {
        lessons: {
          include: {
            materials: true,
            test: { include: { questions: true } },
          },
        },
      },
    });

    const testsCount = course.lessons.filter((lesson) => lesson.test).length;
    console.log(
      `Created course "${course.title}" with ${course.lessons.length} lessons and ${testsCount} tests`,
    );
  }

  console.log(
    "Seed completed: 10 courses with lessons, tests and optional materials.",
  );

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
      `Re-enrolled ${adminUser.email} in ${seededCourses.length} courses`,
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const adminUser = await seedAdmin(prisma);
    await seedSubscriptionPlans(prisma);

    if (process.env.SEED_ONLY_ADMIN === "true") {
      console.log("==> SEED_ONLY_ADMIN=true, skipping course seed.");
      return;
    }

    await seedCourses(prisma, adminUser);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
