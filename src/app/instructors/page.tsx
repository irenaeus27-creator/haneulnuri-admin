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

type InstructorForm = {
  instructorId: string;
  name: string;
  phone: string;
  email: string;
  licenseNo: string;
  status: string;
  memo: string;
  active: string;
};

const emptyForm: InstructorForm = {
  instructorId: "",
  name: "",
  phone: "",
  email: "",
  licenseNo: "",
  status: "근무중",
  memo: "",
  active: "Y",
};

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [form, setForm] = useState<InstructorForm>(emptyForm);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("전체");
  const [loading, setLoading] = useState(true);
  const isEdit = Boolean(form.instructorId);

  async function load() {
    setLoading(true);
    const data = await fetchJson("/api/instructors");
    setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return instructors.filter((row) => {
      if (status !== "전체" && text(row.status) !== status) return false;
      if (!q) return true;
      return [row.instructorId, row.name, row.phone, row.email, row.licenseNo, row.status].map((v)=>text(v).toLowerCase()).join(" ").includes(q);
    });
  }, [instructors, keyword, status]);

  const active = instructors.filter((r)=>isActive(r.active) && text(r.status) === "근무중").length;
  const off = instructors.filter((r)=>text(r.status) === "휴무").length;
  const inactive = instructors.filter((r)=>!isActive(r.active) || ["비활성","퇴사"].includes(text(r.status))).length;
  const statuses = ["전체", ...Array.from(new Set(instructors.map((r)=>text(r.status)).filter(Boolean)))];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const action = isEdit ? "updateInstructor" : "addInstructor";
    await fetch("/api/instructors", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action, data: form }) });
    setForm(emptyForm);
    await load();
  }

  async function deactivate(row: Row) {
    await fetch("/api/instructors", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action:"updateInstructor", data:{...row, active:"N", status:"비활성"} }) });
    await load();
  }

  return (
    <PageContainer title="교관관리" description="교관 정보 및 상태를 관리하세요.">
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Summary title="전체 교관" value={instructors.length} tone="bg-blue-50 text-blue-600" />
        <Summary title="근무중" value={active} tone="bg-emerald-50 text-emerald-600" />
        <Summary title="휴무" value={off} tone="bg-amber-50 text-amber-600" />
        <Summary title="비활성" value={inactive} tone="bg-slate-100 text-slate-500" />
      </div>

      <ContentCard className="p-6">
        <h2 className="text-xl font-black text-[#10213f]">{isEdit ? "교관 수정" : "교관 추가"}</h2>
        <form onSubmit={submit} className="mt-5 grid gap-4 xl:grid-cols-4">
          <label className="ui-label"><span>교관명</span><input className="ui-input" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} placeholder="예: 김하늘" /></label>
          <label className="ui-label"><span>연락처</span><input className="ui-input" value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} placeholder="예: 010-1234-5678" /></label>
          <label className="ui-label"><span>이메일</span><input className="ui-input" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} placeholder="예: hanul.kim@hanelnuri.ac.kr" /></label>
          <label className="ui-label"><span>면장번호</span><input className="ui-input" value={form.licenseNo} onChange={(e)=>setForm({...form, licenseNo:e.target.value})} placeholder="예: IR-2021-0001" /></label>
          <label className="ui-label"><span>상태</span><select className="ui-input" value={form.status} onChange={(e)=>setForm({...form, status:e.target.value})}><option>근무중</option><option>휴무</option><option>외부일정</option><option>비활성</option></select></label>
          <label className="ui-label xl:col-span-3"><span>메모</span><input className="ui-input" value={form.memo} onChange={(e)=>setForm({...form, memo:e.target.value})} placeholder="메모를 입력하세요 (선택사항)" /></label>
          <div className="flex gap-3 xl:col-span-4"><button className="ui-btn ui-btn-primary">＋ {isEdit ? "수정 저장" : "등록"}</button><button type="button" className="ui-btn ui-btn-outline" onClick={()=>setForm(emptyForm)}>↻ 초기화</button></div>
        </form>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <input className="ui-input min-w-[300px] flex-1" value={keyword} onChange={(e)=>setKeyword(e.target.value)} placeholder="교관명, 이메일, 면장번호 검색" />
          <select className="ui-input w-[180px]" value={status} onChange={(e)=>setStatus(e.target.value)}>{statuses.map((s)=><option key={s}>{s === "전체" ? "상태 전체" : s}</option>)}</select>
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="ui-table min-w-[1120px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead><tr><th>교관ID</th><th>교관명</th><th>연락처</th><th>이메일</th><th>면장번호</th><th>상태</th><th>총 비행시간</th><th className="text-right">관리</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filtered.map((row, i)=>(
                <tr key={text(row.instructorId) || i}>
                  <td className="font-black text-[#10213f]">{text(row.instructorId,"-")}</td>
                  <td><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 font-black text-blue-600">{text(row.name,"?").slice(0,1)}</div><span className="font-black text-[#10213f]">{text(row.name,"-")}</span></div></td>
                  <td>{text(row.phone,"-")}</td>
                  <td>{text(row.email,"-")}</td>
                  <td>{text(row.licenseNo,"-")}</td>
                  <td><span className={`ui-badge ${badgeClass(row.status)}`}>{text(row.status,"-")}</span></td>
                  <td>{text(row.totalFlightTime || row.flightTime, "0")} 시간</td>
                  <td className="text-right"><div className="flex justify-end gap-2"><button className="ui-btn ui-btn-outline" onClick={()=>setForm({instructorId:text(row.instructorId), name:text(row.name), phone:text(row.phone), email:text(row.email), licenseNo:text(row.licenseNo), status:text(row.status)||"근무중", memo:text(row.memo), active:isActive(row.active)?"Y":"N"})}>✎ 수정</button><button className="ui-btn ui-btn-danger" onClick={()=>void deactivate(row)}>비활성화</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}

function Summary({ title, value, tone }: { title: string; value: number; tone: string }) {
  return <ContentCard className="p-6"><div className="flex items-center gap-4"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a5 5 0 0 0-10 0v2"/><circle cx="12" cy="7" r="4"/></svg></div><div><p className="text-[14px] font-black text-[#243b63]">{title}</p><p className="mt-1 text-[32px] font-black leading-none text-[#10213f]">{value}</p></div></div></ContentCard>;
}
