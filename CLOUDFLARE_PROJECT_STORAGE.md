# Cloud project storage

This fork adds private-by-link project storage using Cloudflare Pages Functions
and D1. Local browser saving remains enabled as a fallback.

## Cloudflare setup

1. Create a D1 database, for example `excalidraw-projects`.
2. Run `migrations/0001_cloud_projects.sql` against that database.
3. In the Cloudflare Pages project, add a D1 binding with variable name `DB`.
4. Redeploy the Pages project after adding the binding.

The edit token is stored in the URL fragment (`#project=...`), so browsers do
not send it in the page request. API calls send it in the Authorization header.
Projects are limited to about 1.8 MB to remain below D1's per-value limit.
