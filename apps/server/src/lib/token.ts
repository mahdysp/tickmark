import { createHmac, timingSafeEqual } from "node:crypto";

export const SLOT_SECONDS = 5;

const macOf = (key: Buffer, shortId: string, slot: string) =>
  createHmac("sha256", key)
    .update(`${shortId}.${slot}`)
    .digest()
    .subarray(0, 6)
    .toString("base64url");

export function makeToken(key: Buffer, shortId: string, now = Date.now()) {
  const slot = Math.floor(now / 1000 / SLOT_SECONDS).toString(36);
  return `${shortId}.${slot}.${macOf(key, shortId, slot)}`;
}

export function parseToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [shortId, slot, mac] = parts;
  const n = parseInt(slot, 36);
  if (!shortId || !mac || Number.isNaN(n)) return null;
  return { shortId, slot, mac, slotTimeMs: n * SLOT_SECONDS * 1000 };
}

export function checkMac(key: Buffer, shortId: string, slot: string, mac: string) {
  const expected = Buffer.from(macOf(key, shortId, slot));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
