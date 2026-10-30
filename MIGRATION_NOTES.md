# Migration notes

## Remove legacy auth synchronization

The migration `20261030120000_remove_legacy_auth_sync` drops the deprecated external identity column and `WebhookEvent` from the `rentreel` schema. Before dropping the identity column, it fails if any user has both a non-null legacy identifier and a null `passwordHash`. It does not delete or update user rows, password hashes, or any other user fields. Accounts that already have a password hash remain intact and can continue to sign in. The migration also fails if `WebhookEvent` contains rows; the inspected database had no event rows. Both checks run before the schema drops. The migration uses guarded, conditional drops so retrying it after successful application does not fail on already-removed objects; Prisma still tracks the migration as a one-time migration.

The application no longer reads or writes legacy tables in the `public` schema. Back up and drop these tables manually after confirming they are no longer needed:

- `public.UserProfile`
- `public.Property`
- `public.Room`
- `public.Listing`
- `public.Message`
- `public.Notification`

## 20261030140000_database_model_cleanup

- The migration pre-checks `Comment`, `Like`, `SavedRoom`, and `RoomMedia` parent references before adding any missing exactly-one-parent constraints. The initial migration already creates these constraints on databases that applied it successfully.
- Existing string status/type fields remain strings in Prisma and gain database CHECK constraints. This avoids rewriting their storage to PostgreSQL enum types. The migration fails if it finds values outside the documented domains.
- Existing `Notification.type = 'INQUIRY'` rows are changed to `COMMENT`, matching the current use of that value for post and reel comments. New comment notifications use `COMMENT`. `ROOM_INQUIRY` remains reserved for actual room inquiries.
- Room filtering and unread-message indexes are added.
- The migration creates `VisitRequest` with a timestamp-valued `scheduledAt`, status enum, foreign keys, and lookup indexes.
- Trigram indexes are created for room title, description, city, and area when `pg_trgm` is available. The migration installs the extension only when PostgreSQL reports it as available; if it is unavailable, PostgreSQL emits a notice and these optional search indexes are skipped.
