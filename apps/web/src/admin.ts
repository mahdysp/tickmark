const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const loginSec = $("#login");
const appSec = $("#app");
const uidEl = $<HTMLInputElement>("#uid");
const pwEl = $<HTMLInputElement>("#pw");
const loginBtn = $<HTMLButtonElement>("#loginBtn");
const loginErr = $("#loginErr");
const whoEl = $("#who");
const logoutBtn = $<HTMLButtonElement>("#logout");

const pId = $<HTMLInputElement>("#pId");
const pName = $<HTMLInputElement>("#pName");
const pPw = $<HTMLInputElement>("#pPw");
const addProf = $<HTMLButtonElement>("#addProf");
const profMsg = $("#profMsg");
const profsEl = $("#profs");

const cCode = $<HTMLInputElement>("#cCode");
const cTitle = $<HTMLInputElement>("#cTitle");
const profSelect = $<HTMLSelectElement>("#profSelect");
const cCap = $<HTMLInputElement>("#cCap");
const addCourse = $<HTMLButtonElement>("#addCourse");
const courseMsg = $("#courseMsg");
const coursesEl = $("#courses");

const manageSec = $("#manage");
const manageTitle = $("#manageTitle");
const importText = $<HTMLTextAreaElement>("#importText");
const importBtn = $<HTMLButtonElement>("#importBtn");
const importMsg = $("#importMsg");
const codeMsg = $("#codeMsg");
const studentsEl = $("#students");

let current: { id: string; code: string; title: string } | null = null;

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
    loginErr.textContent = "This page is for administrators only.";
    return showLogin();
  }
  loginSec.hidden = true;
  appSec.hidden = false;
  whoEl.textContent = user.fullName;
  await Promise.all([loadProfs(), loadCourses()]);
}

async function loadProfs() {
  const { users } = await api("/admin/users?role=professor");
  profsEl.replaceChildren(
    ...users.map((u: any) => {
      const li = document.createElement("li");
      li.textContent = `${u.university_id} – ${u.full_name}${u.has_password ? "" : " (no password)"}`;
      return li;
    }),
  );
  profSelect.replaceChildren(
    ...users.map((u: any) => {
      const o = document.createElement("option");
      o.value = u.id;
      o.textContent = `${u.full_name} (${u.university_id})`;
      return o;
    }),
  );
}

async function loadCourses() {
  const { courses } = await api("/admin/courses");
  coursesEl.replaceChildren(
    ...courses.map((c: any) => {
      const li = document.createElement("li");
      li.style.margin = "0.4rem 0";
      li.append(
        `${c.code} – ${c.title} | ${c.professor_name} | ${c.enrolled} students | capacity ${c.room_capacity ?? "-"}  `,
      );
      const b = document.createElement("button");
      b.textContent = "Manage";
      b.addEventListener("click", () => manage(c));
      li.append(b);
      return li;
    }),
  );
}

async function manage(c: { id: string; code: string; title: string }) {
  current = c;
  manageSec.hidden = false;
  manageTitle.textContent = `${c.code} – ${c.title}`;
  importMsg.textContent = "";
  codeMsg.textContent = "";
  await loadStudents();
}

async function loadStudents() {
  if (!current) return;
  const { students } = await api(`/admin/courses/${current.id}/students`);
  studentsEl.replaceChildren(
    ...students.map((s: any) => {
      const tr = document.createElement("tr");
      for (const text of [s.university_id, s.full_name, s.has_device ? "registered" : "not yet"]) {
        const td = document.createElement("td");
        td.style.padding = "0.4rem 0.2rem";
        td.textContent = text;
        tr.append(td);
      }
      const td = document.createElement("td");
      const b = document.createElement("button");
      b.textContent = "Enrollment code";
      b.addEventListener("click", async () => {
        try {
          const { code } = await post(`/admin/users/${s.id}/enrollment-code`);
          codeMsg.textContent = `Enrollment code for ${s.full_name}: ${code} (valid 24 h)`;
        } catch (e) {
          codeMsg.textContent = `Error: ${(e as Error).message}`;
        }
      });
      td.append(b);
      tr.append(td);
      return tr;
    }),
  );
}

loginBtn.addEventListener("click", async () => {
  loginErr.textContent = "";
  try {
    const user = await post("/auth/login", {
      universityId: uidEl.value.trim(),
      password: pwEl.value,
    });
    pwEl.value = "";
    await showApp(user);
  } catch (e) {
    loginErr.textContent = `Login failed: ${(e as Error).message}`;
  }
});

logoutBtn.addEventListener("click", async () => {
  await post("/auth/logout").catch(() => {});
  showLogin();
});

addProf.addEventListener("click", async () => {
  profMsg.textContent = "";
  try {
    await post("/admin/professors", {
      universityId: pId.value,
      fullName: pName.value,
      password: pPw.value,
    });
    pId.value = pName.value = pPw.value = "";
    profMsg.textContent = "Professor added.";
    await loadProfs();
  } catch (e) {
    profMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

addCourse.addEventListener("click", async () => {
  courseMsg.textContent = "";
  try {
    const { id } = await post("/admin/courses", {
      code: cCode.value.trim(),
      title: cTitle.value.trim(),
      professorId: profSelect.value,
    });
    if (cCap.value !== "") {
      await post(`/admin/courses/${id}/capacity`, { roomCapacity: Number(cCap.value) });
    }
    cCode.value = cTitle.value = cCap.value = "";
    courseMsg.textContent = "Course added.";
    await loadCourses();
  } catch (e) {
    courseMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

importBtn.addEventListener("click", async () => {
  if (!current) return;
  const students = importText.value
    .split("\n")
    .map((line) => line.match(/^\s*([^,\t]+?)\s*[,\t]\s*(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ universityId: m[1], fullName: m[2] }));
  if (students.length === 0) {
    importMsg.textContent = 'Nothing to import. Use one "id, name" per line.';
    return;
  }
  try {
    const r = await post(`/admin/courses/${current.id}/import-students`, { students });
    importMsg.textContent = `Created ${r.created}, enrolled ${r.enrolled}, skipped ${r.skipped}.`;
    importText.value = "";
    await Promise.all([loadStudents(), loadCourses()]);
  } catch (e) {
    importMsg.textContent = `Error: ${(e as Error).message}`;
  }
});

api("/auth/me")
  .then(showApp)
  .catch(() => showLogin());
