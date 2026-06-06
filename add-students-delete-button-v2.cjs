const fs = require("fs");

const pageFile = "src/app/students/page.tsx";
const routeFile = "src/app/api/students/route.ts";

if (!fs.existsSync(pageFile)) throw new Error("Missing src/app/students/page.tsx");
if (!fs.existsSync(routeFile)) throw new Error("Missing src/app/api/students/route.ts");

let page = fs.readFileSync(pageFile, "utf8");
let route = fs.readFileSync(routeFile, "utf8");

function fail(label) {
  throw new Error(label);
}

/* ------------------------------------------------------------
 * API: deleteStudent
 * ------------------------------------------------------------ */
if (!route.includes("async function deleteStudent(")) {
  const deleteFn = `
async function deleteStudent(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = getStudentId(data);

  if (!studentId) {
    throw new Error("studentId가 필요합니다.");
  }

  const confirmName = text(data.confirmName || data.confirm_name);
  const requestedName = text(data.name || data.studentName || data.student_name);

  const { data: existing, error: findError } = await supabase
    .from("students")
    .select("student_id,name,user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!existing) throw new Error("삭제할 교육생을 찾지 못했습니다.");

  const existingRow = existing as JsonRecord;
  const existingName = text(existingRow.name);

  if (!confirmName) {
    throw new Error("삭제 확인을 위해 교육생 이름을 입력해야 합니다.");
  }

  if (confirmName !== existingName) {
    throw new Error("입력한 이름이 교육생 이름과 일치하지 않습니다.");
  }

  if (requestedName && requestedName !== existingName) {
    throw new Error("삭제 요청 정보가 현재 교육생 정보와 일치하지 않습니다. 새로고침 후 다시 시도하세요.");
  }

  const { error } = await supabase
    .from("students")
    .delete()
    .eq("student_id", studentId);

  if (error) throw new Error(error.message);

  return {
    studentId,
    name: existingName,
    userId: text(existingRow.user_id),
  };
}

`;

  const marker = "async function handlePost(body: JsonRecord)";
  const index = route.indexOf(marker);
  if (index === -1) fail("Could not find handlePost in students route.");
  route = route.slice(0, index) + deleteFn + route.slice(index);
}

if (!route.includes('action === "deleteStudent"')) {
  const updateBranchMarker = `  if (
    action === "update" ||
    action === "updateStudent"`;

  const index = route.indexOf(updateBranchMarker);
  if (index === -1) fail("Could not find update branch marker in students route.");

  const deleteBranch = `  if (
    action === "delete" ||
    action === "deleteStudent" ||
    action === "removeStudent" ||
    action === "deleteRow"
  ) {
    const deleted = await deleteStudent(data);
    return { message: "교육생을 삭제했습니다.", deleted, data: deleted };
  }

`;

  route = route.slice(0, index) + deleteBranch + route.slice(index);
}

/* ------------------------------------------------------------
 * UI: delete state
 * ------------------------------------------------------------ */
if (!page.includes("deleteTargetStudent")) {
  const savingRegex = /const\s+\[saving,\s*setSaving\]\s*=\s*useState\((false|true)\);/;
  const match = page.match(savingRegex);
  if (!match) fail("Could not find saving useState in students page.");

  page = page.replace(
    savingRegex,
    `const [saving, setSaving] = useState($1);
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<StudentRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);`
  );
}

/* ------------------------------------------------------------
 * UI: delete handlers
 * ------------------------------------------------------------ */
if (!page.includes("function openDeleteStudent(")) {
  const startEditRegex = /function\s+startEdit\(row:\s*StudentRow\)\s*\{[\s\S]*?\n\s*\}/;
  const match = page.match(startEditRegex);
  if (!match) fail("Could not find startEdit(row: StudentRow) block.");

  const handlers = `${match[0]}

  function openDeleteStudent(row: StudentRow) {
    setDeleteTargetStudent(row);
    setDeleteConfirmName("");
    setOperationMessage("");
  }

  function closeDeleteStudent() {
    if (deleting) return;
    setDeleteTargetStudent(null);
    setDeleteConfirmName("");
  }

  async function handleDeleteStudent() {
    if (!deleteTargetStudent || deleting) return;

    const studentId = text(deleteTargetStudent.studentId || deleteTargetStudent.student_id);
    const studentName = text(deleteTargetStudent.name);

    if (!studentId) {
      alert("삭제할 교육생 ID를 찾지 못했습니다.");
      return;
    }

    if (!studentName) {
      alert("삭제 확인에 사용할 교육생 이름을 찾지 못했습니다.");
      return;
    }

    if (deleteConfirmName.trim() !== studentName) {
      alert("삭제 확인 이름이 일치하지 않습니다.");
      return;
    }

    setDeleting(true);
    setOperationMessage("교육생을 삭제하는 중입니다...");

    try {
      const response = await fetch("/api/students?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteStudent",
          data: {
            studentId,
            name: studentName,
            confirmName: deleteConfirmName.trim(),
          },
        }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      const data = JSON.parse(rawText) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "교육생 삭제에 실패했습니다.");

      setDeleteTargetStudent(null);
      setDeleteConfirmName("");
      await loadData(true, true);
      alert("교육생을 삭제했습니다.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "교육생 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
      setOperationMessage("");
    }
  }`;

  page = page.replace(startEditRegex, handlers);
}

