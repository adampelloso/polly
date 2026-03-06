import { NextRequest, NextResponse } from "next/server";
import {
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  clearAdminSessionCookie,
  getAdminCsrfToken,
  recordAdminLoginFailure,
  requireAdminSession,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/admin-session";

export async function GET() {
  const authed = await requireAdminSession();
  const csrfToken = authed ? await getAdminCsrfToken() : null;
  return NextResponse.json({ authenticated: authed, csrfToken });
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limit = checkAdminLoginRateLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Try again later.",
          retryAfterMs: limit.retryAfterMs,
        },
        { status: 429 }
      );
    }

    const body = (await req.json()) as { password?: string };
    const password = body.password ?? "";
    if (!verifyAdminPassword(password)) {
      recordAdminLoginFailure(ip);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    clearAdminLoginFailures(ip);
    const csrfToken = await setAdminSessionCookie();
    console.info("[admin-audit] login_success", {
      at: new Date().toISOString(),
      ip,
    });
    return NextResponse.json({ ok: true, csrfToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create admin session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  console.info("[admin-audit] logout", {
    at: new Date().toISOString(),
  });
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
