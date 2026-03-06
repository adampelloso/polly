import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "polly_admin_session";
const CSRF_COOKIE_NAME = "polly_admin_csrf";
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function sessionValue(): string {
  const password = process.env.ADMIN_UI_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_UI_PASSWORD is not configured on the web server");
  }
  return createHash("sha256").update(password).digest("hex");
}

export async function requireAdminSession(): Promise<boolean> {
  try {
    const store = await cookies();
    const cookie = store.get(COOKIE_NAME)?.value;
    return Boolean(cookie && cookie === sessionValue());
  } catch {
    return false;
  }
}

export async function setAdminSessionCookie() {
  const store = await cookies();
  const csrfToken = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${sessionValue()}`)
    .digest("hex");

  store.set(COOKIE_NAME, sessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  store.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return csrfToken;
}

export async function clearAdminSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  store.delete(CSRF_COOKIE_NAME);
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_UI_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_UI_PASSWORD is not configured on the web server");
  }
  const providedHash = createHash("sha256").update(password).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function getAdminCsrfToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CSRF_COOKIE_NAME)?.value ?? null;
}

export async function verifyAdminCsrf(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("x-admin-csrf");
  if (!header) return false;
  const cookieValue = await getAdminCsrfToken();
  if (!cookieValue) return false;

  const headerHash = createHash("sha256").update(header).digest();
  const cookieHash = createHash("sha256").update(cookieValue).digest();
  return timingSafeEqual(headerHash, cookieHash);
}

export function checkAdminLoginRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
  }

  const current = loginAttempts.get(key)!;
  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordAdminLoginFailure(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  loginAttempts.set(key, entry);
}

export function clearAdminLoginFailures(key: string) {
  loginAttempts.delete(key);
}
