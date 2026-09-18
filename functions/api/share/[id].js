import {
  json,
  requireDatabase,
  ResponseError,
} from "../projects/_shared.js";

export const onRequestGet = async ({ env, params }) => {
  try {
    const row = await requireDatabase(env)
      .prepare("SELECT payload FROM share_links WHERE id=?")
      .bind(String(params.id))
      .first();
    if (!row) {
      throw new ResponseError(404, "Shared drawing not found.");
    }
    return new Response(row.payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
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
