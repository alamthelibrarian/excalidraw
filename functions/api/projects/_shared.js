const MAX_PROJECT_BYTES = 1_800_000;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

const encodeBase64Url = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const decodeBase64Url = (value) =>
  Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );

const importHmacKey = (secret) =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

export class ResponseError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const createSession = async (user, secret) => {
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ ...user, exp: Date.now() + 2_592_000_000 }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encodeBase64Url(signature)}`;
};

export const getSession = async (request, env) => {
  if (!env.SESSION_SECRET) {
    throw new ResponseError(503, "SESSION_SECRET is not configured.");
  }

  const value = (request.headers.get("cookie") || "").match(
    /(?:^|; )draw_session=([^;]+)/,
  )?.[1];
  if (!value) {
    throw new ResponseError(401, "Sign in with Google to continue.");
  }

  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) {
      throw new Error("Malformed session");
    }

    const verified = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(env.SESSION_SECRET),
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!verified) {
      throw new Error("Invalid signature");
    }

    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    );
    if (
      typeof session?.sub !== "string" ||
      typeof session?.exp !== "number" ||
      session.exp < Date.now()
    ) {
      throw new Error("Expired or malformed session");
    }
    return session;
  } catch {
    throw new ResponseError(401, "Invalid session.");
  }
};

export const requireSameOrigin = (request) => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    fetchSite === "cross-site" ||
    (origin && origin !== requestUrl.origin)
  ) {
    throw new ResponseError(403, "Cross-origin mutation is not allowed.");
  }
};

export const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new ResponseError(400, "Invalid JSON request body.");
  }
};

export const readBody = async (request) => {
  if (
    Number(request.headers.get("content-length") || 0) > MAX_PROJECT_BYTES
  ) {
    throw new ResponseError(413, "Project is too large.");
  }

  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ResponseError(400, "Invalid project request body.");
  }

  const sceneData = JSON.stringify(body.scene || {});
  if (new TextEncoder().encode(sceneData).byteLength > MAX_PROJECT_BYTES) {
    throw new ResponseError(413, "Project is too large.");
  }

  const title = String(body.title || "").trim().slice(0, 120);
  const expectedUpdatedAt =
    body.expectedUpdatedAt == null
      ? null
      : String(body.expectedUpdatedAt).trim();

  return {
    title: title || "Untitled project",
    sceneData,
    expectedUpdatedAt,
  };
};

export const requireDatabase = (env) => {
  if (!env.DB) {
    throw new ResponseError(503, "The D1 DB binding is not configured.");
  }
  return env.DB;
};

export const handleError = (error) => {
  if (error instanceof ResponseError) {
    return json({ error: error.message }, error.status);
  }

  console.error(error);
  return json({ error: "An unexpected server error occurred." }, 500);
};
