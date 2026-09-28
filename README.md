# tarih-api

NestJS API with JWT authentication, user profiles, and PostgreSQL via Prisma.

## Stack

- NestJS 11
- PostgreSQL 16
- Prisma 7
- JWT access + refresh tokens
- argon2 password hashing

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Start PostgreSQL and MinIO:

```bash
npm run infra:up
```

Or separately:

```bash
npm run db:up
npm run storage:up
```

3. Install dependencies and run migrations:

```bash
npm install
npm run prisma:migrate
```

4. Start the API:

```bash
npm run start:dev
```

The server listens on `PORT` from `.env` (default `8080`).

Swagger UI: `/docs`  
Global API prefix: `/api/v1`

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port for the API |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret for access tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime, e.g. `15m` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime, e.g. `7d` |
| `CORS_ORIGIN` | Allowed frontend origin |
| `MINIO_ENDPOINT` | MinIO host |
| `MINIO_PORT` | MinIO API port |
| `MINIO_USE_SSL` | Use HTTPS for MinIO |
| `MINIO_ROOT_USER` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | MinIO secret key |
| `MINIO_BUCKET` | Private bucket for videos and files |
| `MINIO_PRESIGNED_UPLOAD_TTL_SECONDS` | Presigned upload URL lifetime |
| `MINIO_PRESIGNED_DOWNLOAD_TTL_SECONDS` | Presigned playback/download URL lifetime |
| `UPLOAD_MAX_VIDEO_SIZE_MB` | Max video upload size |
| `UPLOAD_MAX_FILE_SIZE_MB` | Max material upload size |
| `LESSON_COMPLETION_THRESHOLD_PERCENT` | Watch percent required to complete a lesson |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for subscription payments |
| `TELEGRAM_BOT_USERNAME` | Telegram bot username without `@` |
| `TELEGRAM_MANAGER_CHAT_ID` | Telegram chat ID for payment review |
| `TELEGRAM_PAYMENT_CARD_NUMBER` | Card number shown in Telegram checkout |
| `TELEGRAM_PAYMENT_CARD_OWNER` | Card owner shown in Telegram checkout |
| `TELEGRAM_WEBHOOK_URL` | Public webhook URL for Telegram bot |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token for Telegram webhook validation |
| `PAYMENT_ORDER_EXPIRATION_MINUTES` | Order expiration in minutes |
| `TELEGRAM_SESSION_TTL_HOURS` | Telegram session TTL in hours |

## Monetization flow

Web users purchase subscriptions through Telegram only:

1. Sign in on the web app.
2. Call `GET /subscriptions/purchase-link` to receive a deep link such as `https://t.me/your_bot?start=purchase`.
3. Complete payment and upload the receipt in Telegram.
4. After admin confirmation, `GET /subscriptions/me` returns the active subscription.

Telegram-only accounts can set a web password through:

- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/sign-up` | No | Register a user |
| `POST` | `/auth/sign-in` | No | Sign in and receive tokens |
| `POST` | `/auth/refresh` | No | Refresh access token |
| `POST` | `/auth/logout-all` | Bearer | Invalidate all sessions |
| `POST` | `/auth/forgot-password` | No | Request password reset token |
| `POST` | `/auth/reset-password` | No | Set a new password with reset token |
| `GET` | `/auth/me` | Bearer | Get current user profile |
| `PATCH` | `/users/me` | Bearer | Update first and last name |
| `PATCH` | `/users/me/password` | Bearer | Change password |
| `GET` | `/subscription-plans` | No | List active subscription plans |
| `GET` | `/subscriptions/me` | Bearer | Get current and upcoming subscription |
| `GET` | `/subscriptions/purchase-link` | Bearer | Get Telegram purchase deep link |
| `GET` | `/me/learning/continue` | Bearer | Get continue-learning card |
| `GET` | `/courses/:courseId/learning-summary` | Bearer | Get course learning summary |
| `GET` | `/me/analytics/overview` | Bearer | Get personal learning analytics |
| `GET` | `/admin/users` | Admin | List users with pagination and filters |
| `GET` | `/admin/users/:id` | Admin | Get user by id |
| `POST` | `/admin/users` | Admin | Create user |
| `PATCH` | `/admin/users/:id` | Admin | Update user |
| `DELETE` | `/admin/users/:id` | Admin | Delete user |
| `PATCH` | `/admin/users/:id/password` | Admin | Reset user password |
| `POST` | `/admin/uploads/intent` | Admin | Get presigned upload URL |
| `GET/POST/PATCH/DELETE` | `/admin/courses` | Admin | Manage courses |
| `POST/PATCH/DELETE` | `/admin/courses/:courseId/lessons` | Admin | Manage lessons |
| `POST/PATCH/DELETE` | `/admin/lessons/:lessonId/materials` | Admin | Manage lesson materials |
| `POST/PATCH/DELETE` | `/admin/lessons/:lessonId/test` | Admin | Manage lesson tests |
| `POST/PATCH/DELETE` | `/admin/tests/:testId/questions` | Admin | Manage test questions |
| `POST` | `/admin/users/:userId/subscriptions` | Admin | Grant or extend subscription |
| `GET` | `/admin/users/:userId/subscriptions` | Admin | List user subscriptions |
| `DELETE` | `/admin/users/:userId/subscriptions/:subscriptionId` | Admin | Immediately revoke subscription |
| `POST` | `/telegram/webhook` | Telegram secret | Telegram bot webhook |
| `GET` | `/courses` | No | List published courses |
| `GET` | `/courses/:slug` | Optional | Get published course details |
| `GET` | `/courses/my` | Bearer | List all available courses with progress |
| `GET` | `/courses/favorites` | Bearer | List favorite courses |
| `POST/DELETE` | `/courses/:courseId/favorite` | Bearer | Add/remove favorite |
| `GET` | `/lessons/:lessonId/playback-url` | Bearer | Get presigned video URL |
| `GET` | `/lessons/:lessonId/materials` | Bearer | List lesson materials |
| `GET` | `/materials/:materialId/download-url` | Bearer | Get presigned material URL |
| `PATCH/GET` | `/lessons/:lessonId/progress` | Bearer | Update/get lesson progress |
| `GET` | `/lessons/:lessonId/test` | Bearer | Get lesson test without correct answers |
| `GET` | `/tests/:testId` | Bearer | Get test without correct answers |
| `POST` | `/tests/:testId/attempts` | Bearer | Start test attempt |
| `POST` | `/test-attempts/:attemptId/submit` | Bearer | Submit test attempt |

## Client notes

- Access tokens include `tokenVersion`; after `logout-all` or password change, both access and refresh tokens become invalid immediately.
- Presigned playback/download URLs expire after `MINIO_PRESIGNED_DOWNLOAD_TTL_SECONDS`; clients should re-request URLs for long sessions.
- API error responses may include a machine-readable `code` field for frontend localization.
- Lesson completion is computed server-side from watch progress; clients must not send `completed`.
- Tests require the related lesson to be completed first.

## Scripts

```bash
npm run start:dev   # development with watch mode
npm run build       # compile TypeScript
npm run lint        # check lint errors
npm run lint:fix    # auto-fix lint issues
npm test            # unit tests
npm run test:e2e    # end-to-end tests
npm run test:cov    # coverage report
npm run db:up       # start PostgreSQL in Docker
npm run storage:up  # start MinIO in Docker
npm run infra:up    # start PostgreSQL and MinIO
npm run db:down     # stop PostgreSQL
npm run prisma:migrate
npm run prisma:studio
```

## Testing

Unit tests mock Prisma and external services. E2E tests boot the full application and require a running PostgreSQL instance configured in `.env`.

```bash
npm test
npm run test:e2e
```

## Project structure

```text
src/
  admin/         # admin-only user management
  auth/          # sign-up, sign-in, refresh, JWT guard/strategy
  users/         # profile update and password change
  prisma/        # PrismaService wrapper
  generated/     # generated Prisma client (do not edit)
test/
  admin/
    admin-users.e2e-spec.ts
  auth/
    auth.e2e-spec.ts
  users/
    users.e2e-spec.ts
  helpers/
    app.ts
    auth.ts
prisma/
  schema.prisma
  migrations/
```
