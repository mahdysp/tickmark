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

function row(r: any, totalPulses: number) {
  const tr = document.createElement("tr");
  if (r.needsReview) tr.style.background = "#fff4d6";
  const cells = [
    r.university_id,
    r.full_name,
    `${r.confirmed}/${totalPulses}`,
    `${r.percent}%`,
    r.offline_records,
    r.needsReview ? "review" : "",
  ];
  for (const text of cells) {
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
    const [s, rep] = await Promise.all([
      api(`/admin/sessions/${id}/summary`),
      api(`/admin/sessions/${id}/report`),
    ]);
    summaryEl.textContent =
      `Present: ${s.present} / ${s.enrolled} enrolled | pulses detected: ${rep.totalPulses} | ` +
      `students with offline records: ${s.offline_students}` +
      (s.ended_at ? " | session ended" : "");
    alertEl.textContent = s.overCapacity
      ? `ALERT: ${s.present} verified students exceeds the room capacity (${s.room_capacity})`
      : "";
    rowsEl.replaceChildren(...rep.students.map((r: any) => row(r, rep.totalPulses)));
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
