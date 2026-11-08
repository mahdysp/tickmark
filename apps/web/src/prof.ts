import { chime, playToken } from "./audio";
import { makeToken } from "./token";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const loginSec = $("#login");
const appSec = $("#app");
const uidEl = $<HTMLInputElement>("#uid");
const pwEl = $<HTMLInputElement>("#pw");
const loginBtn = $<HTMLButtonElement>("#loginBtn");
const loginErr = $("#loginErr");
const whoEl = $("#who");
const logoutBtn = $<HTMLButtonElement>("#logout");
const coursesEl = $("#courses");
const sessionEl = $("#session");
const titleEl = $("#sessionTitle");
const pulseBtn = $<HTMLButtonElement>("#pulse");
const endBtn = $<HTMLButtonElement>("#end");
const pulseStatus = $("#pulseStatus");
const summaryEl = $("#summary");
const alertEl = $("#alert");
const rowsEl = $("#rows");

type Active = { id: string; shortId: string; sessionKey: string; title: string };
let active: Active | null = null;
let timer: number | undefined;
let pulsing = false;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    showLogin();
    throw new Error("not_logged_in");
  }
  if (!res.ok) throw new Error(body.error ?? String(res.status));
  return body;
}

function showLogin() {
  window.clearInterval(timer);
  loginSec.hidden = false;
  appSec.hidden = true;
}

async function showApp(user: { fullName: string }) {
  loginSec.hidden = true;
  appSec.hidden = false;
  whoEl.textContent = user.fullName;
  await loadCourses();
  const saved = localStorage.getItem("activeSession");
  if (saved) {
    active = JSON.parse(saved) as Active;
    openSession();
  }
}

async function loadCourses() {
  const { courses } = await api("/prof/courses");
  coursesEl.replaceChildren(
    ...courses.map((c: any) => {
      const li = document.createElement("li");
      li.style.margin = "0.4rem 0";
      li.append(`${c.code} – ${c.title}  `);
      const b = document.createElement("button");
      b.textContent = "Start session";
      b.addEventListener("click", () => startSession(c));
      li.append(b);
      return li;
    }),
  );
}

async function startSession(course: { id: string; code: string; title: string }) {
  if (active && !confirm("A session is already open on this device. Start another one?")) return;
  const s = await api(`/admin/courses/${course.id}/sessions`, { method: "POST", body: "{}" });
  active = {
    id: s.id,
    shortId: s.shortId,
    sessionKey: s.sessionKey,
    title: `${course.code} – ${course.title}`,
  };
  localStorage.setItem("activeSession", JSON.stringify(active));
  openSession();
}

function openSession() {
  if (!active) return;
  sessionEl.hidden = false;
  titleEl.textContent = `Session: ${active.title}`;
  pulseStatus.textContent = "";
  window.clearInterval(timer);
  refresh();
  timer = window.setInterval(refresh, 2000);
}

function closeSession() {
  window.clearInterval(timer);
  active = null;
  localStorage.removeItem("activeSession");
  sessionEl.hidden = true;
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
  if (!active) return;
  try {
    const [s, rep] = await Promise.all([
      api(`/admin/sessions/${active.id}/summary`),
      api(`/admin/sessions/${active.id}/report`),
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
    const msg = (e as Error).message;
    if (msg === "unknown_session" || msg === "forbidden") closeSession();
    else summaryEl.textContent = `Error: ${msg}`;
  }
}

async function runPulse() {
  if (!active || pulsing) return;
  pulsing = true;
  pulseBtn.disabled = true;
  try {
    pulseStatus.textContent = "Chime...";
    await chime();
    const end = Date.now() + 45_000;
    let n = 0;
    while (Date.now() < end) {
      const token = await makeToken(active.sessionKey, active.shortId);
      pulseStatus.textContent = `Pulse: transmission ${++n}\n${token}`;
      await playToken(token, 50);
      await new Promise((r) => setTimeout(r, 300));
    }
    pulseStatus.textContent = `Pulse finished (${n} transmissions).`;
  } catch (e) {
    pulseStatus.textContent = `Error: ${(e as Error).message}`;
  } finally {
    pulsing = false;
    pulseBtn.disabled = false;
  }
}

loginBtn.addEventListener("click", async () => {
  loginErr.textContent = "";
  try {
    const user = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ universityId: uidEl.value.trim(), password: pwEl.value }),
    });
    pwEl.value = "";
    await showApp(user);
  } catch (e) {
    loginErr.textContent = `Login failed: ${(e as Error).message}`;
  }
});

pulseBtn.addEventListener("click", runPulse);

endBtn.addEventListener("click", async () => {
  if (!active || !confirm("End this session? No more check-ins will be accepted.")) return;
  try {
    await api(`/admin/sessions/${active.id}/end`, { method: "POST", body: "{}" });
  } catch (e) {
    pulseStatus.textContent = `Error: ${(e as Error).message}`;
    return;
  }
  closeSession();
});

logoutBtn.addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  closeSession();
  showLogin();
});

// Restore an existing login after a page reload
api("/auth/me")
  .then(showApp)
  .catch(() => showLogin());
