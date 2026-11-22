const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const loginSec = $("#login");
const appSec = $("#app");
const uidEl = $<HTMLInputElement>("#uid");
const pwEl = $<HTMLInputElement>("#pw");
const loginBtn = $<HTMLButtonElement>("#loginBtn");
const loginErr = $("#loginErr");
const whoEl = $("#who");
const logoutBtn = $<HTMLButtonElement>("#logout");

const pUid = $<HTMLInputElement>("#pUid");
const pName = $<HTMLInputElement>("#pName");
const pRole = $<HTMLSelectElement>("#pRole");
const pPw = $<HTMLInputElement>("#pPw");
const pBtn = $<HTMLButtonElement>("#pBtn");
const pMsg = $("#pMsg");

const cCode = $<HTMLInputElement>("#cCode");
const cTitle = $<HTMLInputElement>("#cTitle");
const cProf = $<HTMLSelectElement>("#cProf");
const cCap = $<HTMLInputElement>("#cCap");
const cBtn = $<HTMLButtonElement>("#cBtn");
const cMsg = $("#cMsg");
const coursesEl = $("#courses");

const detailEl = $("#detail");
const detailTitle = $("#detailTitle");
const importText = $<HTMLTextAreaElement>("#importText");
const importBtn = $<HTMLButtonElement>("#importBtn");
const importMsg = $("#importMsg");
const codesBtn = $<HTMLButtonElement>("#codesBtn");
const csvBtn = $<HTMLButtonElement>("#csvBtn");
const codesOut = $("#codesOut");
const studentRows = $("#studentRows");

type Course = { id: string; code: string; title: string; professor: string; students: number };
type Code = { universityId: string; fullName: string; code: string };

let selected: Course | null = null;
let lastCodes: Code[] = [];

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
const post = (path: string, data: unknown = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data) });

function showLogin() {
  loginSec.hidden = false;
  appSec.hidden = true;
}

async function showApp(user: { fullName: string; role: string }) {
  if (user.role !== "admin") {
    await post("/auth/logout").catch(() => {});
    showLogin();
    loginErr.textContent = "This account is not an admin.";
    return;
  }
  loginSec.hidden = true;
  appSec.hidden = false;
  whoEl.textContent = user.fullName;
  await Promise.all([loadProfessors(), loadCourses()]);
}

async function loadProfessors() {
  const { users } = await api("/admin/users?role=professor");
  cProf.replaceChildren(
    ...users.map((u: any) => {
      const o = document.createElement("option");
      o.value = u.id;
      o.textContent = `${u.university_id} – ${u.full_name}`;
      return o;
    }),
  );
}

async function loadCourses() {
  const { courses } = await api("/admin/courses");
  coursesEl.replaceChildren(
    ...courses.map((c: Course) => {
      const li = document.createElement("li");
      li.style.margin = "0.4rem 0";
      li.append(`${c.code} – ${c.title} (${c.professor}, ${c.students} students)  `);
      const b = document.createElement("button");
      b.textContent = "Open";
      b.addEventListener("click", () => selectCourse(c));
      li.append(b);
      return li;
    }),
  );
}

async function selectCourse(c: Course) {
  selected = c;
  detailEl.hidden = false;
  detailTitle.textContent = `${c.code} – ${c.title}`;
  codesOut.textContent = "";
  csvBtn.hidden = true;
  importMsg.textContent = "";
  await loadStudents();
}

function td(text: string) {
  const el = document.createElement("td");
  el.textContent = text;
  return el;
}

