import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, verifyAdminCsrf } from "@/lib/admin-session";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getAdminKey(): string {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    throw new Error("ADMIN_API_KEY is not configured on the web server");
  }
  return key;
}

export async function GET() {
  try {
    const authed = await requireAdminSession();
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resp = await fetch(`${API_URL}/api/contests`, {
      cache: "no-store",
    });
    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch contests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authed = await requireAdminSession();
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const csrfOk = await verifyAdminCsrf(req);
    if (!csrfOk) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const adminKey = getAdminKey();
    const payload = await req.text();
    console.info("[admin-audit] create_contest", {
      at: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    const resp = await fetch(`${API_URL}/api/contests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: payload,
      cache: "no-store",
    });

    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create contest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
