"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { formatKstDate as sharedFormatKstDate, formatKstTime as sharedFormatKstTime } from "@/lib/formatDateTime";


type Row = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatKstDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatKstTime(value);
  return valueText === "-" ? "" : valueText;
}

function badgeClass(value: unknown) {
  const status = text(value).replace(/\s/g, "");
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
  if (["노쇼", "로그아웃"].includes(status)) {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function isActive(value: unknown) {
  const raw = text(value).toLowerCase();
  return value === true || raw === "" || raw === "y" || raw === "yes" || raw === "true" || raw === "사용" || raw === "활성";
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

type AircraftForm = {
  aircraftId: string;
  aircraftName: string;
  model: string;
  registrationNo: string;
  status: string;
  active: string;
  memo: string;
};

const emptyForm: AircraftForm = {
  aircraftId: "",
  aircraftName: "",
  model: "",
  registrationNo: "",
  status: "운항 가능",
  active: "Y",
  memo: "",
};

const fallbackStatuses = ["운항 가능", "점검 중", "정비 대기", "예약 불가", "비활성"];

function normalizeStatus(value: unknown) {
  const raw = text(value);
  if (raw === "운항가능") return "운항 가능";
  if (raw === "점검중") return "점검 중";
  if (raw === "정비중") return "정비 대기";
  return raw || "운항 가능";
}

function aircraftLabel(row: Row) {
  return text(row.aircraftName || row.registrationNo || row.aircraftId, "-");
}

function toForm(row: Row): AircraftForm {
  return {
    aircraftId: text(row.aircraftId),
    aircraftName: text(row.aircraftName),
    model: text(row.model),
    registrationNo: text(row.registrationNo),
    status: normalizeStatus(row.status),
    active: isActive(row.active) ? "Y" : "N",
    memo: text(row.memo),
  };
}

export default function AircraftPage() {
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [form, setForm] = useState<AircraftForm>(emptyForm);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [activeFilter, setActiveFilter] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(form.aircraftId);

  async function load() {
    setLoading(true);
    const data = await fetchJson("/api/aircraft");
    setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    setSettings(Array.isArray(data.settings) ? data.settings : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const statuses = useMemo(() => {
    const values = settings.filter((row) => text(row.key) === "aircraftStatus").map((row) => normalizeStatus(row.value)).filter(Boolean);
    return values.length ? Array.from(new Set(values)) : fallbackStatuses;
  }, [settings]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return aircraft.filter((row) => {
      const status = normalizeStatus(row.status);
      const active = isActive(row.active) ? "Y" : "N";
      if (statusFilter !== "전체" && status !== statusFilter) return false;
      if (activeFilter !== "전체" && active !== activeFilter) return false;
      if (!q) return true;
      return [row.aircraftId, row.aircraftName, row.model, row.registrationNo, row.status, row.memo].map((v) => text(v).toLowerCase()).join(" ").includes(q);
    });
  }, [aircraft, keyword, statusFilter, activeFilter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const action = isEdit ? "updateAircraft" : "addAircraft";
    await fetch("/api/aircraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data: form }),
    });
    setForm(emptyForm);
    await load();
    setSaving(false);
  }

  async function deactivate(row: Row) {
    setSaving(true);
    await fetch("/api/aircraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateAircraft", data: { ...row, active: "N", status: "비활성" } }),
    });
    await load();
    setSaving(false);
  }

  const activeCount = aircraft.filter((row) => isActive(row.active)).length;
  const inactiveCount = aircraft.length - activeCount;

  return (
    <PageContainer title="항공기관리" description="항공기 추가, 수정, 비활성 처리">
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Summary title="전체 항공기" value={aircraft.length} tone="bg-blue-50 text-blue-600" />
        <Summary title="사용 항공기" value={activeCount} tone="bg-emerald-50 text-emerald-600" />
        <Summary title="비활성 항공기" value={inactiveCount} tone="bg-slate-100 text-slate-500" />
        <Summary title="상태 기준값" value={statuses.length} tone="bg-violet-50 text-violet-600" />
      </div>

      <ContentCard className="p-6">
        <h2 className="text-xl font-black text-[#10213f]">{isEdit ? "항공기 수정" : "항공기 추가"}</h2>
        <form onSubmit={submit} className="mt-5 grid gap-4 xl:grid-cols-4">
          <label className="ui-label"><span>항공기명</span><input className="ui-input" value={form.aircraftName} onChange={(e)=>setForm({...form, aircraftName:e.target.value, registrationNo: form.registrationNo || e.target.value})} placeholder="예: HL-C238" /></label>
          <label className="ui-label"><span>기종</span><input className="ui-input" value={form.model} onChange={(e)=>setForm({...form, model:e.target.value})} placeholder="예: Bristell" /></label>
          <label className="ui-label"><span>등록번호</span><input className="ui-input" value={form.registrationNo} onChange={(e)=>setForm({...form, registrationNo:e.target.value})} placeholder="예: HL-C238" /></label>
          <label className="ui-label"><span>상태</span><select className="ui-input" value={form.status} onChange={(e)=>setForm({...form, status:e.target.value})}>{statuses.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label className="ui-label"><span>사용 여부</span><select className="ui-input" value={form.active} onChange={(e)=>setForm({...form, active:e.target.value})}><option value="Y">사용</option><option value="N">비활성</option></select></label>
          <label className="ui-label xl:col-span-3"><span>메모</span><input className="ui-input" value={form.memo} onChange={(e)=>setForm({...form, memo:e.target.value})} placeholder="특이사항을 입력하세요" /></label>
          <div className="flex gap-3 xl:col-span-4">
            <button className="ui-btn ui-btn-primary" disabled={saving}>＋ {isEdit ? "수정 저장" : "항공기 추가"}</button>
            <button type="button" className="ui-btn ui-btn-outline" onClick={()=>setForm(emptyForm)}>↻ 초기화</button>
          </div>
        </form>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <input className="ui-input min-w-[330px] flex-1" value={keyword} onChange={(e)=>setKeyword(e.target.value)} placeholder="항공기명, 기종, 등록번호 검색" />
          <select className="ui-input w-[170px]" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}><option>전체</option>{statuses.map((s)=><option key={s}>{s}</option>)}</select>
          <select className="ui-input w-[170px]" value={activeFilter} onChange={(e)=>setActiveFilter(e.target.value)}><option value="전체">사용 여부 전체</option><option value="Y">사용</option><option value="N">비활성</option></select>
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="ui-table min-w-[1040px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead><tr><th>항공기ID</th><th>항공기명</th><th>기종</th><th>등록번호</th><th>상태</th><th>다음 점검일</th><th>사용 여부</th><th className="text-right">관리</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filtered.map((row, i)=>(
                <tr key={text(row.aircraftId) || i}>
                  <td className="font-black text-[#10213f]">{text(row.aircraftId)}</td>
                  <td className="font-black text-[#10213f]">{aircraftLabel(row)}</td>
                  <td>{text(row.model)}</td>
                  <td>{text(row.registrationNo || row.aircraftName)}</td>
                  <td><span className={`ui-badge ${badgeClass(normalizeStatus(row.status))}`}>{normalizeStatus(row.status)}</span></td>
                  <td>{normalizeDate(row.nextInspectionDate) || "-"}</td>
                  <td>{isActive(row.active) ? "Y" : "N"}</td>
                  <td className="text-right"><div className="flex justify-end gap-2"><button className="ui-btn ui-btn-outline" onClick={()=>setForm(toForm(row))}>✎ 수정</button><button className="ui-btn ui-btn-danger" onClick={()=>void deactivate(row)}>비활성</button></div></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? <tr><td colSpan={8} className="text-center text-[#6f8199]">표시할 항공기가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}

function Summary({ title, value, tone }: { title: string; value: number; tone: string }) {
  return (
    <ContentCard className="p-6">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="m2 16 20-8-1.5-2-8.5 3L8 3 6 4l3 7-4 1.5-2-2L2 11l2 4-2 1z"/></svg>
        </div>
        <div><p className="text-[14px] font-black text-[#243b63]">{title}</p><p className="mt-1 text-[32px] font-black leading-none text-[#10213f]">{value}</p></div>
      </div>
    </ContentCard>
  );
}
