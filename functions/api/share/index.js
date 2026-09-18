import {
  getSession,
  handleError,
  json,
  requireDatabase,
  ResponseError,
} from "../projects/_shared.js";

const MAX_SHARE_BYTES = 1_500_000;

export const onRequestPost = async ({ request, env }) => {
  try {
    const user = await getSession(request, env);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_SHARE_BYTES) {
      throw new ResponseError(413, "The shared drawing is too large.");
    }
    const payload = await request.arrayBuffer();
    if (!payload.byteLength) {
      throw new ResponseError(400, "The shared drawing is empty.");
    }
    if (payload.byteLength > MAX_SHARE_BYTES) {
      throw new ResponseError(413, "The shared drawing is too large.");
    }

    const id = crypto.randomUUID();
    await requireDatabase(env)
      .prepare(
        "INSERT INTO share_links(id,user_id,payload,created_at) VALUES(?,?,?,?)",
      )
      .bind(id, user.sub, payload, new Date().toISOString())
      .run();

    return json({ id }, 201);
  } catch (error) {
    return handleError(error);
  }
};
