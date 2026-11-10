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


## Account privacy and follow requests (20261110140000)

- Adds `User.isPrivate BOOLEAN NOT NULL DEFAULT false`; existing accounts and newly created accounts remain public unless the owner opts in to private mode.
- Adds a separate `FollowRequest` table because the existing `Follow` model represents approved relationships only. Existing `Follow` rows are not rewritten or deleted. The unique requester/target key prevents duplicate pending requests.
- Extends the existing `Notification.type` CHECK constraint for `FOLLOW_REQUEST` and `FOLLOW_REQUEST_ACCEPTED`. The migration aborts if it encounters notification values outside the known set.
- This migration is additive and is not applied automatically by this feature branch. Review and back up the production database before running `npm run db:migrate:deploy`.
- **Media delivery release gate:** existing post/reel assets are stored as standard Cloudinary delivery URLs. API authorization prevents unauthorised API reads, but it cannot revoke a previously shared Cloudinary URL. Before enabling private accounts in production, migrate protected assets to authenticated/private Cloudinary delivery (or an equivalent access-controlled media proxy) and return short-lived authorised media URLs only to approved viewers. Do not treat API-only protection as complete media privacy.
