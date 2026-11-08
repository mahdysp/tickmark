export const SLOT_SECONDS = 5;

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function makeToken(sessionKeyB64: string, shortId: string, now = Date.now()) {
  const keyBytes = Uint8Array.from(atob(sessionKeyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const slot = Math.floor(now / 1000 / SLOT_SECONDS).toString(36);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${shortId}.${slot}`),
  );
  return `${shortId}.${slot}.${b64url(new Uint8Array(sig).subarray(0, 6))}`;
}
