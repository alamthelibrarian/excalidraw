# Cloud project storage

This fork adds Google-authenticated project storage and encrypted read-only
share snapshots using Cloudflare Pages Functions and D1.

## Architecture

- Saved projects are private to the signed-in Google account.
- A project URL contains only the project UUID (`#project=<id>`). Authorization
  is enforced server-side by the signed session cookie and the project's
  `user_id`.
- Shared snapshots use `#json=<id>,<encryption-key>`. The drawing is encrypted
  in the browser before upload. The encryption key remains in the URL fragment
  and is never sent to the server.
- Shared snapshots are read-only in the application and can be expired or
  revoked by their owner.
- Local browser saving remains available for ordinary, non-share canvases.
  Read-only shared snapshots are not written over the user's local working
  canvas.

## Cloudflare configuration

Create a D1 database, for example `excalidraw-projects`, and bind it to the
Pages project as:

`DB`

Configure these Pages secrets/variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

The Google OAuth web client must allow this redirect URI:

`https://draw.alam.web.id/api/auth/callback`

Use a long random value for `SESSION_SECRET`. Do not commit any of these
server-side secrets to the repository.

## Database migrations

Run migrations once, in numeric order:

1. `migrations/0001_cloud_projects.sql`
2. `migrations/0002_share_links.sql`
3. `migrations/0003_share_link_lifecycle.sql`

The migrations are designed so a fresh database receives the full schema and
an existing database can add share-link lifecycle fields without deleting
project data.

Important: never reintroduce `DROP TABLE projects` or `DROP TABLE users`
into a production migration.

If the production database already has a manually-created `share_links`
table, migration 0002 is a no-op because it uses `CREATE TABLE IF NOT EXISTS`;
migration 0003 then adds the lifecycle columns.

Deployment is safe before migration 0003 is applied: the share API detects the
older schema and continues creating/opening ordinary encrypted snapshots. The
expiry/revoke buttons stay disabled until the lifecycle columns are available.

## Project save behavior

Projects are limited to roughly 1.8 MB of serialized scene data. Manual saves
include the project's last known `updated_at` value. The API uses that value
for optimistic concurrency control so an older copy opened on another device
cannot silently overwrite a newer save.

When a conflict is detected, the UI shows a conflict state. The user can open
Projects and either save the current canvas as a new project or reopen the
latest cloud version.

## Shared snapshots

Share payloads are encrypted client-side and limited to roughly 1.5 MB.

The owner can manage shared snapshots from **My Projects → Shared snapshots**:

- expire in 7 days;
- expire in 30 days;
- remove expiration;
- revoke the share.

Revocation prevents future downloads from the server. It cannot recall a copy
that a recipient already downloaded while the link was valid.

Share responses use `Cache-Control: no-store` so revocation/expiration is
checked by the Pages Function instead of being bypassed by a long-lived cache.

## Read-only behavior

A URL matching `#json=<id>,<key>` is treated as a controlled read-only scene.
The hash is preserved across refreshes, editing/project/collaboration controls
are hidden, and the shared scene is not persisted into normal local browser
storage.

## Deployment verification

The app exposes its build SHA in the browser console:

```js
window.__EXCALIDRAW_SHA__
```

Compare it with the latest commit deployed from GitHub. The PWA registration
is configured to activate a fresh service worker immediately when an update is
available.

If a browser appears to run an old bundle, first verify the SHA above before
debugging application state.

## Security notes

Authenticated mutation endpoints reject cross-origin browser requests.
Session cookies are signed with HMAC-SHA256 and are `HttpOnly`, `Secure`,
and `SameSite=Lax`. OAuth uses a random state cookie and clears that state
after a successful callback.

Cloudflare response headers also set `X-Content-Type-Options`,
`Referrer-Policy`, and a restrictive `Permissions-Policy`.
