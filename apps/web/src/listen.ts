import { listen } from "./audio";

const listenBtn = document.querySelector<HTMLButtonElement>("#listen")!;
const listenStatus = document.querySelector<HTMLPreElement>("#listenStatus")!;
const tokenInput = document.querySelector<HTMLInputElement>("#token")!;
const checkBtn = document.querySelector<HTMLButtonElement>("#checkin")!;

const TOKEN_RE = /^[0-9a-f]{6}\.[0-9a-z]{1,10}\.[A-Za-z0-9_-]{8}$/;
let stop: (() => void) | null = null;

function reset(message: string) {
  stop?.();
  stop = null;
  listenBtn.textContent = "Listen for pulse";
  listenStatus.textContent = message;
}

listenBtn.addEventListener("click", async () => {
  if (stop) return reset("Stopped.");
  try {
    listenStatus.textContent = "Listening...";
    listenBtn.textContent = "Stop listening";
    stop = await listen((text) => {
      if (!TOKEN_RE.test(text)) return;
      reset(`Heard: ${text}`);
      tokenInput.value = text;
      checkBtn.click();
    });
  } catch (e) {
    reset(`Error: ${(e as Error).message}`);
  }
});