async function loadStudents() {
  if (!selected) return;
  const { students } = await api(`/admin/courses/${selected.id}/students`);
  studentRows.replaceChildren(
    ...students.map((s: any) => {
      const tr = document.createElement("tr");
      tr.append(
        td(s.university_id),
        td(s.full_name),
        td(s.has_device ? "yes" : "–"),
        td(s.has_pending_code ? "yes" : "–"),
      );
      const last = document.createElement("td");
      const b = document.createElement("button");
      b.textContent = "New code";
      b.addEventListener("click", async () => {
        try {
          const { code } = await post(`/admin/users/${s.id}/enrollment-code`);
          codesOut.textContent = `${s.university_id}  ${s.full_name}  ${code}`;
          lastCodes = [{ universityId: s.university_id, fullName: s.full_name, code }];
          csvBtn.hidden = false;
          await loadStudents();
        } catch (e) {
          codesOut.textContent = `Error: ${(e as Error).message}`;
        }
      });
      last.append(b);
      tr.append(last);
      return tr;
    }),
  );
}

function parseStudents(text: string) {
  const out: { universityId: string; fullName: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.search(/[,;\t]/);
    if (i < 0) {
      out.push({ universityId: line, fullName: "" });
    } else {
      out.push({ universityId: line.slice(0, i).trim(), fullName: line.slice(i + 1).trim() });
    }
  }
  return out;
}

loginBtn.addEventListener("click", async () => {
  loginErr.textContent = "";
  try {
    const user = await post("/auth/login", { universityId: uidEl.value.trim(), password: pwEl.value });
    pwEl.value = "";
    await showApp(user);
  } catch (e) {
    loginErr.textContent = `Login failed: ${(e as Error).message}`;
  }
});

logoutBtn.addEventListener("click", async () => {
  await post("/auth/logout").catch(() => {});
  selected = null;
  detailEl.hidden = true;
  showLogin();
});

pBtn.addEventListener("click", async () => {
  try {
    await post("/admin/people", {
      universityId: pUid.value,
      fullName: pName.value,
      role: pRole.value,
      password: pPw.value,
    });
    pMsg.textContent = `Added ${pUid.value} (${pRole.value}).`;
    if (pRole.value === "professor") await loadProfessors();
    pUid.value = pName.value = pPw.value = "";
  } catch (e) {
    pMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

cBtn.addEventListener("click", async () => {
  try {
    const course = await post("/admin/courses", {
      code: cCode.value.trim(),
      title: cTitle.value.trim(),
      professorId: cProf.value,
    });
    if (cCap.value !== "") {
      await post(`/admin/courses/${course.id}/capacity`, { roomCapacity: Number(cCap.value) });
    }
    cMsg.textContent = `Created ${cCode.value}.`;
    cCode.value = cTitle.value = cCap.value = "";
    await loadCourses();
  } catch (e) {
    cMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

importBtn.addEventListener("click", async () => {
  if (!selected) return;
  try {
    const r = await post(`/admin/courses/${selected.id}/import`, {
      students: parseStudents(importText.value),
    });
    importMsg.textContent =
      `New accounts: ${r.created}, already existing: ${r.existing}, newly enrolled: ${r.enrolled}` +
      (r.skipped.length ? `, skipped: ${r.skipped.join(", ")}` : "");
    importText.value = "";
    await Promise.all([loadStudents(), loadCourses()]);
  } catch (e) {
    importMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

codesBtn.addEventListener("click", async () => {
  if (!selected) return;
  try {
    const { codes } = await post(`/admin/courses/${selected.id}/enrollment-codes`);
    lastCodes = codes;
    codesOut.textContent = codes.length
      ? codes.map((c: Code) => `${c.universityId}  ${c.fullName}  ${c.code}`).join("\n")
      : "Every student already has a device.";
    csvBtn.hidden = codes.length === 0;
    await loadStudents();
  } catch (e) {
    codesOut.textContent = `Error: ${(e as Error).message}`;
  }
});

csvBtn.addEventListener("click", () => {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv =
    "university_id,full_name,code\n" +
    lastCodes.map((c) => [q(c.universityId), q(c.fullName), q(c.code)].join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "enrollment-codes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

api("/auth/me")
  .then(showApp)
  .catch(() => showLogin());
