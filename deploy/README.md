# Деплой Tarih API (Production)

Инструкция по сборке, запуску в Docker Compose и настройке Nginx Reverse Proxy для бэкенда `tarih-api` (NestJS 11 + Prisma 7 + PostgreSQL 16 + MinIO).

---

## 1. Архитектура и структура

```text
├── Dockerfile                  # Многоэтапная сборка (Node.js 22 Alpine, non-root user)
├── .dockerignore               # Исключение лишних файлов из контекста сборки
├── docker-entrypoint.sh        # Автоматическое применение миграций (prisma migrate deploy)
├── docker-compose.prod.yml     # Продакшн-конфигурация сервисов (api, postgres, minio, minio-init)
└── deploy/
    ├── README.md               # Данная инструкция
    └── nginx/
        └── api.conf            # Конфигурация Nginx Reverse Proxy
```

---

## 2. Переменные окружения (.env)

Перед первым запуском убедитесь, что на сервере создан файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Обязательно настройте:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — данные доступа к БД.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — криптографически стойкие секреты.
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — учетные данные хранилища MinIO.
- `CORS_ORIGIN` — адрес фронтенда (например, `https://tarih.kz`).
- `TELEGRAM_*` — параметры Telegram-бота и менеджера (если используются).

> **Примечание:** Внутри `docker-compose.prod.yml` сервис `api` автоматически соединяется с `postgres` и `minio` по внутренней сети `tarih-network`. Наружу на хост через `127.0.0.1` проксируются:
>
> - `127.0.0.1:8080` — API (проксируется через Nginx)
> - `127.0.0.1:5432` — PostgreSQL (доступен только локально на сервере)
> - `127.0.0.1:9000` / `9001` — MinIO API и Web Console

---

## 3. Запуск и управление через Docker Compose

### Сборка и запуск сервисов:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

или через npm-скрипт:

```bash
npm run prod:up
```

### Просмотр логов:

```bash
# Логи бэкенда API
docker compose -f docker-compose.prod.yml logs -f api

# Все логи
docker compose -f docker-compose.prod.yml logs -f
```

### Проверка статуса контейнеров:

```bash
docker compose -f docker-compose.prod.yml ps
```

### Остановка сервисов:

```bash
docker compose -f docker-compose.prod.yml down
```

### Выполнение Prisma-миграций вручную (при необходимости):

Миграции применяются автоматически при старте контейнера через `docker-entrypoint.sh`. Если требуется накатить их вручную:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

---

## 4. Настройка Nginx на сервере

### Шаг 1: Копирование конфигурации

```bash
sudo cp deploy/nginx/api.conf /etc/nginx/sites-available/api.conf
```

### Шаг 2: Указание доменного имени

Откройте конфигурационный файл и укажите поддомен вашего API (например, `api.tarih.kz`):

```bash
sudo nano /etc/nginx/sites-available/api.conf
```

### Шаг 3: Активация виртуального хоста

```bash
sudo ln -s /etc/nginx/sites-available/api.conf /etc/nginx/sites-enabled/
```

### Шаг 4: Проверка синтаксиса и перезапуск Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Выпуск SSL (HTTPS) с Let's Encrypt Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.tarih.kz
```

Certbot автоматически настроит HTTPS-сертификат и редирект с HTTP на HTTPS.
