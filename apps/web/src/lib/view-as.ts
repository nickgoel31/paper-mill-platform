/**
 * "View as mill": lets TWJ-Labs platform staff step into a paper mill's ERP.
 *
 * The chosen mill lives in a signed, httpOnly cookie. The signature binds the
 * mill to the platform user who set it (HMAC-SHA256 of `tenantId.userId` with
 * AUTH_SECRET), so it cannot be forged or reused by another account. Middleware
 * is the only place that trusts it — it verifies the cookie and then injects the
 * usual `x-tenant-id` / `x-is-platform: 0` headers. Everything downstream reads
 * those headers, so this module stays edge-safe (Web Crypto only).
 */
export const VIEW_AS_COOKIE = "twj_view_mill";

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(tenantId: string, userId: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`view-as:${tenantId}.${userId}`)
  );
  return b64url(mac);
}

export async function createViewAsCookieValue(tenantId: string, userId: string) {
  return `${tenantId}.${await sign(tenantId, userId)}`;
}

/** Returns the mill id if the cookie is valid for this platform user, else null. */
export async function verifyViewAsCookie(
  value: string | undefined,
  userId: string
): Promise<string | null> {
  if (!value || !userId) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const tenantId = value.slice(0, dot);
  const given = value.slice(dot + 1);
  let expected: string;
  try {
    expected = await sign(tenantId, userId);
  } catch {
    return null;
  }
  if (given.length !== expected.length) return null;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0 ? tenantId : null;
}
