import {
  getSession,
  handleError,
  json,
  readJson,
  requireDatabase,
  requireSameOrigin,
  ResponseError,
} from "../projects/_shared.js";

const getOwnedShare = async (db, id, userId) => {
  const share = await db
    .prepare(
      "SELECT id,created_at,expires_at,revoked_at FROM share_links WHERE id=? AND user_id=?",
    )
    .bind(id, userId)
    .first();

  if (!share) {
    throw new ResponseError(404, "Shared drawing not found.");
  }
  return share;
};

export const onRequestGet = async ({ env, params }) => {
  try {
    const row = await requireDatabase(env)
      .prepare(
        "SELECT payload,expires_at,revoked_at FROM share_links WHERE id=?",
      )
      .bind(String(params.id))
      .first();

    if (!row) {
      throw new ResponseError(404, "Shared drawing not found.");
    }

    const now = Date.now();
    const expired =
      row.expires_at && new Date(row.expires_at).getTime() <= now;
    if (row.revoked_at || expired) {
      throw new ResponseError(410, "This shared drawing is no longer available.");
    }

    const payload =
      row.payload instanceof ArrayBuffer
        ? row.payload
        : new Uint8Array(row.payload).buffer;

    return new Response(payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof ResponseError ? error.status : 500;
    return json(
      {
        error:
          error instanceof ResponseError
            ? error.message
            : "An unexpected server error occurred.",
      },
      status,
    );
  }
};

export const onRequestPatch = async ({ request, env, params }) => {
  try {
    requireSameOrigin(request);
    const user = await getSession(request, env);
    const db = requireDatabase(env);
    const id = String(params.id);
    await getOwnedShare(db, id, user.sub);

    const body = await readJson(request);
    let expiresAt = null;

    if (body.expiresAt != null) {
      const date = new Date(String(body.expiresAt));
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
        throw new ResponseError(
          400,
          "Expiration must be a valid future date.",
        );
      }
      expiresAt = date.toISOString();
    }

    await db
      .prepare(
        "UPDATE share_links SET expires_at=? WHERE id=? AND user_id=?",
      )
      .bind(expiresAt, id, user.sub)
      .run();

    return json({ id, expiresAt });
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
    await getOwnedShare(db, id, user.sub);

    const revokedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE share_links SET revoked_at=? WHERE id=? AND user_id=?",
      )
      .bind(revokedAt, id, user.sub)
      .run();

    return json({ id, revokedAt });
  } catch (error) {
    return handleError(error);
  }
};
