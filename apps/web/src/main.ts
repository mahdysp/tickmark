import { startRegistration } from "@simplewebauthn/browser";

const input = document.querySelector<HTMLInputElement>("#code")!;
const btn = document.querySelector<HTMLButtonElement>("#enroll")!;
const out = document.querySelector<HTMLPreElement>("#out")!;

const post = (path: string, body: unknown) =>
  fetch(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

btn.addEventListener("click", async () => {
  const code = input.value.trim();
  try {
    out.textContent = "Requesting options...";
    const optRes = await post("/enroll/options", { code });
    if (!optRes.ok) throw new Error("options: " + (await optRes.text()));
    const optionsJSON = await optRes.json();

    out.textContent = "Waiting for fingerprint / face...";
    const response = await startRegistration({ optionsJSON });

    out.textContent = "Verifying...";
    const verRes = await post("/enroll/verify", { code, response });
    out.textContent = verRes.ok
      ? "Registered successfully."
      : "Failed: " + (await verRes.text());
  } catch (e) {
    out.textContent = "Error: " + (e as Error).message;
  }
});
