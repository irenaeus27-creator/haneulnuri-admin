"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | boolean | null | undefined>;
type ApiResult = {
  ok?: boolean;
  message?: string;
  managedFiles?: Row[];
  instructors?: Row[];
  aircraft?: Row[];
  documentAgreements?: Row[];
  aircraftMaintenance?: Row[];
  users?: Row[];
  settings?: Row[];
};
type FileAssetCounts = {
  total: number;
  instructor: number;
  aircraft: number;
  documents: number;
  maintenance: number;
};

type FileType = "교관 프로필 사진" | "항공기 사진" | "서약서 파일" | "계약서 파일" | "정비 증빙 파일" | "기타";
type TargetType = "instructor" | "aircraft" | "documentAgreement" | "contract" | "aircraftMaintenance" | "user" | "other";

const fileTypeOptions: FileType[] = ["교관 프로필 사진", "항공기 사진", "서약서 파일", "계약서 파일", "정비 증빙 파일", "기타"];
const targetTypeOptions: { value: TargetType; label: string }[] = [
  { value: "instructor", label: "교관" },
  { value: "aircraft", label: "항공기" },
  { value: "documentAgreement", label: "서약서/문서" },
  { value: "contract", label: "계약서" },
  { value: "aircraftMaintenance", label: "정비/점검" },
  { value: "user", label: "회원" },
  { value: "other", label: "기타" },
];
const statusOptions = ["사용", "대기", "교체", "보관", "비활성"];

