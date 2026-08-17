import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { COOKIE_NAME, createSession, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const data = await request.formData(); const supplied = String(data.get("password") ?? ""); const expected = process.env.APP_PASSWORD ?? "";
  const a = createHash("sha256").update(supplied).digest(); const b = createHash("sha256").update(expected).digest();
  if (!expected || !timingSafeEqual(a,b)) return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  const response = NextResponse.redirect(new URL("/", request.url), 303); response.cookies.set(COOKIE_NAME, createSession(), sessionCookie); return response;
}
