"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import StudentTrainingLogDrawer from "@/components/StudentTrainingLogDrawer";
import { formatKstDate } from "@/lib/formatDateTime";

type Row = Record<string, string | number | boolean | null | undefined>;
type SheetResult = { ok?: boolean; rows?: Row[]; students?: Row[]; aircraft?: Row[]; trainingLogs?: Row[] };
type ProgressStatus = "전체" | "교육중" | "수료" | "중단" | "보류" | "대기";

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function numberValue(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function minutesFromHourLike(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;

  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minuteMatch = raw.match(/(\d+)\s*분/);

  if (hourMatch || minuteMatch) {
    return Math.round(Number(hourMatch?.[1] || 0) * 60 + Number(minuteMatch?.[1] || 0));
  }

  const number = numberValue(raw);

  if (!number) return 0;

  // 20 이하 숫자는 보통 "시간"으로 저장된 값으로 봅니다.
  return number <= 20 ? Math.round(number * 60) : Math.round(number);
}

function studentTotalMinutes(student: Row) {
  return (
    minutesFromHourLike(student.totalFlightMinutes) ||
    minutesFromHourLike(student.totalFlightTime) ||
    minutesFromHourLike(student.accumulatedFlightMinutes) ||
    minutesFromHourLike(student.accumulatedFlightTime) ||
    minutesFromHourLike(student.trainingHours) ||
    minutesFromHourLike(student.usedHours)
  );
}

function studentFlightCount(student: Row) {
  return (
    numberValue(student.flightCount) ||
    numberValue(student.totalFlightCount) ||
    numberValue(student.trainingCount) ||
    numberValue(student.completedLessonCount)
  );
}

function formatDuration(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (hour > 0 && minute > 0) return `${hour}시간 ${minute}분`;
  if (hour > 0) return `${hour}시간`;
  return `${minute}분`;
}

function dateKey(value: unknown) {
  const formatted = formatKstDate(value);
  return formatted === "-" ? "" : formatted;
}

function kstTodayDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function parseDateOnlyToUtc(value: unknown) {
  const formatted = dateKey(value);
  const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function daysSinceDate(value: unknown) {
  const date = parseDateOnlyToUtc(value);

  if (!date) return null;

  return Math.max(0, Math.floor((kstTodayDate().getTime() - date.getTime()) / 86_400_000));
}

function formatDaysSince(value: unknown) {
  const days = daysSinceDate(value);

  if (days === null) return "비행기록 확인 필요";
  if (days === 0) return "오늘 비행";
  if (days === 1) return "1일 경과";
  return `${days}일 경과`;
}

async function fetchStudentsData(): Promise<{ students: Row[]; aircraft: Row[]; trainingLogs: Row[] }> {
  const response = await fetch("/api/students", { method: "GET", cache: "no-store" });
  const data = (await response.json()) as SheetResult;

  if (!response.ok || data.ok === false) {
    return { students: [], aircraft: [], trainingLogs: [] };
  }

  return {
    students: Array.isArray(data.students) ? data.students : [],
    aircraft: Array.isArray(data.aircraft) ? data.aircraft : [],
    trainingLogs: Array.isArray(data.trainingLogs) ? data.trainingLogs : [],
  };
}

function splitIds(value: unknown) {
  return text(value)
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function aircraftLabel(row: Row) {
  return text(row.registrationNo || row.aircraftName || row.aircraftId) || "항공기";
}

function aircraftLookupRows(aircraft: Row[]) {
  const map = new Map<string, string>();

  aircraft.forEach((row) => {
    const label = aircraftLabel(row);

    [row.aircraftId, row.aircraftName, row.registrationNo]
      .map((value) => text(value))
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, label);
      });
  });

  return map;
}

function aircraftTextFromValue(value: unknown, aircraft: Row[]) {
  const ids = splitIds(value);
  if (ids.length === 0) return "";

  const lookup = aircraftLookupRows(aircraft);

  return ids.map((id) => lookup.get(id) || id).join(", ");
}

