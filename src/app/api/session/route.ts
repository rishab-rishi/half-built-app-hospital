import { handleSession } from "@/server/handlers";
import { getDeps } from "@/server/deps";

export async function POST(req: Request): Promise<Response> {
  return handleSession(req, getDeps());
}
