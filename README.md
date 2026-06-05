# Peinture — Multi-User AI Image Generator

A dark-themed AI image generator (React + TypeScript) converted into a **multi-user, login-required** application with a **Node + TypeScript backend** and **MySQL**. Per-user settings live in the database (secrets encrypted at rest), an **admin** can create users and assign their API keys, and all generation is **proxied through the backend** so provider tokens never reach the browser.

![App Screenshot](https://cdn.u14.app/upload/WX20251209-170748@2x.png)

> 📖 **End-user manual (中文):** see [`docs/使用说明.md`](docs/使用说明.md) for a full, screen-by-screen guide (login, admin panel, configuring API keys, custom/relay providers, every page feature).

## ✨ What it does

- **Accounts & roles** — everyone must log in; `user` vs `admin`. Sessions are httpOnly cookies stored in MySQL (revocable). No anonymous mode.
- **Admin panel** — create / disable / delete users, change roles, reset passwords, and **assign each user their provider API keys** (encrypted, never shown back).
- **Server-sourced config** — every user's preferences live in MySQL and sync automatically; nothing sensitive is kept in the browser.
- **Text-to-image / editing / prompt optimization** via **HuggingFace** (works out of the box; a HuggingFace token raises the quota).
- **Custom / relay providers** — connect any platform or relay API and pick its format: **OpenAI**, **Claude** (text only), or **Gemini**. Configurable globally (admin), per-user (admin), or self-service (each user for themselves). Their models appear automatically in the model picker.
- **Cloud storage** — admin-managed S3-compatible or WebDAV sync shared by all users; credentials stay encrypted server-side.

### Feature status

| Capability | Status |
|---|---|
| Login / roles / admin user management | ✅ |
| Per-user config in MySQL (encrypted secrets) | ✅ |
| Text-to-image, image editing, prompt optimization (HuggingFace) | ✅ |
| Custom/relay providers — OpenAI/Gemini (image+text), Claude (text) | ✅ |
| Built-in Gitee / ModelScope / A4F direct integrations | ⏳ planned (use a custom OpenAI/Gemini provider meanwhile) |
| Live (image→video) and HD upscale | ⏳ planned |

## 🏗 Architecture

```
Browser (SPA, holds only an httpOnly session cookie)
   │  fetch(credentials:'include')
   ▼
nginx (web container) ── static SPA  +  reverse-proxy /api ──▶ Node API (api container)
                                                                 ├─ /api/auth       login / logout / me
                                                                 ├─ /api/config     current user's prefs
                                                                 ├─ /api/storage    admin-managed storage proxy
                                                                 ├─ /api/providers  self custom providers
                                                                 ├─ /api/admin/*    user & provider management
                                                                 └─ /api/v1/*       generation proxy
                                                                        │ uses the user's (decrypted) keys
                                                                        ▼
                                                                 MySQL (users / sessions / user_settings / custom_providers)
```

- Frontend: React 19 + Vite + Zustand + Tailwind (repo root).
- Backend: Express + TypeScript + `mysql2`, numbered SQL migrations, bcrypt password hashing, AES-256-GCM secret encryption (`server/`).

## 🚀 Deployment

### Option A — all-in-one (bundled MySQL)

```bash
cp .env.example .env          # set APP_ENCRYPTION_KEY, ADMIN_PASSWORD, DB_PASSWORD…
docker compose up -d --build  # starts db + api + web
# open http://localhost:${WEB_PORT:-80}, log in as the seeded admin
```

### Option B — use an existing MySQL container

`docker-compose.external-mysql.yml` runs only `api` + `web` and joins an existing MySQL's Docker network (see the file header). Create the database + a user first, fill `.env`, then:

```bash
docker compose -f docker-compose.external-mysql.yml up -d --build
```

The API auto-runs migrations and seeds the first admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD` when the users table is empty.

### Key environment variables (`.env`)

| Var | Purpose |
|---|---|
| `APP_ENCRYPTION_KEY` | AES key encrypting stored provider tokens. **Keep it stable** — losing it makes saved keys unreadable. `openssl rand -hex 32` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | First-run admin bootstrap |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `SESSION_TTL_HOURS` | Session lifetime (default 168) |
| `COOKIE_SECURE` | `true` only when served over HTTPS |
| `WEB_PORT` | Host port for the web container |

## 🧑‍💻 Local development

```bash
# 1) a MySQL reachable on 127.0.0.1:3306 (e.g. docker run -p 3306:3306 ... mysql:8)
# 2) backend
cd server && cp .env.example .env && npm install && npm run dev   # :3001, auto-migrates + seeds admin
# 3) frontend (separate shell, repo root)
npm install && npm run dev   # :3000, proxies /api → :3001
```

## ✅ Tests

```bash
npm test                 # frontend (vitest)
cd server && npm test    # backend (vitest + supertest)
```

## 📦 Tech stack

React 19 · Vite · Zustand · Tailwind · Express · TypeScript · MySQL (`mysql2`) · bcryptjs · zod · vitest.
