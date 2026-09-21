export const hasShareLifecycleColumns = async (db) => {
  const result = await db.prepare("PRAGMA table_info(share_links)").all();
  const columns = new Set(
    (result.results || []).map((column) => String(column.name)),
  );

  return columns.has("expires_at") && columns.has("revoked_at");
};
