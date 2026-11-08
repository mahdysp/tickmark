const tokenEl = document.querySelector<HTMLInputElement>("#adminToken")!;
const sessionEl = document.querySelector<HTMLInputElement>("#sessionId")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start")!;
const summaryEl = document.querySelector<HTMLElement>("#summary")!;
const alertEl = document.querySelector<HTMLElement>("#alert")!;
const rowsEl = document.querySelector<HTMLTableSectionElement>("#rows")!;

tokenEl.value = sessionStorage.getItem("adminToken") ?? "";
sessionEl.value = sessionStorage.getItem("sessionId") ?? "";

let timer: number | undefined;

async function api(path: string) {
  const res = await fetch(`/api${path}`, {
    headers: { "x-admin-token": tokenEl.value.trim() },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function row(r: any) {
  const tr = document.createElement("tr");
  if (r.mode === "offline") tr.style.background = "#fff4d6";
  for (const text of [
    r.university_id,
    r.full_name,
    r.mode,
    new Date(r.received_at).toLocaleTimeString(),
  ]) {
    const td = document.createElement("td");
    td.style.padding = "0.4rem 0.2rem";
    td.textContent = String(text);
    tr.appendChild(td);
  }
  return tr;
}

async function refresh() {
  const id = sessionEl.value.trim();
  try {
    const [s, a] = await Promise.all([
      api(`/admin/sessions/${id}/summary`),
      api(`/admin/sessions/${id}/attendance`),
    ]);
    summaryEl.textContent =
      `Present: ${s.present} / ${s.enrolled} enrolled | ` +
      `students with offline records: ${s.offline_students} | records: ${s.records}` +
      (s.ended_at ? " | session ended" : "");
    alertEl.textContent = s.overCapacity
      ? `ALERT: ${s.present} verified students exceeds the room capacity (${s.room_capacity})`
      : "";
    rowsEl.replaceChildren(...a.records.map(row));
  } catch (e) {
    summaryEl.textContent = `Error: ${(e as Error).message}`;
  }
}

startBtn.addEventListener("click", () => {
  sessionStorage.setItem("adminToken", tokenEl.value.trim());
  sessionStorage.setItem("sessionId", sessionEl.value.trim());
  window.clearInterval(timer);
  refresh();
  timer = window.setInterval(refresh, 2000);
});
