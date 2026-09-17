import {
  getBearerToken,
  handleError,
  hashToken,
  json,
  readBody,
  requireDatabase,
  ResponseError,
} from "./_shared.js";

const authorize = async (request, db, id) => {
  const token = getBearerToken(request);
  if (!token) {
    throw new ResponseError(401, "Kunci proyek tidak ditemukan.");
  }
  const row = await db
    .prepare("SELECT token_hash FROM projects WHERE id = ?")
    .bind(id)
    .first();
  if (!row || row.token_hash !== (await hashToken(token))) {
    throw new ResponseError(403, "Kunci proyek tidak valid.");
  }
};

export const onRequestGet = async ({ request, env, params }) => {
  try {
    const db = requireDatabase(env);
    const id = String(params.id);
    await authorize(request, db, id);
    const row = await db
      .prepare(
        `SELECT id, title, scene_data, created_at, updated_at
         FROM projects WHERE id = ?`,
      )
      .bind(id)
      .first();
    if (!row) {
      throw new ResponseError(404, "Proyek tidak ditemukan.");
    }
    return json({
      id: row.id,
      title: row.title,
      scene: JSON.parse(row.scene_data),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestPut = async ({ request, env, params }) => {
  try {
    const db = requireDatabase(env);
    const id = String(params.id);
    await authorize(request, db, id);
    const { title, sceneData } = await readBody(request);
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE projects SET title = ?, scene_data = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(title, sceneData, now, id)
      .run();
    return json({
      id,
      title,
      scene: JSON.parse(sceneData),
      updatedAt: now,
    });
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestDelete = async ({ request, env, params }) => {
  try {
    const db = requireDatabase(env);
    const id = String(params.id);
    await authorize(request, db, id);
    await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    return json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
};

