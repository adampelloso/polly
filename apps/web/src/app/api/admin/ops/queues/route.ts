import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";

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

    const adminKey = getAdminKey();
    const resp = await fetch(`${API_URL}/api/ops/queues`, {
      headers: {
        "x-admin-key": adminKey,
      },
      cache: "no-store",
    });
    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch queue stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
