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
