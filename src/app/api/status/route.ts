import { getDeps } from "@/server/deps";

/**
 * Convenience flag for the UI only. It reads configuration, never Redis or the model, and exposes no
 * quota counts or infrastructure details. The live endpoints remain the authority and re-check everything.
 */
export async function GET(request: Request): Promise<Response> {
  void request.url; // request-scoped: evaluated per request, not at build time
  const { config } = getDeps();
  const body = config.live
    ? { mode: "live", termsVersion: config.termsVersion, privacyVersion: config.privacyVersion }
    : { mode: "sample" };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=30" } });
}
