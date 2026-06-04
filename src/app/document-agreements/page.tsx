"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";

type Row = Record<string, string | number | boolean | null | undefined>;
type ApiResult = { ok?: boolean; message?: string; documentAgreements?: Row[]; settings?: Row[]; users?: Row[]; aircraft?: Row[] };

const emptyForm = {
  documentId: "",
  userId: "",
  userName: "",
  phone: "",
  documentType: "안전교육 확인서",
  targetType: "공통",
  targetId: "",
  issueDate: "",
  expireDate: "",
  status: "유효",
  fileUrl: "",
  memo: "",
};

const fallbackDocumentTypes = ["안전교육 확인서", "위험고지 동의서", "개인정보 동의서", "PIC 확약서", "렌탈 서약서", "교육계약서", "기타"];
const fallbackTargetTypes = ["공통", "체험비행", "교육비행", "렌탈비행", "자가비행", "항공기", "기타"];
const fallbackStatuses = ["유효", "대기", "만료", "철회", "보완필요"];

function text(value: unknown) { return String(value ?? "").trim(); }
function dateText(value: unknown) { return text(value).substring(0, 10); }
function settingValues(settings: Row[], key: string, fallback: string[]) {
  const seen = new Set<string>();
  const values = settings.filter((row) => text(row.key) === key).map((row) => text(row.value)).filter(Boolean).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return values.length ? values : fallback;
}
function aircraftLabel(row: Row) {
  return [text(row.aircraftName), text(row.registrationNo), text(row.aircraftId)].filter(Boolean).join(" / ") || "항공기";
}
function aircraftValue(row: Row) {
  return text(row.registrationNo) || text(row.aircraftName) || text(row.aircraftId);
}
function userLabel(row: Row) {
  return [text(row.name), text(row.phone), text(row.userId)].filter(Boolean).join(" / ") || "회원";
}
function isExpiringSoon(value: unknown) {
  const date = dateText(value); if (!date) return false;
  const target = new Date(`${date}T00:00:00`); if (Number.isNaN(target.getTime())) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return diff >= 0 && diff <= 30;
}

export default function DocumentAgreementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");

  const documentTypes = useMemo(() => settingValues(settings, "documentType", fallbackDocumentTypes), [settings]);
  const targetTypes = useMemo(() => {
    const values = settingValues(settings, "documentTargetType", fallbackTargetTypes);
    return values.includes("항공기") ? values : [...values, "항공기"];
  }, [settings]);
  const statuses = useMemo(() => settingValues(settings, "documentStatus", fallbackStatuses), [settings]);
  const isEditing = Boolean(form.documentId);

  async function loadData() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/document-agreements", { cache: "no-store" });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.message || "문서 데이터를 불러오지 못했습니다.");
      setRows(Array.isArray(data.documentAgreements) ? data.documentAgreements : []);
      setSettings(Array.isArray(data.settings) ? data.settings : []);
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문서 데이터를 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "userId") {
        const user = users.find((item) => text(item.userId) === value);
        next.userName = text(user?.name);
        next.phone = text(user?.phone);
      }
      if (key === "targetType") next.targetId = "";
      return next;
    });
  }

  function editRow(row: Row) {
    setForm({
      documentId: text(row.documentId),
      userId: text(row.userId),
      userName: text(row.userName) || text(row.name),
      phone: text(row.phone),
      documentType: text(row.documentType) || "안전교육 확인서",
      targetType: text(row.targetType) || "공통",
      targetId: text(row.targetId),
      issueDate: dateText(row.issueDate),
      expireDate: dateText(row.expireDate),
      status: text(row.status) || "유효",
      fileUrl: text(row.fileUrl),
      memo: text(row.memo),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      const response = await fetch("/api/document-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: isEditing ? "update" : "add", data: form }),
      });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.message || "문서 저장에 실패했습니다.");
      await loadData();
      setForm(emptyForm);
      setMessage(isEditing ? "문서가 수정되었습니다. 신규 등록 모드로 전환했습니다." : "문서가 등록되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문서 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((row) => {
    const haystack = [row.userName, row.name, row.phone, row.documentType, row.targetType, row.targetId, row.status, row.memo].map((value) => text(value)).join(" ").toLowerCase();
    return !keyword.trim() || haystack.includes(keyword.trim().toLowerCase());
  });

  return (
    <PageContainer title="문서/서약서관리" description="대상 ID 직접 입력 대신 항공기 선택으로 문서를 연결할 수 있습니다.">
      <ContentCard title={isEditing ? "문서 수정" : "문서 등록"}>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">회원
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.userId} onChange={(e) => updateForm("userId", e.target.value)}>
              <option value="">선택 안 함</option>
              {users.map((user) => <option key={text(user.userId)} value={text(user.userId)}>{userLabel(user)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">문서 종류
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.documentType} onChange={(e) => updateForm("documentType", e.target.value)}>
              {documentTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">적용 대상
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.targetType} onChange={(e) => updateForm("targetType", e.target.value)}>
              {targetTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">대상 선택
            {form.targetType === "항공기" ? (
              <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.targetId} onChange={(e) => updateForm("targetId", e.target.value)}>
                <option value="">항공기 선택</option>
                {aircraft.map((item) => <option key={aircraftValue(item)} value={aircraftValue(item)}>{aircraftLabel(item)}</option>)}
              </select>
            ) : (
              <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.targetId} onChange={(e) => updateForm("targetId", e.target.value)}>
                <option value="">공통/선택 안 함</option>
                <option value={form.targetType}>{form.targetType}</option>
              </select>
            )}
          </label>
          <label className="text-sm font-medium text-slate-700">작성일
            <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.issueDate} onChange={(e) => updateForm("issueDate", e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">만료일
            <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.expireDate} onChange={(e) => updateForm("expireDate", e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">상태
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.status} onChange={(e) => updateForm("status", e.target.value)}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">파일 URL
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.fileUrl} onChange={(e) => updateForm("fileUrl", e.target.value)} placeholder="Google Drive 또는 파일 URL" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">메모
            <textarea className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} />
          </label>
          <div className="md:col-span-2 flex gap-2">
            <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{saving ? "저장 중" : isEditing ? "수정 저장" : "신규 등록"}</button>
            {isEditing ? <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => setForm(emptyForm)}>신규 등록으로 전환</button> : null}
          </div>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </ContentCard>

      <ContentCard title="문서 목록">
        <input className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="회원, 문서, 항공기, 상태 검색" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">회원</th><th className="px-4 py-3">문서</th><th className="px-4 py-3">대상</th><th className="px-4 py-3">만료일</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">관리</th></tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">불러오는 중...</td></tr> : null}
              {!loading && filtered.map((row) => <tr key={text(row.documentId) || `${text(row.userId)}-${text(row.documentType)}`}>
                <td className="px-4 py-3"><div className="font-semibold text-slate-900">{text(row.userName) || text(row.name) || "-"}</div><div className="text-xs text-slate-500">{text(row.phone)}</div></td>
                <td className="px-4 py-3">{text(row.documentType)}</td>
                <td className="px-4 py-3"><div>{text(row.targetType)}</div><div className="text-xs text-slate-500">{text(row.targetId)}</div></td>
                <td className="px-4 py-3">{dateText(row.expireDate) || "-"}{isExpiringSoon(row.expireDate) ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">임박</span> : null}</td>
                <td className="px-4 py-3">{text(row.status)}</td>
                <td className="px-4 py-3"><button onClick={() => editRow(row)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">수정</button></td>
              </tr>)}
              {!loading && filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">표시할 문서가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}
