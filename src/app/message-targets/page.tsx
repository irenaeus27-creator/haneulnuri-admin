"use client";

import { useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import { formatKstDate, formatKstTime } from "@/lib/formatDateTime";
import { formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

type Row = Record<string, string | number | boolean | null | undefined>;
type SheetResult = { ok?: boolean; rows?: Row[]; message?: string };
type TargetType = "bookingChanged" | "bookingCancelled";

type TargetItem = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: string;
  date: string;
  detail: string;
  message: string;
};

const targetOptions: { value: TargetType; label: string; description: string }[] = [
  { value: "bookingChanged", label: "예약변경 알림", description: "예약 변경 안내 대상자를 선택하고 문구를 확인합니다." },
  { value: "bookingCancelled", label: "취소 알림", description: "취소/취소요청/기상취소/반려 상태 예약자를 확인합니다." },
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function displayTargetDate(value: unknown) {
  return formatKstDate(value);
}

function displayTargetTimeRange(start: unknown, end: unknown) {
  const startText = sharedFormatBookingTime(start);
  const endText = sharedFormatBookingTime(end);

  if (startText === "-" && endText === "-") return "-";
  if (startText === "-") return endText;
  if (endText === "-") return startText;

  return `${startText}~${endText}`;
}


async function fetchSheet(sheet: string): Promise<Row[]> {
  const response = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheet)}`, { cache: "no-store" });
  const data = (await response.json()) as SheetResult;
  if (!response.ok || data.ok === false) return [];
  return Array.isArray(data.rows) ? data.rows : [];
}

function badgeClass(value: string) {
  const status = value.replace(/\s/g, "");
  if (["확정", "완료"].includes(status)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["예정", "요청"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["취소요청"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["취소", "반려", "기상취소", "노쇼"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function MessageTargetsPage() {
  const [bookings, setBookings] = useState<Row[]>([]);
  const [selectedType, setSelectedType] = useState<TargetType>("bookingChanged");
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "status" | "category">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showAll, setShowAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const bookingRows = await fetchSheet("bookings");
      setBookings(bookingRows);
      setLoading(false);
    }
    void load();
  }, []);

  const targets = useMemo<TargetItem[]>(() => {
    if (selectedType === "bookingCancelled") {
      return bookings
        .filter((row) => ["취소", "취소요청", "기상취소", "반려"].includes(text(row.status)))
        .map((row) => ({
          id: text(row.bookingId),
          name: text(row.userName || row.name),
          phone: text(row.phone),
          category: text(row.bookingType || row.courseName || "예약"),
          status: text(row.status),
          date: displayTargetDate(row.bookingDate),
          detail: `${displayTargetTimeRange(row.startTime, row.endTime)} / ${text(row.aircraftName || row.aircraftId)}`,
          message: `[하늘누리] ${displayTargetDate(row.bookingDate)} ${sharedFormatBookingTime(row.startTime)} 예약이 ${text(row.status)} 처리되었습니다.`,
        }));
    }

    return bookings
      .filter((row) => ["요청", "예정", "확정"].includes(text(row.status)))
      .map((row) => ({
        id: text(row.bookingId),
        name: text(row.userName || row.name),
        phone: text(row.phone),
        category: text(row.bookingType || row.courseName || "예약"),
        status: text(row.status),
        date: displayTargetDate(row.bookingDate),
        detail: `${sharedFormatBookingTime(row.startTime)}~${sharedFormatBookingTime(row.endTime)} / ${text(row.instructorName)} / ${text(row.aircraftName || row.aircraftId)}`,
        message: `[하늘누리] 예약 정보가 변경되었습니다. ${displayTargetDate(row.bookingDate)} ${sharedFormatBookingTime(row.startTime)} 확인 부탁드립니다.`,
      }));
  }, [bookings, selectedType]);

  const filteredTargets = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    let rows = targets.filter((target) => {
      if (!showAll) return true;
      return true;
    });
    if (query) {
      rows = rows.filter((target) => [target.name, target.phone, target.category, target.status, target.detail].join(" ").toLowerCase().includes(query));
    }
    rows = [...rows].sort((a, b) => {
      const av = sortKey === "date" ? a.date : sortKey === "status" ? a.status : a.category;
      const bv = sortKey === "date" ? b.date : sortKey === "status" ? b.status : b.category;
      return sortDirection === "asc" ? av.localeCompare(bv, "ko") : bv.localeCompare(av, "ko");
    });
    return rows;
  }, [targets, keyword, sortKey, sortDirection, showAll]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedType, keyword, sortKey, sortDirection, showAll]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  function toggleAllVisible() {
    const visibleIds = filteredTargets.map((item) => item.id).filter(Boolean);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])));
  }

  const selectedInfo = targetOptions.find((item) => item.value === selectedType) || targetOptions[0];
  const visibleSelectedCount = filteredTargets.filter((item) => selectedIds.includes(item.id)).length;

  return (
    <PageContainer title="문자/알림" description="실제 문자·카카오 연동 전, 예약변경/취소알림 대상자를 선택하고 발송 문구를 확인합니다.">
      <ContentCard className="p-5">
        <div className="grid gap-4 xl:grid-cols-[280px_280px_280px_minmax(280px,1fr)_260px] md:grid-cols-2">
          <label className="ui-label"><span>알림 구분</span><select className="ui-input" value={selectedType} onChange={(e) => setSelectedType(e.target.value as TargetType)}>{targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="ui-label"><span>정렬 기준</span><select className="ui-input" value={sortKey} onChange={(e) => setSortKey(e.target.value as "date" | "status" | "category")}><option value="date">기준일</option><option value="status">상태</option><option value="category">구분</option></select></label>
          <label className="ui-label"><span>정렬 방향</span><select className="ui-input" value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")}><option value="asc">오름차순</option><option value="desc">내림차순</option></select></label>
          <label className="ui-label"><span>검색</span><input className="ui-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="이름, 연락처, 예약유형, 상태 검색" /></label>
          <div className="flex items-end"><button type="button" onClick={() => setShowAll((prev) => !prev)} className="ui-btn ui-btn-outline h-[46px] w-full">{showAll ? "기본 보기" : "모두 보기"}</button></div>
        </div>
      </ContentCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ContentCard className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div>
              <h2 className="text-[18px] font-black text-[#10213f]">대상자 목록</h2>
              <p className="mt-1 text-sm font-bold text-[#6f8199]">선택 {visibleSelectedCount}명 / 표시 {filteredTargets.length}명</p>
            </div>
            <button type="button" className="ui-btn ui-btn-outline" onClick={toggleAllVisible}>전체 선택</button>
          </div>
          <div className="overflow-x-auto px-6 pb-6">
            <table className="ui-table min-w-[980px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
              <thead>
                <tr>
                  <th className="w-[70px]">선택</th>
                  <th>구분</th>
                  <th>대상자</th>
                  <th>상태</th>
                  <th>기준일</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
                {!loading && filteredTargets.length === 0 ? <tr><td colSpan={6} className="text-center text-[#6f8199]">표시할 대상자가 없습니다.</td></tr> : null}
                {!loading && filteredTargets.map((target) => (
                  <tr key={`${target.id}-${target.name}-${displayTargetDate(target.date)}`}>
                    <td><input type="checkbox" checked={selectedIds.includes(target.id)} onChange={() => toggleOne(target.id)} /></td>
                    <td>{target.category || "-"}</td>
                    <td><div className="font-black text-[#10213f]">{target.name || "-"}</div><div className="mt-1 text-xs font-bold text-[#6f8199]">{target.phone || "-"}</div></td>
                    <td><span className={`ui-badge ${badgeClass(target.status || "-")}`}>{target.status || "-"}</span></td>
                    <td>{displayTargetDate(target.date)}</td>
                    <td>{target.detail || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContentCard>

        <div className="space-y-5">
          <ContentCard className="p-5">
            <h2 className="text-[18px] font-black text-[#10213f]">선택 발송 준비</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[#6f8199]">아직 실제 발송은 하지 않습니다. 선택된 사람에게 보낼 문구를 확인하는 영역입니다.</p>
            <div className="mt-5 rounded-2xl bg-[#f7faff] p-4">
              <div className="text-sm font-black text-[#395270]">선택 인원</div>
              <div className="mt-2 text-[34px] font-black leading-none text-[#10213f]">{selectedIds.length}명</div>
            </div>
            <button type="button" disabled={selectedIds.length === 0} className={`mt-5 w-full rounded-2xl px-4 py-4 text-sm font-black ${selectedIds.length === 0 ? "bg-[#a8adb7] text-white" : "bg-[#1264f4] text-white shadow-[0_10px_24px_rgba(18,100,244,0.2)]"}`}>선택 대상 알림 발송 준비</button>
          </ContentCard>

          <ContentCard className="p-5">
            <div className="text-[18px] font-black text-[#10213f]">예시 발송 문구</div>
            <div className="mt-3 rounded-2xl border border-[#dbe5f1] bg-white p-4 text-sm font-bold leading-6 text-[#4a617d]">
              {selectedIds.length > 0 ? (filteredTargets.find((item) => item.id === selectedIds[0])?.message || selectedInfo.description) : selectedInfo.description}
            </div>
          </ContentCard>
        </div>
      </div>
    </PageContainer>
  );
}
