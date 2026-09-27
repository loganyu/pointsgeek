# AWS deployment

The web app runs on Amplify Hosting managed SSR with Next.js 15. PostgreSQL
stays local during development and uses Aurora PostgreSQL Serverless v2 through
the RDS Data API in AWS. The database password remains in Secrets Manager; the
application receives only the secret ARN and temporary IAM credentials.

## Environments

Use three isolated databases:

| Environment | App | Database configuration |
| --- | --- | --- |
| Local | `http://localhost:3001` | `DATABASE_URL` in `apps/web/.env` |
| Staging | Amplify `develop` branch | Staging `AURORA_*` values |
| Production | Amplify `main` branch | Production `AURORA_*` values |

Separate staging and production clusters prevent a migration or test run from
touching production. Both AWS clusters can use a zero-ACU minimum and automatic
pause while traffic is low, if the selected Aurora PostgreSQL engine version
supports automatic pause.

## 1. Create Aurora

Create one Aurora PostgreSQL Serverless v2 cluster for staging and another for
production.

1. Set the initial database name to `points_geek`.
2. Store the master credentials in AWS Secrets Manager.
3. Enable the RDS Data API on each cluster.
4. Keep public access disabled. Data API is an HTTPS service and does not
   require the Amplify runtime to join the database VPC.
5. Record the AWS region, cluster ARN, and Secrets Manager secret ARN.

See [Using RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html).

## 2. Create least-privilege IAM roles

Attach the following policy to both the Amplify build service role and the
Amplify SSR Compute role. Replace the two resource ARNs for each environment.
The build role runs migrations; the compute role serves application queries.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RunAuroraDataApiStatements",
      "Effect": "Allow",
      "Action": [
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction",
        "rds-data:CommitTransaction",
        "rds-data:ExecuteStatement",
        "rds-data:RollbackTransaction"
      ],
      "Resource": "AURORA_CLUSTER_ARN"
    },
    {
      "Sid": "ReadAuroraCredentials",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "AURORA_SECRET_ARN"
    }
  ]
}
```

If the secret uses a customer-managed KMS key, also allow `kms:Decrypt` on that
key. Follow Amplify's instructions to create and attach an
[SSR Compute role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html).

## 3. Create the Amplify app

1. Connect this repository in Amplify Hosting.
2. Select **My app is a monorepo** and set the app root to `apps/web`.
3. Deploy `develop` as staging and `main` as production.
4. Confirm `AMPLIFY_MONOREPO_APP_ROOT` is `apps/web` for both branches.
5. Use the repository's `amplify.yml` build specification.
6. Attach the correct branch-specific SSR Compute role.

The build installs pnpm, writes the selected server environment variables to
Next.js's `.env.production`, applies pending migrations, and builds the app.
Migrations use Drizzle's existing migration ledger and are idempotent.

## 4. Set branch variables

Set these separately for `develop` and `main` in the Amplify console:

```dotenv
AURORA_REGION=us-east-1
AURORA_RESOURCE_ARN=arn:aws:rds:...
AURORA_SECRET_ARN=arn:aws:secretsmanager:...
AURORA_DATABASE=points_geek

NEXTAUTH_URL=https://your-environment-domain.example
NEXTAUTH_SECRET=generate-a-different-random-value-per-environment
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
ADMIN_SIGNUP_ALERT_EMAIL=
EXTENSION_ID=
LOG_LEVEL=info
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

Generate an Auth.js secret with `openssl rand -base64 32`. Amplify requires
server runtime variables to be included in the Next.js build artifact. Limit
Amplify app and artifact access accordingly. The database credential itself is
not included; it remains in Secrets Manager.

## 5. Update external integrations

- Add `https://<domain>/api/auth/callback/google` for staging and production to
  the Google OAuth client's authorized redirect URIs.
- Point the staging and production extension builds at the matching Amplify URL
  through `WXT_WEB_BASE`, then rebuild the extension so its host permissions
  include the new domain.
- Add the custom production domain in Amplify, verify sign-in and extension
  sync, then move DNS.

## Migrations

Local migrations continue to use the local database:

```bash
pnpm db:migrate
```

Amplify runs the same command automatically before each deployment. To test an
AWS migration from a trusted workstation, export the four `AURORA_*` variables,
authenticate with the AWS CLI, and run `pnpm db:migrate`. Aurora configuration
takes precedence over `DATABASE_URL` when both are present.

Do not put production `AURORA_*` values in `apps/web/.env`; use branch-scoped
Amplify variables and IAM roles.
