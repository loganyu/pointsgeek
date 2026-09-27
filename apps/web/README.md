# Points Geek web

Next.js 15 application for the Points Geek dashboard and extension API.

## Local development

Configure a local PostgreSQL database, then run:

```bash
cp .env.example apps/web/.env
pnpm install
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

## AWS deployment

See [AWS deployment](../../docs/aws-deployment.md) for Aurora, IAM, Amplify,
environment, migration, OAuth, and extension configuration.
