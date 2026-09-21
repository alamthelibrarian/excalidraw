import {
  getSession,
  handleError,
  json,
  readBody,
  requireDatabase,
  requireSameOrigin,
} from "./_shared.js";

export const onRequestGet = async ({ request, env }) => {
  try {
    const user = await getSession(request, env);
    const result = await requireDatabase(env)
      .prepare(
        "SELECT id,title,created_at,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC",
      )
      .bind(user.sub)
      .all();

    return json(
      result.results.map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      })),
    );
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestPost = async ({ request, env }) => {
  try {
    requireSameOrigin(request);
    const user = await getSession(request, env);
    const { title, sceneData } = await readBody(request);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await requireDatabase(env)
      .prepare(
        "INSERT INTO projects(id,user_id,title,scene_data,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, user.sub, title, sceneData, now, now)
      .run();

    return json({ id, title, updatedAt: now }, 201);
  } catch (error) {
    return handleError(error);
  }
};
