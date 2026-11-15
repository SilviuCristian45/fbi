# EF Core migrations

The backend's schema is managed by EF Core migrations in
`fbi-backend/Migrations/`.

## How migrations are applied

`Program.cs` calls `context.Database.Migrate()` at startup, in every
environment. Pending migrations are applied automatically when the backend
container starts: after `scripts/dev-up.sh`, `scripts/prod-deploy.sh` or
`scripts/prod-update.sh`.

If a migration fails, the exception is logged ("A apărut o eroare la
migrare: ...") and **rethrown**: the process exits, the container restarts
(prod restart policy), and the healthcheck never turns green. `dev-up` and
`prod-deploy` report the failure and print the backend logs, and `prod-deploy`
names the migration as the cause.

`dotnet ef database update` is not needed for normal work.

## Tooling

```bash
dotnet tool install --global dotnet-ef --version 9.*
```

Design-time commands build the project and run `Program.cs` up to
`builder.Build()`. `migrations add` / `remove` don't need a database
connection. Commands that do (`database update`, `migrations list`) need the
connection string pointed at the dev database:

```bash
# bash
export ConnectionStrings__DefaultConnection="Host=localhost;Port=15433;Database=fbi;Username=fbi;Password=dev_db_password"
# PowerShell
$env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=15433;Database=fbi;Username=fbi;Password=dev_db_password"
```

## Common commands

```bash
cd fbi-backend
dotnet ef migrations add AddSomething      # create a migration from model changes
dotnet ef migrations remove                # remove the last, NOT yet applied migration
dotnet ef migrations list                  # needs the DB connection
dotnet ef migrations script --idempotent -o migrate.sql   # review the SQL
dotnet ef database update                  # optional: apply now instead of at startup
```

Then rebuild the backend to apply it in the dev stack:
`scripts/dev-up.sh backend`.

If you already applied a migration and want to undo it in dev, either roll the
database back (`dotnet ef database update <PreviousMigration>`, then
`migrations remove`) or reset the dev data with `scripts/dev-reset.sh`.

## Coupling with the Python service

`face-recog-microservice/main.py` writes EF-managed tables with raw SQL:

- `INSERT INTO "PersonMatchResults" ("LocationWantedPersonId", "ImageUrl", "Confidence")`
- `UPDATE "LocationWantedPersons" SET "Status" = 1 WHERE "Id" = ...` (1 =
  `ReportStatus.Completed`)
- `SELECT wi."OriginalUrl", wi."LargeUrl" FROM "WantedImages" wi JOIN "WantedPersons" wp ...`

When a migration renames or retypes any of these tables or columns, or when you
change `ReportStatus` values (`Pending = 0`, `Completed = 1`, `Failed = 2`),
update `main.py` in the same change. Then run the
[face recognition test](testing-face-recognition.md): the build won't catch the
mismatch, and reports just stay `Pending`.

## Production

- Migrations run during `prod-deploy` / `prod-update`, when the new backend
  container starts.
- **Take a backup before deploying a migration** (`scripts/backup.sh`).
  There are no automated down-migrations. Rolling back a schema change means
  restoring the database backup ([Update and rollback](../prod/update-and-rollback.md)).
- Prefer additive migrations (new columns nullable or with defaults), so the
  previous backend version keeps working if you roll back the code only.
