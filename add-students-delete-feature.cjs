const fs = require("fs");

const pageFile = "src/app/students/page.tsx";
const routeFile = "src/app/api/students/route.ts";

if (!fs.existsSync(pageFile)) throw new Error("Missing src/app/students/page.tsx");
if (!fs.existsSync(routeFile)) throw new Error("Missing src/app/api/students/route.ts");

let page = fs.readFileSync(pageFile, "utf8");
let route = fs.readFileSync(routeFile, "utf8");

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Could not find target block: ${label}`);
  }
  return source.replace(from, to);
}

function insertBefore(source, marker, insert, label) {
  if (source.includes(insert.trim().split("\n")[0])) {
    return source;
  }
  const index = source.indexOf(marker);
  if (index === -1) throw new Error(`Could not find marker: ${label}`);
  return source.slice(0, index) + insert + source.slice(index);
}

/* ------------------------------------------------------------
 * API: add deleteStudent
 * ------------------------------------------------------------ */

if (!route.includes("async function deleteStudent(")) {
  const deleteFunction = `
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

  route = insertBefore(route, "async function handlePost(body: JsonRecord)", deleteFunction, "handlePost for delete function");
}

if (!route.includes('action === "deleteStudent"')) {
  const handleMarker = `  if (
    action === "update" ||
    action === "updateStudent" ||
    action === "saveStudent" ||
    action === "editStudent" ||
    action === "updateStudentMemo" ||
    action === "updateRow" ||
    !action
  ) {`;

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

  route = insertBefore(route, handleMarker, deleteBranch, "update branch for delete action");
}

/* ------------------------------------------------------------
 * UI: add delete modal state and functions
 * ------------------------------------------------------------ */

// Add delete state near other useState declarations.
if (!page.includes("deleteTargetStudent")) {
  const stateMarker = `  const [saving, setSaving] = useState(false);`;
  const stateInsert = `  const [saving, setSaving] = useState(false);
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<Row | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);`;

  page = replaceOnce(page, stateMarker, stateInsert, "saving state");
}

// Add helper functions before return. Prefer marker before "return (" in component.
if (!page.includes("async function handleDeleteStudent()")) {
  const marker = `  return (`;

  const deleteHandlers = `
  function openDeleteStudent(student: Row) {
    setDeleteTargetStudent(student);
    setDeleteConfirmName("");
    setMessage("");
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
      setMessage("삭제할 교육생 ID를 찾지 못했습니다.");
      return;
    }

    if (!studentName) {
      setMessage("삭제 확인에 사용할 교육생 이름을 찾지 못했습니다.");
      return;
    }

    if (deleteConfirmName.trim() !== studentName) {
      setMessage("삭제 확인 이름이 일치하지 않습니다.");
      return;
    }

    setDeleting(true);
    setMessage("");

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
      setMessage("교육생을 삭제했습니다.");
      await loadData(true, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "교육생 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  }

`;

  page = insertBefore(page, marker, deleteHandlers, "component return for delete handlers");
}

// Add delete button next to existing edit buttons.
// Try common button labels and table/list action areas.
if (!page.includes("openDeleteStudent(student)")) {
  const editButtonPatterns = [
    `<button type="button" onClick={() => startEdit(student)} className="rounded-full border border-[#cfe0f3] px-3 py-1 text-xs font-semibold text-[#2d5f9a] transition hover:bg-[#eef6ff]">수정</button>`,
    `<button type="button" onClick={() => handleEdit(student)} className="rounded-full border border-[#cfe0f3] px-3 py-1 text-xs font-semibold text-[#2d5f9a] transition hover:bg-[#eef6ff]">수정</button>`,
    `<button type="button" onClick={() => startEdit(student)} className="text-[#1264f4]">수정</button>`,
  ];

  let replaced = false;
  for (const pattern of editButtonPatterns) {
    if (page.includes(pattern)) {
      const replacement = `${pattern}
                        <button type="button" onClick={() => openDeleteStudent(student)} className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100">삭제</button>`;
      page = page.replace(pattern, replacement);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // Fallback: place delete button immediately after first startEdit(student) button block using regex.
    const regex = /(<button[^>]+onClick=\{\(\) => startEdit\(student\)\}[^>]*>[\s\S]*?수정[\s\S]*?<\/button>)/;
    if (regex.test(page)) {
      page = page.replace(regex, `$1
                        <button type="button" onClick={() => openDeleteStudent(student)} className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100">삭제</button>`);
      replaced = true;
    }
  }

  if (!replaced) {
    throw new Error("Could not find student edit button area to add delete button. Need current page.tsx snippet.");
  }
}

// Add delete modal before final closing main/container. Insert before "</main>" if present.
if (!page.includes("deleteTargetStudent ? (")) {
  const modal = `
      {deleteTargetStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-600">교육생 삭제</p>
                <h2 className="mt-1 text-xl font-bold text-[#10213f]">{text(deleteTargetStudent.name)} 교육생을 삭제할까요?</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#61758f]">
                  이 작업은 교육생 목록에서 해당 교육생 정보를 삭제합니다. 연결된 회원 계정은 안전을 위해 삭제하지 않습니다.
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

  const mainClose = page.lastIndexOf("</main>");
  if (mainClose !== -1) {
    page = page.slice(0, mainClose) + modal + page.slice(mainClose);
  } else {
    const returnClose = page.lastIndexOf("    </");
    if (returnClose === -1) throw new Error("Could not find place to insert delete modal.");
    page = page.slice(0, returnClose) + modal + page.slice(returnClose);
  }
}

fs.writeFileSync(pageFile, page, "utf8");
fs.writeFileSync(routeFile, route, "utf8");

console.log("Done: student delete feature added.");
console.log("");
console.log("Files modified:");
console.log("- src/app/students/page.tsx");
console.log("- src/app/api/students/route.ts");
console.log("");
console.log("Next:");
console.log("Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue");
console.log("npm run dev");
