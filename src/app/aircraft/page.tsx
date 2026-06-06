"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { formatKstDate as sharedFormatKstDate } from "@/lib/formatDateTime";

type Row = Record<string, unknown>;

type AircraftForm = {
  aircraftId: string;
  aircraftName: string;
  model: string;
  registrationNo: string;
  status: string;
  nextInspectionDate: string;
  active: string;
  memo: string;
};

type InspectionSummary = {
  type: string;
  date: string;
  days: number | null;
};

const fallbackStatuses = ["운항 가능", "점검 중", "정비 대기", "예약 불가", "비활성"];

const emptyForm: AircraftForm = {
  aircraftId: "",
  aircraftName: "",
  model: "",
  registrationNo: "",
  status: "운항 가능",
  nextInspectionDate: "",
  active: "Y",
  memo: "",
};

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatKstDate(value);
  return valueText === "-" ? "" : valueText;
}

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateDiffDays(target: unknown) {
  const dateText = normalizeDate(target);
  if (!dateText) return null;
  const today = new Date(`${todayText()}T00:00:00`);
  const due = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function dDayText(target: unknown) {
  const days = typeof target === "number" ? target : dateDiffDays(target);
  if (days === null) return "-";
  if (days === 0) return "D-Day";
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
}

function dueTone(days: number | null) {
  if (days === null) return "normal";
  if (days < 0) return "overdue";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "normal";
}

function dueBadgeClass(days: number | null) {
  const tone = dueTone(days);
  if (tone === "overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "urgent") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "soon") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function dueTextClass(days: number | null) {
  const tone = dueTone(days);
  if (tone === "overdue") return "text-rose-700";
  if (tone === "urgent") return "text-orange-700";
  if (tone === "soon") return "text-amber-700";
  return "text-[#526a89]";
}

function normalizeStatus(value: unknown) {
  const raw = text(value).replace(/\s/g, "");
  if (raw === "운항가능") return "운항 가능";
  if (raw === "점검중") return "점검 중";
  if (raw === "정비중" || raw === "정비대기") return "정비 대기";
  if (raw === "예약불가") return "예약 불가";
  return text(value) || "운항 가능";
}

function badgeClass(value: unknown) {
  const status = normalizeStatus(value).replace(/\s/g, "");
  if (["운항가능", "사용", "사용가능", "승인", "승인완료", "확정", "완료", "근무중", "성공", "읽음"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (["점검중", "점검완료", "시스템", "회원가입", "항공기수정"].includes(status)) {
    return "bg-violet-50 text-violet-700 border-violet-200";
  }
  if (["정비대기", "요청", "예정", "승인대기", "대기", "휴무", "알림발송"].includes(status)) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (["취소", "반려", "거절", "비활성", "퇴사", "예약불가", "읽지않음", "예약취소"].includes(status)) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function isActive(value: unknown) {
  const raw = text(value).toLowerCase();
  return value === true || raw === "" || raw === "y" || raw === "yes" || raw === "true" || raw === "사용" || raw === "활성";
}

function aircraftId(row: Row) {
  return text(row.aircraftId || row.aircraft_id);
}

function aircraftLabel(row: Row) {
  return text(row.registrationNo || row.registration_no || row.aircraftName || row.aircraft_name || row.aircraftId || row.aircraft_id, "-");
}

function modelLabel(row: Row) {
  return text(row.model, "-");
}

function maintenanceAircraftId(row: Row) {
  return text(row.aircraftId || row.aircraft_id);
}

function maintenanceRegistration(row: Row) {
  return text(row.registrationNo || row.registration_no || row.aircraftName || row.aircraft_name);
}

function maintenanceType(row: Row) {
  const value = text(row.maintenanceType || row.maintenance_type, "다음 점검");
  if (value.includes("일상")) return "다음 점검";
  if (value.includes("결함") || value.includes("Squawk")) return "다음 점검";
  return value;
}

function isPeriodicMaintenance(row: Row) {
  const kind = text(row.recordKind || row.record_kind || row.kind);
  const type = text(row.maintenanceType || row.maintenance_type);
  const memo = text(row.memo);
  if (kind.includes("일상") || type.includes("일상") || memo.includes("기록구분: 일상")) return false;
  if (kind.includes("결함") || type.includes("결함") || type.includes("Squawk") || memo.includes("기록구분: 결함")) return false;
  return Boolean(normalizeDate(row.nextInspectionDate || row.next_inspection_date));
}

function toForm(row: Row): AircraftForm {
  const registrationNo = text(row.registrationNo || row.registration_no || row.aircraftName || row.aircraft_name);
  return {
    aircraftId: text(row.aircraftId || row.aircraft_id),
    aircraftName: text(row.aircraftName || row.aircraft_name || registrationNo),
    model: text(row.model),
    registrationNo,
    status: normalizeStatus(row.status),
    nextInspectionDate: normalizeDate(row.nextInspectionDate || row.next_inspection_date),
    active: isActive(row.active) ? "Y" : "N",
    memo: text(row.memo),
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildSubmitData(form: AircraftForm) {
  const registrationNo = form.registrationNo.trim();
  return {
    ...form,
    aircraftName: registrationNo || form.aircraftName.trim(),
    registrationNo,
    nextInspectionDate: form.nextInspectionDate || "",
  };
}

export default function AircraftPage() {
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [maintenanceRows, setMaintenanceRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [form, setForm] = useState<AircraftForm>(emptyForm);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [activeFilter, setActiveFilter] = useState("전체");
  const [dueFilter, setDueFilter] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isEdit = Boolean(form.aircraftId);

  async function load() {
    setLoading(true);
    const [aircraftData, maintenanceData] = await Promise.allSettled([fetchJson("/api/aircraft"), fetchJson("/api/aircraft-maintenance")]);
    if (aircraftData.status === "fulfilled") {
      setAircraft(Array.isArray(aircraftData.value.aircraft) ? aircraftData.value.aircraft : []);
      setSettings(Array.isArray(aircraftData.value.settings) ? aircraftData.value.settings : []);
    }
    if (maintenanceData.status === "fulfilled") {
      const rows = maintenanceData.value.aircraftMaintenance || maintenanceData.value.aircraft_maintenance || maintenanceData.value.data?.aircraftMaintenance || [];
      setMaintenanceRows(Array.isArray(rows) ? rows : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const statuses = useMemo(() => {
    const values = settings
      .filter((row) => text(row.key) === "aircraftStatus")
      .map((row) => normalizeStatus(row.value))
      .filter(Boolean);
    return values.length ? Array.from(new Set(values)) : fallbackStatuses;
  }, [settings]);

  const nextInspectionMap = useMemo(() => {
    const map = new Map<string, InspectionSummary>();
    maintenanceRows
      .filter(isPeriodicMaintenance)
      .forEach((row) => {
        const keys = [maintenanceAircraftId(row), maintenanceRegistration(row)].filter(Boolean);
        const date = normalizeDate(row.nextInspectionDate || row.next_inspection_date);
        if (!date || keys.length === 0) return;
        const summary: InspectionSummary = { type: maintenanceType(row), date, days: dateDiffDays(date) };
        keys.forEach((key) => {
          const before = map.get(key);
          if (!before || date > before.date) map.set(key, summary);
        });
      });
    return map;
  }, [maintenanceRows]);

  function nextInspectionFor(row: Row): InspectionSummary {
    const byId = nextInspectionMap.get(aircraftId(row));
    if (byId) return byId;
    const byRegistration = nextInspectionMap.get(aircraftLabel(row));
    if (byRegistration) return byRegistration;
    const fallbackDate = normalizeDate(row.nextInspectionDate || row.next_inspection_date);
    return { type: fallbackDate ? "다음 점검" : "미입력", date: fallbackDate, days: dateDiffDays(fallbackDate) };
  }

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return aircraft.filter((row) => {
      const status = normalizeStatus(row.status);
      const active = isActive(row.active) ? "Y" : "N";
      const inspection = nextInspectionFor(row);
      if (statusFilter !== "전체" && status !== statusFilter) return false;
      if (activeFilter !== "전체" && active !== activeFilter) return false;
      if (dueFilter === "점검임박" && (inspection.days === null || inspection.days > 30)) return false;
      if (dueFilter === "점검초과" && (inspection.days === null || inspection.days >= 0)) return false;
      if (!q) return true;
      return [row.aircraftId, row.aircraft_id, row.aircraftName, row.aircraft_name, row.model, row.registrationNo, row.registration_no, row.status, row.memo, inspection.type, inspection.date]
        .map((v) => text(v).toLowerCase())
        .join(" ")
        .includes(q);
    });
  }, [aircraft, keyword, statusFilter, activeFilter, dueFilter, nextInspectionMap]);

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
    setErrorMessage("");
  }

  function startEdit(row: Row) {
    setForm(toForm(row));
    setMessage("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = buildSubmitData(form);
      if (!payload.registrationNo) throw new Error("등록부호를 입력하세요.");
      const action = isEdit ? "updateAircraft" : "addAircraft";
      const response = await fetch("/api/aircraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) throw new Error(text(result?.message, "저장에 실패했습니다."));
      setForm(emptyForm);
      setMessage(isEdit ? "항공기 정보를 수정했습니다." : "항공기를 추가했습니다.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row: Row) {
    if (!confirm(`${aircraftLabel(row)} 항공기를 비활성 처리할까요?`)) return;
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = { ...toForm(row), active: "N", status: "비활성" };
      const response = await fetch("/api/aircraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAircraft", data: payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) throw new Error(text(result?.message, "비활성 처리에 실패했습니다."));
      setMessage("비활성 처리했습니다.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "비활성 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer title="항공기관리" description="항공기 기본정보, 운항상태, 다음 점검 정보를 관리합니다.">
      <ContentCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f8199]">Aircraft Basic</p>
            <h2 className="mt-1 text-[19px] font-semibold text-[#10213f]">{isEdit ? "항공기 기본정보 수정" : "항공기 기본정보 등록"}</h2>
            <p className="mt-1.5 text-[12px] leading-5 text-[#6f8199]">등록부호, 기종, 운항상태 중심으로 관리합니다. 다음 점검 종류는 정비관리의 정기 정비 기록에서 자동으로 표시됩니다.</p>
          </div>
          {isEdit ? <span className="ui-badge bg-[#f4f8fd] text-[#526a89] border-[#dbe5f1]">수정 중 · {form.aircraftId}</span> : null}
        </div>

        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
        {errorMessage ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{errorMessage}</div> : null}

        <form onSubmit={submit} className="mt-4 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
          <Field label="등록부호" required>
            <input
              className="ui-input"
              value={form.registrationNo}
              onChange={(event) => setForm({ ...form, registrationNo: event.target.value, aircraftName: event.target.value })}
              placeholder="예: HL-C238"
            />
          </Field>
          <Field label="기종">
            <input className="ui-input" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="예: Bristell Classic" />
          </Field>
          <Field label="상태">
            <select className="ui-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="사용 여부">
            <select className="ui-input" value={form.active} onChange={(event) => setForm({ ...form, active: event.target.value })}>
              <option value="Y">사용</option>
              <option value="N">비활성</option>
            </select>
          </Field>
          <Field label="다음 점검 예정일">
            <input type="date" className="ui-input" value={form.nextInspectionDate} onChange={(event) => setForm({ ...form, nextInspectionDate: event.target.value })} />
          </Field>
          <Field label="관리 메모" className="xl:col-span-3">
            <input className="ui-input" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder="예: 보험 만료 확인 필요, 정비기록 별도 확인 등" />
          </Field>
          <div className="flex flex-wrap gap-2 xl:col-span-4">
            <button className="ui-btn ui-btn-primary" disabled={saving}>{saving ? "저장 중" : isEdit ? "수정 저장" : "+ 항공기 등록"}</button>
            <button type="button" className="ui-btn ui-btn-outline" onClick={resetForm}>초기화</button>
          </div>
        </form>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="border-b border-[#e4edf7] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-[#10213f]">항공기 목록</h2>
              <p className="mt-1 text-[12px] text-[#6f8199]">다음 점검일이 가까워지면 날짜와 D-day 색상이 자동으로 강조됩니다.</p>
            </div>
            <span className="ui-badge bg-[#f4f8fd] text-[#526a89] border-[#dbe5f1]">표시 {filtered.length}건</span>
          </div>
          <div className="mt-4 grid gap-2 xl:grid-cols-[minmax(320px,1fr)_160px_150px_150px] md:grid-cols-2">
            <input className="ui-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="등록부호, 기종, 다음 점검, 메모 검색" />
            <select className="ui-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>전체</option>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select className="ui-input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
              <option value="전체">사용 전체</option>
              <option value="Y">사용</option>
              <option value="N">비활성</option>
            </select>
            <select className="ui-input" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
              <option value="전체">점검일 전체</option>
              <option value="점검임박">30일 이내</option>
              <option value="점검초과">점검일 초과</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto px-5 pb-5 pt-4">
          <table className="ui-table min-w-[1080px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead>
              <tr>
                <th>항공기ID</th>
                <th>등록부호</th>
                <th>기종</th>
                <th>상태</th>
                <th>다음 점검</th>
                <th>D-day</th>
                <th>사용</th>
                <th>메모</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filtered.length === 0 ? <tr><td colSpan={9} className="text-center text-[#6f8199]">표시할 항공기가 없습니다.</td></tr> : null}
              {!loading && filtered.map((row, index) => {
                const active = isActive(row.active);
                const inspection = nextInspectionFor(row);
                return (
                  <tr key={aircraftId(row) || `${aircraftLabel(row)}-${index}`} className={active ? "" : "opacity-60"}>
                    <td className="font-medium text-[#10213f]">{aircraftId(row) || "-"}</td>
                    <td className="font-semibold text-[#10213f]">{aircraftLabel(row)}</td>
                    <td>{modelLabel(row)}</td>
                    <td><span className={`ui-badge ${badgeClass(row.status)}`}>{normalizeStatus(row.status)}</span></td>
                    <td>
                      <div className="leading-5">
                        <p className={`text-[13px] font-semibold ${dueTextClass(inspection.days)}`}>{inspection.type}</p>
                        <p className={`text-[12px] ${dueTextClass(inspection.days)}`}>{inspection.date || "-"}</p>
                      </div>
                    </td>
                    <td><span className={`ui-badge ${dueBadgeClass(inspection.days)}`}>{dDayText(inspection.days)}</span></td>
                    <td><span className={`ui-badge ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{active ? "사용" : "비활성"}</span></td>
                    <td className="max-w-[260px] truncate">{text(row.memo, "-")}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="ui-btn ui-btn-outline" onClick={() => startEdit(row)}>수정</button>
                        {active ? <button type="button" className="ui-btn ui-btn-danger" onClick={() => void deactivate(row)}>비활성</button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`ui-label ${className}`}>
      <span>{label}{required ? <b className="ml-1 text-rose-500">*</b> : null}</span>
      {children}
    </label>
  );
}
