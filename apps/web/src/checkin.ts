import { startAuthentication } from "@simplewebauthn/browser";
import { del, get, keys, set } from "idb-keyval";

const tokenInput = document.querySelector<HTMLInputElement>("#token")!;
const checkBtn = document.querySelector<HTMLButtonElement>("#checkin")!;
const syncBtn = document.querySelector<HTMLButtonElement>("#sync")!;
const statusEl = document.querySelector<HTMLPreElement>("#status")!;

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(token: string) {
  const credentialId = localStorage.getItem("credentialId");
  if (!credentialId) throw new Error("This device is not enrolled yet");
  return startAuthentication({
    optionsJSON: {
      challenge: b64url(new TextEncoder().encode(token)),
      rpId: location.hostname,
      allowCredentials: [{ id: credentialId, type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
}

async function pendingKeys() {
  return (await keys()).filter(
    (k): k is string => typeof k === "string" && k.startsWith("pending:"),
  );
}

async function syncPending(): Promise<string[]> {
  const lines: string[] = [];
  for (const k of await pendingKeys()) {
    const item = await get(k);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: item.token, assertion: item.assertion }),
      });
      if (res.status >= 500) {
        lines.push(`${item.token}: server unavailable, kept for later`);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        await del(k);
        lines.push(`${item.token}: recorded (${body.mode})`);
      } else {
        await del(k);
        await set(`failed:${item.token}`, { ...item, error: body.error });
        lines.push(`${item.token}: rejected (${body.error})`);
      }
    } catch {
      lines.push(`${item.token}: offline, kept for later`);
    }
  }
  return lines;
}

async function render(lines: string[] = []) {
  const n = (await pendingKeys()).length;
  statusEl.textContent = [...lines, `Pending on this device: ${n}`].join("\n");
}

checkBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  try {
    statusEl.textContent = "Waiting for fingerprint / face...";
    const assertion = await sign(token);
    await set(`pending:${token}`, { token, assertion, signedAt: Date.now() });
    await render(await syncPending());
  } catch (e) {
    await render([`Error: ${(e as Error).message}`]);
  }
});

syncBtn.addEventListener("click", async () => render(await syncPending()));
window.addEventListener("online", async () => render(await syncPending()));
render();
