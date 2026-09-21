import {
  getSession,
  handleError,
  json,
  readBody,
  readJson,
  requireDatabase,
  requireSameOrigin,
  ResponseError,
} from "./_shared.js";

const find = async (db, id, userId) => {
  const project = await db
    .prepare(
      "SELECT id,title,scene_data,created_at,updated_at FROM projects WHERE id=? AND user_id=?",
    )
    .bind(id, userId)
    .first();

  if (!project) {
    throw new ResponseError(404, "Project not found.");
  }
  return project;
};

const assertExpectedVersion = (expectedUpdatedAt, project) => {
  if (
    expectedUpdatedAt &&
    expectedUpdatedAt !== project.updated_at
  ) {
    throw new ResponseError(
      409,
      "This project changed on another device. Reopen the latest version or save your current canvas as a new project.",
    );
  }
};

const assertUpdated = (result) => {
  if ((result?.meta?.changes ?? 0) < 1) {
    throw new ResponseError(
      409,
      "This project changed while you were saving. Reopen the latest version or save your current canvas as a new project.",
    );
  }
};

export const onRequestGet = async ({ request, env, params }) => {
  try {
    const user = await getSession(request, env);
    const project = await find(
      requireDatabase(env),
      String(params.id),
      user.sub,
    );

    return json({
      id: project.id,
      title: project.title,
      scene: JSON.parse(project.scene_data),
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    });
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestPut = async ({ request, env, params }) => {
  try {
    requireSameOrigin(request);
    const user = await getSession(request, env);
    const db = requireDatabase(env);
    const id = String(params.id);
    const current = await find(db, id, user.sub);
    const { title, sceneData, expectedUpdatedAt } = await readBody(request);

    assertExpectedVersion(expectedUpdatedAt, current);

    const compareUpdatedAt = expectedUpdatedAt || current.updated_at;
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        "UPDATE projects SET title=?,scene_data=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=?",
      )
      .bind(title, sceneData, now, id, user.sub, compareUpdatedAt)
      .run();

    assertUpdated(result);

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

export const onRequestPatch = async ({ request, env, params }) => {
  try {
    requireSameOrigin(request);
    const user = await getSession(request, env);
    const db = requireDatabase(env);
    const id = String(params.id);
    const current = await find(db, id, user.sub);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ResponseError(400, "Invalid project request body.");
    }

    const title = String(body.title || "").trim().slice(0, 120);

    if (!title) {
      throw new ResponseError(400, "Project name is required.");
    }

    const expectedUpdatedAt =
      body.expectedUpdatedAt == null
        ? null
        : String(body.expectedUpdatedAt).trim();
    assertExpectedVersion(expectedUpdatedAt, current);

    const compareUpdatedAt = expectedUpdatedAt || current.updated_at;
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        "UPDATE projects SET title=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=?",
      )
      .bind(title, now, id, user.sub, compareUpdatedAt)
      .run();

    assertUpdated(result);

    return json({ id, title, updatedAt: now });
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestDelete = async ({ request, env, params }) => {
  try {
    requireSameOrigin(request);
    const user = await getSession(request, env);
    const db = requireDatabase(env);
    const id = String(params.id);
    await find(db, id, user.sub);

    await db
      .prepare("DELETE FROM projects WHERE id=? AND user_id=?")
      .bind(id, user.sub)
      .run();

    return json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
};
