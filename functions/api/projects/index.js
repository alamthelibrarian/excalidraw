import {
  handleError,
  hashToken,
  json,
  randomToken,
  readBody,
  requireDatabase,
} from "./_shared.js";

export const onRequestPost = async ({ request, env }) => {
  try {
    const db = requireDatabase(env);
    const { title, sceneData } = await readBody(request);
    const id = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO projects
          (id, token_hash, title, scene_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, tokenHash, title, sceneData, now, now)
      .run();

    return json({ id, token, title, updatedAt: now }, 201);
  } catch (error) {
    return handleError(error);
  }
};
