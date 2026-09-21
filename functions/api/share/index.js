import {
  getSession,
  handleError,
  json,
  requireDatabase,
  requireSameOrigin,
  ResponseError,
} from "../projects/_shared.js";

import { hasShareLifecycleColumns } from "./_shared.js";

const MAX_SHARE_BYTES = 1_500_000;

export const onRequestGet = async ({ request, env }) => {
  try {
    const user = await getSession(request, env);
    const db = requireDatabase(env);
    const hasLifecycle = await hasShareLifecycleColumns(db);
    const result = await db
      .prepare(
        hasLifecycle
          ? "SELECT id,created_at,expires_at,revoked_at FROM share_links WHERE user_id=? ORDER BY created_at DESC LIMIT 100"
          : "SELECT id,created_at FROM share_links WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      )
      .bind(user.sub)
      .all();

    return json(
      result.results.map((share) => ({
        id: share.id,
        createdAt: share.created_at,
        expiresAt: hasLifecycle ? share.expires_at : null,
        revokedAt: hasLifecycle ? share.revoked_at : null,
        lifecycleAvailable: hasLifecycle,
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

    const db = requireDatabase(env);
    const hasLifecycle = await hasShareLifecycleColumns(db);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    if (hasLifecycle) {
      await db
        .prepare(
          "INSERT INTO share_links(id,user_id,payload,created_at,expires_at,revoked_at) VALUES(?,?,?,?,NULL,NULL)",
        )
        .bind(id, user.sub, payload, createdAt)
        .run();
    } else {
      await db
        .prepare(
          "INSERT INTO share_links(id,user_id,payload,created_at) VALUES(?,?,?,?)",
        )
        .bind(id, user.sub, payload, createdAt)
        .run();
    }

    return json(
      {
        id,
        createdAt,
        expiresAt: null,
        revokedAt: null,
        lifecycleAvailable: hasLifecycle,
      },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
};
