export const maxDuration = 40;

import { handleDiagnose } from "@/server/handlers";
import { getDeps } from "@/server/deps";

export async function POST(req: Request): Promise<Response> {
  return handleDiagnose(req, getDeps());
}
