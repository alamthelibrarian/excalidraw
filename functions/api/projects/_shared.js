const MAX_SCENE_BYTES = 1_800_000;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const readBody = async (request) => {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_SCENE_BYTES) {
    throw new ResponseError(
      413,
      "Proyek terlalu besar untuk penyimpanan D1. Kurangi gambar atau lampiran.",
    );
  }
  const body = await request.json();
  const sceneData = JSON.stringify(body.scene || {});
  if (new TextEncoder().encode(sceneData).byteLength > MAX_SCENE_BYTES) {
    throw new ResponseError(
      413,
      "Proyek terlalu besar untuk penyimpanan D1. Kurangi gambar atau lampiran.",
    );
  }
  const title = String(body.title || "").trim().slice(0, 120);
  return { title: title || "Proyek tanpa judul", sceneData };
};

export const getBearerToken = (request) => {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

export const hashToken = async (token) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const requireDatabase = (env) => {
  if (!env.DB) {
    throw new ResponseError(503, "Binding D1 bernama DB belum dikonfigurasi.");
  }
  return env.DB;
};

export class ResponseError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const handleError = (error) => {
  if (error instanceof ResponseError) {
    return json({ error: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "Terjadi kesalahan pada server." }, 500);
};
