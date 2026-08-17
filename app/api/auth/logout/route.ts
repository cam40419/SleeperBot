import { NextResponse } from "next/server";
import { COOKIE_NAME, sessionCookie } from "@/lib/auth";
export async function POST(request: Request) { const response = NextResponse.redirect(new URL("/login", request.url), 303); response.cookies.set(COOKIE_NAME, "", { ...sessionCookie, maxAge: 0 }); return response; }
