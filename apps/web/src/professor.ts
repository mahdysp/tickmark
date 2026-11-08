import { chime, playToken } from "./audio";
import { makeToken } from "./token";

const shortIdEl = document.querySelector<HTMLInputElement>("#shortId")!;
const keyEl = document.querySelector<HTMLTextAreaElement>("#key")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start")!;
const statusEl = document.querySelector<HTMLPreElement>("#status")!;

startBtn.addEventListener("click", async () => {
  const shortId = shortIdEl.value.trim();
  const key = keyEl.value.trim();
  if (!shortId || !key) return;
  startBtn.disabled = true;
  try {
    statusEl.textContent = "Chime...";
    await chime();
    const end = Date.now() + 45_000;
    let n = 0;
    while (Date.now() < end) {
      const token = await makeToken(key, shortId);
      statusEl.textContent = `Pulse: transmission ${++n}\n${token}`;
      await playToken(token);
      await new Promise((r) => setTimeout(r, 300));
    }
    statusEl.textContent = `Pulse finished (${n} transmissions).`;
  } catch (e) {
    statusEl.textContent = `Error: ${(e as Error).message}`;
  } finally {
    startBtn.disabled = false;
  }
});
