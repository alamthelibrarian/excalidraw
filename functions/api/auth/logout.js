import {
  handleError,
  requireSameOrigin,
} from "../projects/_shared.js";

export const onRequestPost = async ({ request }) => {
  try {
    requireSameOrigin(request);
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie":
          "draw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
