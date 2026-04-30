# Team Task Manager

Full-stack project management app with authentication, project membership, task assignment, status tracking, dashboards, and Admin/Member role-based access.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Express, Prisma
- Database: PostgreSQL SQL database, suitable for Aiven/Railway via `DATABASE_URL`
- Auth: JWT + bcrypt

## Local Setup

```bash
npm install
cp server/.env.example server/.env
npm run prisma:migrate --workspace server
npm run dev
```

Client runs on `http://localhost:5173`.
API runs on `http://localhost:5000`.

## Railway Deployment

1. Create a PostgreSQL database on Railway or Aiven.
2. Add these Railway environment variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require"
JWT_SECRET="replace-with-a-long-random-secret"
CLIENT_ORIGIN="https://your-frontend-domain"
NODE_ENV="production"
```

3. Deploy from this repository. Railway will run:

```bash
npm install
npm run build
npm start
```

4. Run Prisma migrations once in Railway shell:

```bash
npm run prisma:migrate --workspace server
```

The Express server serves the built React app from `client/dist` in production.