/* ------------------------------------------------------------
 * UI: add delete button next to table edit button
 * ------------------------------------------------------------ */
if (!page.includes("onClick={() => openDeleteStudent(item)}")) {
  const exactEditButton = `<button type="button" onClick={() => startEdit(item)} className="ui-btn ui-btn-outline h-9 min-w-[64px] px-3 text-[12px]">수정</button>`;
  const deleteButton = `<button type="button" onClick={() => openDeleteStudent(item)} className="ui-btn h-9 min-w-[64px] border border-red-100 bg-red-50 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-100">삭제</button>`;

  if (page.includes(exactEditButton)) {
    page = page.replace(exactEditButton, `${exactEditButton}
                          ${deleteButton}`);
  } else {
    const buttonRegex = /(<button\s+type="button"\s+onClick=\{\(\) => startEdit\(item\)\}\s+className="[^"]*">수정<\/button>)/;
    if (!buttonRegex.test(page)) {
      fail("Could not find the table edit button to add delete button.");
    }
    page = page.replace(buttonRegex, `$1
                          ${deleteButton}`);
  }
}

/* ------------------------------------------------------------
 * UI: delete confirmation modal
 * ------------------------------------------------------------ */
if (!page.includes("삭제하려면 교육생 이름")) {
  const modal = `
      {deleteTargetStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-600">교육생 삭제</p>
                <h2 className="mt-1 text-xl font-bold text-[#10213f]">{text(deleteTargetStudent.name)} 교육생을 삭제할까요?</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#61758f]">
                  이 작업은 교육생 목록에서 해당 교육생 정보를 삭제합니다. 연결된 회원 계정은 삭제하지 않습니다.
                </p>
              </div>
              <button type="button" onClick={closeDeleteStudent} disabled={deleting} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">교육생</span>
                  <span className="font-semibold text-[#10213f]">{text(deleteTargetStudent.name)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">연락처</span>
                  <span className="font-semibold text-[#10213f]">{text(deleteTargetStudent.phone) || "-"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">과정</span>
                  <span className="font-semibold text-[#10213f]">{text(deleteTargetStudent.course) || "-"}</span>
                </div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-[#10213f]">삭제 확인</span>
              <span className="mt-1 block text-xs font-medium text-[#61758f]">
                삭제하려면 교육생 이름 <b>{text(deleteTargetStudent.name)}</b> 을 그대로 입력하세요.
              </span>
              <input
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                disabled={deleting}
                className="mt-2 w-full rounded-2xl border border-[#d9e6f5] px-4 py-3 text-sm font-semibold text-[#10213f] outline-none transition focus:border-[#1264f4] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
                placeholder={text(deleteTargetStudent.name)}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteStudent}
                disabled={deleting}
                className="rounded-full border border-[#d9e6f5] px-4 py-2 text-sm font-semibold text-[#61758f] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                disabled={deleting || deleteConfirmName.trim() !== text(deleteTargetStudent.name)}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
`;

  const closeMain = page.lastIndexOf("</main>");
  if (closeMain === -1) fail("Could not find </main> to insert delete modal.");
  page = page.slice(0, closeMain) + modal + page.slice(closeMain);
}

fs.writeFileSync(pageFile, page, "utf8");
fs.writeFileSync(routeFile, route, "utf8");

console.log("Done: delete button and delete API are installed.");
console.log("");
console.log("Check:");
console.log('Select-String -Path .\\src\\app\\students\\page.tsx -Pattern "openDeleteStudent|삭제하려면 교육생 이름|deleteTargetStudent" -Context 1,2');
console.log("");
console.log("Next:");
console.log("Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue");
console.log("npm run dev");
