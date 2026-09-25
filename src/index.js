import { onRequest as handleEcoApi, purgeExpiredTrash } from "../functions/api/eco/[[path]].js";

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === "/api/eco" || url.pathname.startsWith("/api/eco/")) {
      return handleEcoApi({
        request,
        env,
        waitUntil(promise) {
          context.waitUntil(promise);
        }
      });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(purgeExpiredTrash(env));
  }
};