function text(value: unknown) { return String(value ?? "").trim(); }
function isImageUrl(url: string) { return /\.(png|jpg|jpeg|webp|gif)(\?|#|$)/i.test(url); }
function targetLabel(value: string) { return targetTypeOptions.find((item) => item.value === value)?.label || value || "기타"; }
function settingValues(settings: Row[], key: string, fallback: string[]) {
  const values = settings.filter((row) => text(row.key) === key).map((row) => text(row.value)).filter(Boolean);
  return values.length ? values : fallback;
}

const emptyForm = {
  fileId: "",
  targetType: "instructor",
  targetId: "",
  targetName: "",
  fileType: "교관 프로필 사진",
  fileUrl: "",
  status: "사용",
  memo: "",
};

export default function FileAssetsPage() {
  const [files, setFiles] = useState<Row[]>([]);
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [maintenance, setMaintenance] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [keyword, setKeyword] = useState("");
  const [fileType, setFileType] = useState("전체");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/file-assets", { cache: "no-store" });
    const data = (await response.json()) as ApiResult;
    setFiles(Array.isArray(data.managedFiles) ? data.managedFiles : []);
    setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
    setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    setDocuments(Array.isArray(data.documentAgreements) ? data.documentAgreements : []);
    setMaintenance(Array.isArray(data.aircraftMaintenance) ? data.aircraftMaintenance : []);
    setUsers(Array.isArray(data.users) ? data.users : []);
    setSettings(Array.isArray(data.settings) ? data.settings : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const dynamicFileTypes = settingValues(settings, "managedFileType", fileTypeOptions);
  const dynamicStatuses = settingValues(settings, "managedFileStatus", statusOptions);

  const targetOptions = useMemo(() => {
    if (form.targetType === "instructor") {
      return instructors.map((item) => ({ id: text(item.instructorId), name: text(item.name || item.instructorName) })).filter((item) => item.id || item.name);
    }
    if (form.targetType === "aircraft") {
      return aircraft.map((item) => ({ id: text(item.aircraftId), name: text(item.aircraftName || item.registrationNo) })).filter((item) => item.id || item.name);
    }
    if (form.targetType === "documentAgreement") {
      return documents.map((item) => ({ id: text(item.documentId), name: `${text(item.userName)} ${text(item.documentType)}`.trim() })).filter((item) => item.id || item.name);
    }
    if (form.targetType === "aircraftMaintenance") {
      return maintenance.map((item) => ({ id: text(item.maintenanceId), name: `${text(item.aircraftName)} ${text(item.maintenanceType)}`.trim() })).filter((item) => item.id || item.name);
    }
    if (form.targetType === "user") {
      return users.map((item) => ({ id: text(item.userId), name: text(item.name || item.userName) })).filter((item) => item.id || item.name);
    }
    return [];
  }, [form.targetType, instructors, aircraft, documents, maintenance, users]);

  const filteredFiles = files.filter((row) => {
    const key = `${text(row.fileId)} ${text(row.targetType)} ${text(row.targetName)} ${text(row.fileType)} ${text(row.status)} ${text(row.memo)}`.toLowerCase();
    const matchesKeyword = !keyword || key.includes(keyword.toLowerCase());
    const matchesType = fileType === "전체" || text(row.fileType) === fileType;
    return matchesKeyword && matchesType;
  });

  const counts = files.reduce<FileAssetCounts>(
    (acc, row) => {
      acc.total += 1;
      if (text(row.fileType) === "교관 프로필 사진") acc.instructor += 1;
      if (text(row.fileType) === "항공기 사진") acc.aircraft += 1;
      if (text(row.fileType).includes("서약서") || text(row.fileType).includes("계약서")) acc.documents += 1;
      if (text(row.fileType).includes("정비")) acc.maintenance += 1;
      return acc;
    },
    { total: 0, instructor: 0, aircraft: 0, documents: 0, maintenance: 0 }
  );

  function chooseTarget(value: string) {
    const item = targetOptions.find((option) => option.id === value || option.name === value);
    setForm((prev) => ({ ...prev, targetId: item?.id || "", targetName: item?.name || value }));
  }

  function editFile(row: Row) {
    setForm({
      fileId: text(row.fileId),
      targetType: text(row.targetType) || "other",
      targetId: text(row.targetId),
      targetName: text(row.targetName),
      fileType: text(row.fileType) || "기타",
      fileUrl: text(row.fileUrl),
      status: text(row.status) || "사용",
      memo: text(row.memo),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const mode = form.fileId ? "update" : "add";
    const response = await fetch("/api/file-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, data: form }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok || data.ok === false) {
      setMessage(data.message || "저장하지 못했습니다.");
      return;
    }
    setMessage("저장되었습니다.");
    setForm(emptyForm);
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">File & Photo URL</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">파일/사진 URL 관리</h1>
          <p className="mt-2 text-sm text-slate-500">교관 프로필 사진, 항공기 사진, 서약서, 계약서, 정비 증빙 파일 URL을 관리합니다.</p>
        </div>

        <section className="grid gap-4 md:grid-cols-5">
          {[
            ["전체 파일", counts.total],
            ["교관 사진", counts.instructor],
            ["항공기 사진", counts.aircraft],
            ["문서/계약", counts.documents],
            ["정비 증빙", counts.maintenance],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </section>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <select value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              {dynamicFileTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targetId: "", targetName: "" })} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              {targetTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            {targetOptions.length > 0 ? (
              <select value={form.targetId || form.targetName} onChange={(e) => chooseTarget(e.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">대상 선택</option>
                {targetOptions.map((item) => <option key={item.id || item.name} value={item.id || item.name}>{item.name} {item.id ? `(${item.id})` : ""}</option>)}
              </select>
            ) : (
              <input value={form.targetName} onChange={(e) => setForm({ ...form, targetName: e.target.value })} placeholder="대상명 직접 입력" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            )}
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              {dynamicStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="파일 또는 사진 URL" className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:col-span-3" required />
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="메모" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <div className="flex gap-2 md:col-span-4">
              <button disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">{form.fileId ? "수정 저장" : "URL 등록"}</button>
              {form.fileId && <button type="button" onClick={() => setForm(emptyForm)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">취소</button>}
            </div>
          </div>
          {message && <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p>}
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="대상명, 파일종류, 메모 검색" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <option value="전체">전체 파일종류</option>
              {dynamicFileTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button onClick={load} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">새로고침</button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">불러오는 중입니다.</div>
          ) : filteredFiles.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">등록된 파일 URL이 없습니다.</div>
          ) : filteredFiles.map((row) => {
            const url = text(row.fileUrl);
            return (
              <article key={text(row.fileId) || url} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-xs font-semibold text-slate-400">
                    {isImageUrl(url) ? <img src={url} alt={text(row.targetName)} className="h-full w-full object-cover" /> : "FILE"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{text(row.fileType) || "기타"}</span>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{targetLabel(text(row.targetType))}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{text(row.status) || "사용"}</span>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-bold text-slate-900">{text(row.targetName) || "대상 없음"}</h2>
                    <p className="mt-1 break-all text-xs text-slate-500">{url || "URL 없음"}</p>
                    {text(row.memo) && <p className="mt-2 text-sm text-slate-600">{text(row.memo)}</p>}
                    <div className="mt-4 flex gap-2">
                      {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white">열기</a>}
                      <button onClick={() => editFile(row)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">수정</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
