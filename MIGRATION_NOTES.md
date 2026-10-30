# Migration notes

## Remove legacy auth synchronization

The migration `20261030120000_remove_legacy_auth_sync` drops the deprecated external identity column and `WebhookEvent` from the `rentreel` schema. It fails before changing the schema if the identity column has non-null values or `WebhookEvent` contains rows. Back up any such data and clear it before retrying the migration. Existing accounts with no password hash remain in `rentreel.User`; they can use Forgot password with their email to set one.

The application no longer reads or writes legacy tables in the `public` schema. Back up and drop these tables manually after confirming they are no longer needed:

- `public.UserProfile`
- `public.Property`
- `public.Room`
- `public.Listing`
- `public.Message`
- `public.Notification`
