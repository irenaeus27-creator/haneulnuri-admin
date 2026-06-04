"use client";

import { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { formatKstDate, formatKstDateTime } from "@/lib/formatDateTime";
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

function actionLabel(value: unknown) {
  const raw = text(value);
  const map: Record<string, string> = {
    addBooking: "예약 등록",
    updateBooking: "예약 수정",
    approveBooking: "예약 승인",
    cancelBooking: "예약 취소",
    approveUser: "회원 승인",
    rejectUser: "회원 거절",
    addAircraft: "항공기 등록",
    updateAircraft: "항공기 수정",
    addNotification: "알림 발송",
  };
  return map[raw] || raw || "작업";
}

export default function LogsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [logType, setLogType] = useState("전체");
  const [from, setFrom] = useState("2026-05-19");
  const [to, setTo] = useState("2026-05-26");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetchJson("/api/logs");
    setRows(Array.isArray(data.logs) ? data.logs : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const types = ["전체", ...Array.from(new Set(rows.map((r)=>actionLabel(r.action)).filter(Boolean)))];
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      const d = normalizeDate(row.createdAt);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (logType !== "전체" && actionLabel(row.action) !== logType) return false;
      if (!q) return true;
      return [row.userName, row.userId, row.action, row.targetSheet, row.targetId, row.message, row.data, row.ip].map((v)=>text(v).toLowerCase()).join(" ").includes(q);
    });
  }, [rows, keyword, logType, from, to]);

  return (
    <PageContainer title="로그관리" description="시스템 로그를 확인하세요.">
      <ContentCard className="p-6">
        <div className="grid items-end gap-4 xl:grid-cols-[1.4fr_220px_1fr_170px]">
          <div className="grid gap-3 md:grid-cols-[1fr_24px_1fr]">
            <label className="ui-label"><span>기간</span><input className="ui-input" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></label>
            <div className="flex items-end justify-center pb-3 text-[#6f8199]">~</div>
            <label className="ui-label"><span className="opacity-0">종료</span><input className="ui-input" type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></label>
          </div>
          <label className="ui-label"><span>로그 유형</span><select className="ui-input" value={logType} onChange={(e)=>setLogType(e.target.value)}>{types.map((t)=><option key={t}>{t}</option>)}</select></label>
          <label className="ui-label"><span>내용 검색</span><input className="ui-input" value={keyword} onChange={(e)=>setKeyword(e.target.value)} placeholder="내용을 입력하세요" /></label>
          <button className="ui-btn ui-btn-primary h-[46px]">↓ 로그 다운로드</button>
        </div>
      </ContentCard>
      <ContentCard className="overflow-hidden p-0">
        <div className="overflow-x-auto p-6">
          <table className="ui-table min-w-[1180px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead><tr><th>시간 ↕</th><th>사용자</th><th>작업</th><th>대상</th><th>내용</th><th>IP</th><th>상태</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filtered.map((row, i)=>(
                <tr key={text(row.logId) || i}>
                  <td>{formatKstDate(row.createdAt)} {formatKstDateTime(row.createdAt).slice(11)}</td>
                  <td><div className="font-black text-[#10213f]">{text(row.userName || row.userId, "관리자")}</div><div className="text-xs text-[#6f8199]">{text(row.userId)}</div></td>
                  <td><span className={`ui-badge ${badgeClass(actionLabel(row.action))}`}>{actionLabel(row.action)}</span></td>
                  <td>{text(row.targetId || row.targetSheet, "-")}</td>
                  <td className="max-w-[420px]">{text(row.message || row.data, "-")}</td>
                  <td>{text(row.ip, "-")}</td>
                  <td><span className={`ui-badge ${badgeClass(row.status || "성공")}`}>{text(row.status || "성공")}</span></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? <tr><td colSpan={7} className="text-center text-[#6f8199]">표시할 로그가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 pb-6"><span className="text-sm font-black text-[#536985]">전체 {filtered.length}건</span><select className="ui-page-size"><option>10 / 페이지</option></select></div>
      </ContentCard>
    </PageContainer>
  );
}
