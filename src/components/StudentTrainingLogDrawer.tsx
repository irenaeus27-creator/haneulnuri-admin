"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { useMemo, useState } from "react";

type AnyRow = Record<string, unknown>;

type Props = {
  student: AnyRow | null;
  trainingLogs: AnyRow[];
  onClose: () => void;
};

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function numberValue(value: unknown) {
  const num = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw.slice(0, 10);
}

function normalizeTime(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw.slice(0, 5);
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function formatMinutes(value: unknown) {
  const minutes = numberValue(value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  if (hour > 0 && minute > 0) return `${hour}시간 ${minute}분`;
  if (hour > 0) return `${hour}시간`;
  return `${minute}분`;
}

function boolText(value: unknown) {
  return text(value).toUpperCase() === "TRUE";
}

function logMatchesStudent(log: AnyRow, student: AnyRow) {
  const logStudentId = text(log.studentId);
  const logUserId = text(log.userId);
  const logStudentName = text(log.studentName);
  const studentId = text(student.studentId);
  const userId = text(student.userId);
  const name = text(student.name || student.studentName);

  return Boolean(
    (logStudentId && studentId && logStudentId === studentId) ||
      (logUserId && userId && logUserId === userId) ||
      (!logStudentId && !logUserId && logStudentName && name && logStudentName === name),
  );
}

function logSortKey(log: AnyRow) {
  return `${normalizeDate(log.trainingDate || log.createdAt || log.updatedAt)} ${normalizeTime(log.actualStartTime || log.scheduledStartTime)}`;
}

function statusBadgeClass(status: unknown) {
  const value = text(status);
  if (value === "차감완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "작성완료") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "작성대기") return "border-amber-200 bg-amber-50 text-amber-700";
  if (["취소", "비행없음", "수정필요"].includes(value)) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function withinRecentDays(log: AnyRow, days: number) {
  const date = normalizeDate(log.trainingDate || log.createdAt || log.updatedAt);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const logDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  const diff = Math.floor((today.getTime() - logDate.getTime()) / 86_400_000);

  return diff >= 0 && diff <= days;
}

function joinContent(...values: unknown[]) {
  const genericWords = new Set(["교육", "훈련", "교육비행", "비행교육"]);
  const lines = values
    .flatMap((value) => text(value).split(/\n+/))
    .flatMap((value) => value.split(/[,/]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !genericWords.has(value));

  return Array.from(new Set(lines)).join(" · ");
}

function compactType(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  if (["교육", "훈련", "교육비행", "비행교육"].includes(raw)) return "";
  return raw;
}

export default function StudentTrainingLogDrawer({ student, trainingLogs, onClose }: Props) {
  const [filter, setFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");

  const studentLogs = useMemo(() => {
    if (!student) return [];

    return trainingLogs
      .filter((log) => logMatchesStudent(log, student))
      .sort((a, b) => logSortKey(b).localeCompare(logSortKey(a), "ko"));
  }, [student, trainingLogs]);

  const filteredLogs = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return studentLogs.filter((log) => {
      const status = text(log.status);
      const isPublic = boolText(log.studentVisible);
      const isDeducted = boolText(log.timeDeducted) || status === "차감완료";

      if (filter === "최근 30일" && !withinRecentDays(log, 30)) return false;
      if (filter === "차감완료" && !isDeducted) return false;
      if (filter === "작성완료" && status !== "작성완료") return false;
      if (filter === "학생공개" && !isPublic) return false;
      if (filter === "학생비공개" && isPublic) return false;

      if (!query) return true;

      const searchText = [
        log.trainingDate,
        log.instructorName,
        log.aircraftName,
        log.trainingType,
        log.lessonTitle,
        log.trainingItems,
        log.instructorNotes,
        log.studentNotes,
        log.homework,
        log.cautionNotes,
        log.nextTrainingPlan,
        log.status,
      ]
        .map((value) => text(value))
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });
  }, [filter, keyword, studentLogs]);

  const summary = useMemo(() => {
    const actualMinutes = studentLogs.reduce((sum, log) => sum + numberValue(log.actualFlightMinutes), 0);
    const deductedMinutes = studentLogs.reduce((sum, log) => sum + numberValue(log.deductedMinutes || log.actualFlightMinutes), 0);
    const latestDate = studentLogs[0] ? normalizeDate(studentLogs[0].trainingDate || studentLogs[0].createdAt) : "";

    return { actualMinutes, deductedMinutes, latestDate };
  }, [studentLogs]);

  if (!student) return null;

  const studentName = text(student.name || student.studentName, "교육생");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]">
      <button type="button" aria-label="비행일지 패널 닫기" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative z-10 flex h-full w-full max-w-[800px] flex-col overflow-hidden bg-white shadow-2xl">
        <div className="border-b border-[#e5edf7] bg-[#f8fbff] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-[#1264f4]">교육생 비행일지</div>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[#07172f]">{studentName}</h2>
              <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                {formatPhone(student.phone) || text(student.studentId, "기본정보 없음")} · {studentLogs.length}건 기록
              </p>
            </div>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-outline h-10">닫기</button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#dbe5f1] bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[#6f8199]">전체 일지</div>
              <div className="mt-1.5 text-[15px] font-semibold text-[#07172f]">{studentLogs.length}건</div>
            </div>
            <div className="rounded-xl border border-[#dbe5f1] bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[#6f8199]">실비행 합계</div>
              <div className="mt-1.5 text-[15px] font-semibold text-[#07172f]">{formatMinutes(summary.actualMinutes)}</div>
            </div>
            <div className="rounded-xl border border-[#dbe5f1] bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[#6f8199]">차감 합계</div>
              <div className="mt-1.5 text-[15px] font-semibold text-[#07172f]">{formatMinutes(summary.deductedMinutes)}</div>
            </div>
            <div className="rounded-xl border border-[#dbe5f1] bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[#6f8199]">최근 비행</div>
              <div className="mt-1.5 text-[15px] font-semibold text-[#07172f]">{summary.latestDate || "없음"}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[160px_minmax(240px,1fr)]">
            <select className="ui-input" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="전체">전체 일지</option>
              <option value="최근 30일">최근 30일</option>
              <option value="차감완료">차감완료</option>
              <option value="작성완료">작성완료</option>
              <option value="학생공개">학생공개</option>
              <option value="학생비공개">학생비공개</option>
            </select>
            <input className="ui-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="교육항목, 교관메모, 다음계획, 교관, 항공기 검색" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filteredLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cdd9e8] bg-[#fbfdff] p-6 text-center text-sm font-medium text-[#6f8199]">
              표시할 비행일지가 없습니다.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredLogs.map((log, index) => {
                const trainingDate = normalizeDate(log.trainingDate || log.createdAt);
                const actualStart = normalizeTime(log.actualStartTime || log.scheduledStartTime);
                const actualEnd = normalizeTime(log.actualEndTime || log.scheduledEndTime);
                const content = joinContent(log.trainingItems, log.lessonTitle);
                const typeLabel = compactType(log.trainingType);
                const instructorNotes = text(log.instructorNotes);
                const studentNotes = text(log.studentNotes);
                const nextPlan = text(log.nextTrainingPlan);
                const caution = text(log.cautionNotes);

                return (
                  <article key={`${text(log.trainingLogId, "log")}-${index}`} className="relative rounded-2xl border border-[#dbe5f1] bg-white px-4 py-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-[#07172f]">{trainingDate || "날짜 없음"}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusBadgeClass(log.status)}`}>{text(log.status, "상태 없음")}</span>
                          {boolText(log.studentVisible) ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">학생공개</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">비공개</span>}
                        </div>
                        <div className="mt-1 text-[12px] font-medium text-[#6f8199]">
                          {actualStart || "--:--"} ~ {actualEnd || "--:--"} · {text(log.aircraftName, "항공기 미기록")} · {text(log.instructorName, "교관 미기록")}
                        </div>
                      </div>
                      <div className="text-right text-[12px] font-semibold text-[#10213f]">
                        실비행 {formatMinutes(log.actualFlightMinutes)}
                        <div className="mt-0.5 text-[11px] text-[#6f8199]">차감 {formatMinutes(log.deductedMinutes || log.actualFlightMinutes)}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.35fr]">
                      <div className="rounded-xl bg-[#f8fbff] px-3 py-2.5">
                        <div className="text-[11px] font-semibold text-[#6f8199]">훈련 항목</div>
                        <div className="mt-1 text-[13px] font-medium leading-5 text-[#10213f]">
                          {typeLabel ? <span className="mr-1.5 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#1264f4] ring-1 ring-[#dbe9ff]">{typeLabel}</span> : null}
                          {content || "항목 미기록"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#f8fbff] px-3 py-2.5">
                        <div className="text-[11px] font-semibold text-[#6f8199]">교관 메모</div>
                        <div className="mt-1 whitespace-pre-line text-[13px] font-medium leading-5 text-[#10213f]">{instructorNotes || "메모 없음"}</div>
                      </div>
                    </div>

                    {(studentNotes || caution || nextPlan || text(log.homework)) ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {studentNotes ? <InfoBox title="학생 메모" value={studentNotes} /> : null}
                        {caution ? <InfoBox title="주의사항" value={caution} /> : null}
                        {nextPlan ? <InfoBox title="다음 계획" value={nextPlan} /> : null}
                        {text(log.homework) ? <InfoBox title="과제" value={text(log.homework)} /> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#edf2f8] bg-white px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[#6f8199]">{title}</div>
      <div className="mt-1 whitespace-pre-line text-[13px] font-medium leading-5 text-[#10213f]">{value}</div>
    </div>
  );
}
