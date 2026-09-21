import { createSession, requireDatabase } from "../projects/_shared.js";

export const onRequestGet = async ({ request, env }) => {
  try {
    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.SESSION_SECRET
    ) {
      throw new Error("OAuth config incomplete");
    }

    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const expected = (request.headers.get("cookie") || "").match(
      /(?:^|; )oauth_state=([^;]+)/,
    )?.[1];

    if (!code || !state || state !== expected) {
      return new Response("Invalid sign-in request.", { status: 400 });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error("Token exchange failed");
    }

    const token = await tokenResponse.json();
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (!profileResponse.ok) {
      throw new Error("Profile request failed");
    }

    const profile = await profileResponse.json();
    if (!profile.sub || !profile.email) {
      throw new Error("Google profile is missing required claims");
    }

    const now = new Date().toISOString();
    await requireDatabase(env)
      .prepare(
        "INSERT INTO users(id,email,name,picture,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture,updated_at=excluded.updated_at",
      )
      .bind(
        profile.sub,
        profile.email,
        profile.name || profile.email,
        profile.picture || "",
        now,
        now,
      )
      .run();

    const session = await createSession(
      {
        sub: profile.sub,
        email: profile.email,
        name: profile.name || profile.email,
        picture: profile.picture || "",
      },
      env.SESSION_SECRET,
    );

    const headers = new Headers({ Location: "/" });
    headers.append(
      "Set-Cookie",
      `draw_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    );
    headers.append(
      "Set-Cookie",
      "oauth_state=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(error);
    return new Response(
      "Google sign-in failed. Check the OAuth configuration.",
      { status: 500 },
    );
  }
};
