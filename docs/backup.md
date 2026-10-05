# Backup and restore

What to keep a copy of, and how to get it back. Three things hold your data:

| What                                                     | On this computer | Hosted                                  |
| -------------------------------------------------------- | ---------------- | --------------------------------------- |
| Database: progress, notes, answers, flashcards, calendar | `.medos/pgdata`  | The PostgreSQL database                 |
| Files: copies of lecture files and their images          | `.medos/objects` | The private bucket                      |
| Originals                                                | Your S5 folder   | Your S5 folder (MedOS never changes it) |

The files can always be rebuilt from your S5 folder with MedOS Sync. The database cannot: it is
the part that matters.

## The export (any time, anywhere)

**Settings → Export and backup → Everything (.zip)** gives every record in open formats (JSON,
CSV, Markdown, Anki), with where each came from. It is a copy to read and keep, not something MedOS
loads back. See [export.md](export.md).

## On this computer

See "Your data and backups" in [USING-MEDOS.md](../USING-MEDOS.md): stop MedOS, copy
`.medos/pgdata` (and `.medos/objects` if you like) somewhere safe. To restore, stop MedOS and put
the copy back in place of `.medos/pgdata`. Copies made before earlier upgrades are in
`.medos/backups`.

## Hosted

### Database

Managed PostgreSQL services usually take daily backups on paid plans; a free plan may keep none you
can restore, so check yours and do not rely on it alone. For a copy of your own (PostgreSQL client tools 15 or newer, direct connection
string):

```powershell
pg_dump --format=custom --no-owner --file "medos-$(Get-Date -Format yyyy-MM-dd).dump" "postgres://…:5432/postgres"
```

Restore into an empty database:

```powershell
pg_restore --no-owner --dbname "postgres://…:5432/postgres" medos-2026-10-05.dump
```

Then run `npm run db:migrate` against it, which adds anything a newer version needs.

### Files

The bucket can be rebuilt by running MedOS Sync against it. To keep a copy anyway, any S3 tool can
copy it, for example `rclone copy supabase:medos ./medos-objects`. Objects are named by their
SHA-256 and never change, so a copy only ever needs the new ones.

## How often

- Export: whenever you like; weekly is easy.
- Hosted database: the provider's backups where your plan has them, plus your own `pg_dump` before exams and
  before each new MedOS version.
- This computer: copy `.medos/pgdata` before upgrades and now and then.