function badgeClass(status: string) {
  if (status === "교육중") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "수료") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "보류" || status === "대기") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "중단") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function SummaryCard({ title, value, tone }: { title: string; value: string | number; tone: string }) {
  return (
    <ContentCard className="p-5">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19V5" />
            <path d="M4 19h16" />
            <path d="M8 16v-5" />
            <path d="M12 16V8" />
            <path d="M16 16v-3" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-black text-[#36506d]">{title}</div>
          <div className="mt-1 text-[28px] font-black leading-none text-[#10213f]">{value}</div>
        </div>
      </div>
    </ContentCard>
  );
}

export default function TrainingProgressPage() {
  const [students, setStudents] = useState<Row[]>([]);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [trainingLogs, setTrainingLogs] = useState<Row[]>([]);
  const [selectedLogStudent, setSelectedLogStudent] = useState<Row | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<ProgressStatus>("전체");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchStudentsData();
      setStudents(data.students);
      setAircraft(data.aircraft);
      setTrainingLogs(data.trainingLogs);
      setLoading(false);
    }

    void load();
  }, []);

  const progressRows = useMemo(() =>
    students.map((student, sourceIndex) => {
      const studentId = text(student.studentId);
      const studentName = text(student.name || student.studentName);
      const totalMinutes = studentTotalMinutes(student);
      const flightCount = studentFlightCount(student);
      const instructor = text(student.assignedInstructorName || student.instructorName, "-");
      const aircraftNames =
        aircraftTextFromValue(student.assignedAircraftIds || student.assignedAircraft || student.aircraftIds, aircraft) ||
        text(student.assignedAircraftName || student.aircraftName, "-");
      const currentStatus = text(student.trainingStatus || "교육중");
      const stage = text(student.trainingStage || student.course || "교육");
      const lastFlightDate = text(student.lastFlightDate || student.recentFlightDate || student.lastTrainingDate);

      return {
        id: studentId || studentName,
        studentId,
        name: studentName,
        phone: text(student.phone),
        course: text(student.course || "교육"),
        stage,
        status: currentStatus,
        instructor,
        aircraft: aircraftNames || "-",
        flightCount,
        totalMinutes,
        lastFlightDate: dateKey(lastFlightDate),
        daysSinceLastFlight: formatDaysSince(lastFlightDate),
        sourceIndex,
      };
    }),
    [students, aircraft],
  );

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return progressRows.filter((row) => {
      const matchesStatus = status === "전체" || row.status === status;
      const matchesKeyword =
        !query ||
        [row.name, row.phone, row.course, row.stage, row.instructor, row.aircraft]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesKeyword;
    });
  }, [keyword, progressRows, status]);

  const summary = useMemo(() => {
    const totalMinutes = filteredRows.reduce((sum, row) => sum + row.totalMinutes, 0);
    const active = filteredRows.filter((row) => row.status === "교육중").length;
    const completed = filteredRows.filter((row) => row.status === "수료").length;
    const stopped = filteredRows.filter((row) => ["중단", "보류"].includes(row.status)).length;

    return { totalMinutes, active, completed, stopped };
  }, [filteredRows]);

  return (
    <PageContainer title="교육 진행현황" description="비행일지 대신 students 시트의 누적 비행시간, 횟수, 교육 단계, 담당 교관, 배정 항공기를 기준으로 표시합니다.">
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <SummaryCard title="표시 교육생" value={`${filteredRows.length}명`} tone="bg-blue-50 text-blue-600" />
        <SummaryCard title="교육중" value={`${summary.active}명`} tone="bg-emerald-50 text-emerald-600" />
        <SummaryCard title="수료 / 중단" value={`${summary.completed} / ${summary.stopped}`} tone="bg-violet-50 text-violet-600" />
        <SummaryCard title="누적 비행시간" value={formatDuration(summary.totalMinutes)} tone="bg-amber-50 text-amber-600" />
      </div>

      <ContentCard className="p-5">
        <div className="grid gap-3 xl:grid-cols-[220px_minmax(320px,1fr)] md:grid-cols-2">
          <select value={status} onChange={(event) => setStatus(event.target.value as ProgressStatus)} className="ui-input">
            <option value="전체">전체 상태</option>
            <option value="교육중">교육중</option>
            <option value="수료">수료</option>
            <option value="보류">보류</option>
            <option value="중단">중단</option>
            <option value="대기">대기</option>
          </select>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="교육생, 과정, 교관, 항공기 검색" className="ui-input" />
        </div>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-black text-[#10213f]">교육 진행현황 목록</h2>
            <p className="mt-1 text-sm font-bold text-[#6f8199]">students 시트의 누적값을 기준으로 표시됩니다.</p>
          </div>
          <span className="ui-badge bg-[#f4f8fd] text-[#526a89] border-[#dbe5f1]">표시 {filteredRows.length}건</span>
        </div>

        <div className="overflow-x-auto px-6 pb-6">
          <table className="ui-table min-w-[1120px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead>
              <tr>
                <th>교육생</th>
                <th>교육 단계</th>
                <th>상태</th>
                <th>누적 비행</th>
                <th>비행횟수</th>
                <th>최근 비행날짜</th>
                <th>담당 교관</th>
                <th>배정 항공기</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filteredRows.length === 0 ? <tr><td colSpan={9} className="text-center text-[#6f8199]">표시할 교육생이 없습니다.</td></tr> : null}
              {!loading && filteredRows.map((row, rowIndex) => (
                <tr key={`${row.id || "student"}-${row.studentId || row.name || "row"}-${rowIndex}`}>
                  <td>
                    <div className="font-black text-[#10213f]">{row.name || "-"}</div>
                    <div className="mt-1 text-xs font-bold text-[#6f8199]">{formatPhone(row.phone) || row.studentId || "-"}</div>
                  </td>
                  <td>{row.stage}</td>
                  <td><span className={`ui-badge ${badgeClass(row.status)}`}>{row.status}</span></td>
                  <td>{formatDuration(row.totalMinutes)}</td>
                  <td>{row.flightCount}회</td>
                  <td>
                    <div className="font-black text-[#10213f]">{row.lastFlightDate || "최근 비행 없음"}</div>
                    <div className={`mt-1 max-w-[260px] truncate text-xs font-bold ${row.lastFlightDate ? "text-[#6f8199]" : "text-orange-500"}`}>{row.daysSinceLastFlight}</div>
                  </td>
                  <td>{row.instructor}</td>
                  <td>{row.aircraft}</td>
                  <td className="text-right"><button type="button" onClick={() => setSelectedLogStudent(students[numberValue(row.sourceIndex)] || null)} className="ui-btn ui-btn-primary h-10">비행일지 보기</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>

      <StudentTrainingLogDrawer
        student={selectedLogStudent}
        trainingLogs={trainingLogs}
        onClose={() => setSelectedLogStudent(null)}
      />
    </PageContainer>
  );
}
