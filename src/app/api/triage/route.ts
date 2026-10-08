export const maxDuration = 40;

import { handleTriage } from "@/server/handlers";
import { getDeps } from "@/server/deps";

export async function POST(req: Request): Promise<Response> {
  return handleTriage(req, getDeps());
}
