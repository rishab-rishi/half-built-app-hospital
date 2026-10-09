import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  const header = cspHeaderName(process.env.CSP_MODE);

  // Next reads the nonce from the CSP header on the request and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(header, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
