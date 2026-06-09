"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SummaryRow = {
  name: string;
  count: number;
  minutes: number;
  settlementMinutes: number;
};

type FlightRecord = {
  source: "training_logs" | "flight_records";
  id: string;
  bookingId: string;
  flightDate: string;
  flightType: string;
  targetName: string;
  instructorName: string;
  aircraftName: string;
  startTime: string;
  endTime: string;
  actualMinutes: number;
  settlementMinutes: number;
  content: string;
  publicMemo: string;
  internalMemo: string;
  cautionNotes: string;
  nextPlan: string;
  status: string;
};

type MissingRecord = {
  bookingId: string;
  flightDate: string;
  flightType: string;
  targetName: string;
  instructorName: string;
  aircraftName: string;
  startTime: string;
  endTime: string;
  scheduledMinutes: number;
  status: string;
};

type NoteRow = {
  type: string;
  memo: string;
  record: FlightRecord;
};

type SquawkRow = {
  maintenanceId: string;
  aircraftName: string;
  inspectionDate: string;
  status: string;
  memo: string;
};

type DailyCheck = {
  reportDate?: string;
  checkedBy?: string;
  checkedAt?: string;
  memo?: string;
};

type DailyReport = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  date: string;
  records: FlightRecord[];
  missingRecords: MissingRecord[];
  summaries: {
    totalCount: number;
    totalMinutes: number;
    missingCount: number;
    byType: SummaryRow[];
    byInstructor: SummaryRow[];
    byAircraft: SummaryRow[];
    noInstructor: { count: number; minutes: number };
  };
  notes: NoteRow[];
  unresolvedSquawks: SquawkRow[];
  check: DailyCheck | null;
};

function todayText() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function text(value: unknown, fallback = "-") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function formatMinutes(minutes: number) {
  const safe = Number.isFinite(minutes) ? minutes : 0;
  if (!safe) return "0.0h";
  return `${(safe / 60).toFixed(1)}h`;
}

function formatMinutesDetail(minutes: number) {
  const safe = Number.isFinite(minutes) ? minutes : 0;
  if (!safe) return "0분";
  if (safe % 60 === 0) return `${safe / 60}시간`;
  if (safe < 60) return `${safe}분`;
  return `${Math.floor(safe / 60)}시간 ${safe % 60}분`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  const week = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${year}년 ${String(month).padStart(2, "0")}월 ${String(day).padStart(2, "0")}일 (${week})`;
}

function formatDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function timeRange(startTime: string, endTime: string) {
  if (!startTime && !endTime) return "-";
  return `${startTime || "-"}${endTime ? `~${endTime}` : ""}`;
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#d9e4f2] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <p className="text-[12px] font-medium text-[#6d7f96]">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#102544]">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[11px] font-medium text-[#8a9bb1]">{sub}</p>
      ) : null}
    </div>
  );
}

export default function DailyFlightReportPage() {
  const [date, setDate] = useState(todayText());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkedBy, setCheckedBy] = useState("대표");
  const [checkMemo, setCheckMemo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryDate = params.get("date");
    if (queryDate) setDate(queryDate);
  }, []);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/training-logs/daily-report?date=${encodeURIComponent(date)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const raw = await response.text();
      const data = JSON.parse(raw || "{}");

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message || "일일 비행기록 보고서를 불러오지 못했습니다.",
        );
      }

      setReport(data as DailyReport);
      setCheckedBy(text(data.check?.checkedBy, "대표"));
      setCheckMemo(String(data.check?.memo || ""));
    } catch (err) {
      setReport(null);
      setError(
        err instanceof Error
          ? err.message
          : "일일 비행기록 보고서를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const sortedRecords = useMemo(() => report?.records || [], [report]);

  async function confirmReport() {
    if (!report) return;
    try {
      setSaving(true);
      const response = await fetch("/api/training-logs/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirmDailyReport",
          data: { reportDate: date, checkedBy, memo: checkMemo },
        }),
      });
      const raw = await response.text();
      const data = JSON.parse(raw || "{}");
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "대표 확인 처리에 실패했습니다.");
      }
      await loadReport();
      alert("대표 확인 완료 처리했습니다.");
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "대표 확인 처리에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef3f8] px-5 py-5 text-[#102544] print:bg-white print:px-0 print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          aside, nav, button, input, textarea, .no-print { display: none !important; }
          body { background: #fff !important; }
          .report-shell { max-width: none !important; padding: 0 !important; }
          .report-paper { width: 100% !important; box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>

      <div className="report-shell mx-auto flex max-w-[1040px] flex-col gap-4 print:max-w-none">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d4dfed] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/training-logs"
              className="inline-flex h-10 items-center rounded-xl border border-[#cfdbea] bg-white px-4 text-[13px] font-semibold text-[#28486d] hover:bg-[#f7faff]"
            >
              ← 비행기록으로 돌아가기
            </a>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 rounded-xl border border-[#cfdbea] bg-white px-3 text-[13px] font-medium text-[#102544] outline-none focus:border-[#1264f4] focus:ring-2 focus:ring-[#1264f4]/15"
            />
            <button
              type="button"
              onClick={() => void loadReport()}
              className="h-10 rounded-xl border border-[#cfdbea] bg-white px-4 text-[13px] font-semibold text-[#28486d] hover:bg-[#f7faff]"
            >
              새로고침
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 rounded-xl bg-[#102544] px-4 text-[13px] font-semibold text-white shadow-[0_8px_16px_rgba(16,37,68,0.18)] hover:bg-[#19375e]"
          >
            인쇄 / PDF 저장
          </button>
        </div>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] font-semibold text-rose-700">
            {error}
          </section>
        ) : null}
        {loading ? (
          <section className="rounded-2xl border border-[#d9e4f2] bg-white p-8 text-center text-[13px] font-medium text-[#6d7f96]">
            보고서를 불러오는 중입니다.
          </section>
        ) : null}

        {report && !loading ? (
          <article className="report-paper bg-white px-8 py-8 shadow-[0_18px_50px_rgba(15,23,42,0.10)] ring-1 ring-[#d4dfed] print:ring-0">
            <header className="border-b-2 border-[#102544] pb-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6d7f96]">
                    SKYNURI FLIGHT SCHOOL
                  </p>
                  <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#102544]">
                    일일 비행기록 보고서
                  </h1>
                  <p className="mt-2 text-[13px] font-medium text-[#53677f]">
                    예약 기준 비행기록 작성 현황, 실제 비행 실적, 미작성 항목 및
                    특이사항을 확인하기 위한 내부 운영 보고서
                  </p>
                </div>
                <div className="min-w-[180px] border border-[#102544] text-center text-[12px]">
                  <div className="border-b border-[#102544] bg-[#f3f6fa] py-2 font-semibold">
                    대표 확인
                  </div>
                  <div className="grid grid-cols-2 border-b border-[#102544]">
                    <div className="border-r border-[#102544] py-2 text-[#53677f]">
                      확인자
                    </div>
                    <div className="py-2 font-semibold">
                      {text(report.check?.checkedBy || checkedBy)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2">
                    <div className="border-r border-[#102544] py-2 text-[#53677f]">
                      상태
                    </div>
                    <div className="py-2 font-semibold">
                      {report.check?.checkedAt ? "확인완료" : "미확인"}
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <section className="mt-5 print-section">
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  <tr>
                    <ReportMetaHeader>보고일자</ReportMetaHeader>
                    <ReportMetaCell>{formatDateLabel(date)}</ReportMetaCell>
                    <ReportMetaHeader>출력일시</ReportMetaHeader>
                    <ReportMetaCell>
                      {formatDateTime(new Date().toISOString())}
                    </ReportMetaCell>
                  </tr>
                  <tr>
                    <ReportMetaHeader>보고 범위</ReportMetaHeader>
                    <ReportMetaCell>
                      교육·체험·렌탈·동승·기타 비행기록
                    </ReportMetaCell>
                    <ReportMetaHeader>확인일시</ReportMetaHeader>
                    <ReportMetaCell>
                      {report.check?.checkedAt
                        ? formatDateTime(report.check.checkedAt)
                        : "-"}
                    </ReportMetaCell>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mt-5 print-section">
              <SectionTitle title="1. 일일 운영 요약" />
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#f3f6fa]">
                    <FormalTh>총 비행건수</FormalTh>
                    <FormalTh>총 비행시간</FormalTh>
                    <FormalTh>미작성 비행기록</FormalTh>
                    <FormalTh>교관 없는 비행</FormalTh>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <FormalTd strong>{report.summaries.totalCount}건</FormalTd>
                    <FormalTd strong>
                      {formatMinutes(report.summaries.totalMinutes)}{" "}
                      <span className="font-medium text-[#6d7f96]">
                        ({formatMinutesDetail(report.summaries.totalMinutes)})
                      </span>
                    </FormalTd>
                    <FormalTd strong>
                      {report.summaries.missingCount}건
                    </FormalTd>
                    <FormalTd strong>
                      {report.summaries.noInstructor.count}건{" "}
                      <span className="font-medium text-[#6d7f96]">
                        / {formatMinutes(report.summaries.noInstructor.minutes)}
                      </span>
                    </FormalTd>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-3 print-section">
              <ReportSummaryTable
                title="2-1. 비행구분별 요약"
                rows={report.summaries.byType}
              />
              <ReportSummaryTable
                title="2-2. 교관별 비행 실적"
                rows={report.summaries.byInstructor}
                emptyText="교관 실적이 없습니다."
              />
              <ReportSummaryTable
                title="2-3. 항공기별 운항시간"
                rows={report.summaries.byAircraft}
                emptyText="항공기 운항기록이 없습니다."
              />
            </section>

            <section className="mt-6 print-section">
              <SectionTitle
                title="3. 비행기록 상세"
                right={`${sortedRecords.length}건`}
              />
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="bg-[#f3f6fa] text-[#102544]">
                      <FormalTh>시간</FormalTh>
                      <FormalTh>구분</FormalTh>
                      <FormalTh>대상자</FormalTh>
                      <FormalTh>교관</FormalTh>
                      <FormalTh>항공기</FormalTh>
                      <FormalTh>비행시간</FormalTh>
                      <FormalTh>내용/메모</FormalTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.length ? (
                      sortedRecords.map((record) => (
                        <tr
                          key={`${record.source}-${record.id}`}
                          className="align-top"
                        >
                          <FormalTd>
                            {timeRange(record.startTime, record.endTime)}
                          </FormalTd>
                          <FormalTd>{text(record.flightType)}</FormalTd>
                          <FormalTd strong>{text(record.targetName)}</FormalTd>
                          <FormalTd>{text(record.instructorName)}</FormalTd>
                          <FormalTd>{text(record.aircraftName)}</FormalTd>
                          <FormalTd>
                            {formatMinutes(record.actualMinutes)}
                          </FormalTd>
                          <FormalTd className="min-w-[240px] leading-relaxed">
                            {[
                              record.content,
                              record.internalMemo,
                              record.cautionNotes,
                              record.nextPlan,
                            ]
                              .filter(Boolean)
                              .join(" / ") || "-"}
                          </FormalTd>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <FormalTd
                          colSpan={7}
                          className="py-8 text-center text-[#8a9bb1]"
                        >
                          저장된 비행기록이 없습니다.
                        </FormalTd>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2 print-section">
              <ReportListCard
                title="4-1. 미작성 비행기록"
                subtitle="예약은 있으나 비행기록이 저장되지 않은 항목"
                count={report.missingRecords.length}
                tone={report.missingRecords.length ? "warn" : "normal"}
              >
                {report.missingRecords.length ? (
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#f3f6fa]">
                        <FormalTh>시간</FormalTh>
                        <FormalTh>구분</FormalTh>
                        <FormalTh>대상자/교관/항공기</FormalTh>
                      </tr>
                    </thead>
                    <tbody>
                      {report.missingRecords.map((item) => (
                        <tr key={item.bookingId}>
                          <FormalTd>
                            {timeRange(item.startTime, item.endTime)}
                          </FormalTd>
                          <FormalTd>{text(item.flightType)}</FormalTd>
                          <FormalTd>
                            {text(item.targetName)} ·{" "}
                            {text(item.instructorName)} ·{" "}
                            {text(item.aircraftName)}
                          </FormalTd>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyText text="미작성 비행기록이 없습니다." />
                )}
              </ReportListCard>

              <ReportListCard
                title="4-2. 특이사항/메모"
                subtitle="비행기록에 입력된 주요 메모"
                count={report.notes.length}
              >
                {report.notes.length ? (
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#f3f6fa]">
                        <FormalTh>비행</FormalTh>
                        <FormalTh>구분</FormalTh>
                        <FormalTh>내용</FormalTh>
                      </tr>
                    </thead>
                    <tbody>
                      {report.notes.map((item, index) => (
                        <tr key={`${item.record.id}-${item.type}-${index}`}>
                          <FormalTd>
                            {item.record.flightType} ·{" "}
                            {text(item.record.targetName)}
                          </FormalTd>
                          <FormalTd>{item.type}</FormalTd>
                          <FormalTd>{item.memo}</FormalTd>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyText text="등록된 특이사항이 없습니다." />
                )}
              </ReportListCard>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2 print-section">
              <ReportListCard
                title="5. 미해결 Squawk"
                subtitle="Close되지 않은 항공기 결함/정비 항목"
                count={report.unresolvedSquawks.length}
                tone={report.unresolvedSquawks.length ? "warn" : "normal"}
              >
                {report.unresolvedSquawks.length ? (
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#f3f6fa]">
                        <FormalTh>항공기</FormalTh>
                        <FormalTh>상태/일자</FormalTh>
                        <FormalTh>내용</FormalTh>
                      </tr>
                    </thead>
                    <tbody>
                      {report.unresolvedSquawks.map((item) => (
                        <tr
                          key={
                            item.maintenanceId ||
                            `${item.aircraftName}-${item.inspectionDate}`
                          }
                        >
                          <FormalTd>{text(item.aircraftName)}</FormalTd>
                          <FormalTd>
                            {text(item.status)} · {text(item.inspectionDate)}
                          </FormalTd>
                          <FormalTd>{item.memo || "-"}</FormalTd>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyText text="미해결 Squawk가 없습니다." />
                )}
              </ReportListCard>

              <section className="border border-[#102544] bg-white">
                <div className="border-b border-[#102544] bg-[#f3f6fa] px-3 py-2 text-[13px] font-semibold text-[#102544]">
                  6. 대표 확인 및 검토 의견
                </div>
                {report.check?.checkedAt ? (
                  <div className="border-b border-[#d4dfed] px-3 py-3 text-[12px]">
                    <p className="font-semibold text-[#102544]">
                      {text(report.check.checkedBy)} ·{" "}
                      {formatDateTime(report.check.checkedAt)}
                    </p>
                    {report.check.memo ? (
                      <p className="mt-2 whitespace-pre-line leading-relaxed text-[#53677f]">
                        {report.check.memo}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="border-b border-[#d4dfed] px-3 py-3 text-[12px] text-[#6d7f96]">
                    아직 대표 확인 전입니다.
                  </div>
                )}
                <div className="no-print grid gap-3 p-3">
                  <input
                    value={checkedBy}
                    onChange={(event) => setCheckedBy(event.target.value)}
                    placeholder="확인자"
                    className="h-10 rounded-xl border border-[#cfdbea] px-3 text-[13px] outline-none focus:border-[#1264f4]"
                  />
                  <textarea
                    value={checkMemo}
                    onChange={(event) => setCheckMemo(event.target.value)}
                    placeholder="확인 메모"
                    rows={3}
                    className="rounded-xl border border-[#cfdbea] px-3 py-2 text-[13px] outline-none focus:border-[#1264f4]"
                  />
                  <button
                    type="button"
                    onClick={() => void confirmReport()}
                    disabled={saving}
                    className="h-10 rounded-xl bg-[#102544] px-4 text-[13px] font-semibold text-white hover:bg-[#19375e] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? "저장 중" : "오늘 비행기록 확인 완료"}
                  </button>
                </div>
              </section>
            </section>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b border-[#102544] pb-1">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#102544]">
        {title}
      </h2>
      {right ? (
        <span className="text-[12px] font-semibold text-[#53677f]">
          {right}
        </span>
      ) : null}
    </div>
  );
}

function ReportMetaHeader({ children }: { children: ReactNode }) {
  return (
    <th className="w-[15%] border border-[#102544] bg-[#f3f6fa] px-3 py-2 text-left font-semibold text-[#102544]">
      {children}
    </th>
  );
}

function ReportMetaCell({ children }: { children: ReactNode }) {
  return (
    <td className="w-[35%] border border-[#102544] px-3 py-2 font-medium text-[#28486d]">
      {children}
    </td>
  );
}

function FormalTh({ children }: { children: ReactNode }) {
  return (
    <th className="border border-[#102544] px-3 py-2 text-left font-semibold text-[#102544]">
      {children}
    </th>
  );
}

function FormalTd({
  children,
  strong = false,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  strong?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-[#cfdbea] px-3 py-2 align-top ${strong ? "font-semibold text-[#102544]" : "font-medium text-[#28486d]"} ${className}`}
    >
      {children}
    </td>
  );
}

function ReportSummaryTable({
  title,
  rows,
  emptyText = "표시할 항목이 없습니다.",
}: {
  title: string;
  rows: SummaryRow[];
  emptyText?: string;
}) {
  return (
    <section>
      <SectionTitle title={title} />
      {rows.length ? (
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#f3f6fa]">
              <FormalTh>구분</FormalTh>
              <FormalTh>건수</FormalTh>
              <FormalTh>시간</FormalTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <FormalTd strong>{row.name}</FormalTd>
                <FormalTd>{row.count}건</FormalTd>
                <FormalTd>{formatMinutes(row.minutes)}</FormalTd>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyText text={emptyText} />
      )}
    </section>
  );
}

function ReportListCard({
  title,
  subtitle,
  count,
  tone = "normal",
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone?: "normal" | "warn";
  children: ReactNode;
}) {
  return (
    <section>
      <SectionTitle title={title} right={`${count}건`} />
      <p
        className={`mb-2 text-[11px] font-medium ${tone === "warn" ? "text-amber-700" : "text-[#6d7f96]"}`}
      >
        {subtitle}
      </p>
      {children}
    </section>
  );
}

function EmptyText({ text: label }: { text: string }) {
  return (
    <div className="border border-dashed border-[#cfdbea] bg-[#f8fbff] p-4 text-center text-[12px] font-medium text-[#8a9bb1]">
      {label}
    </div>
  );
}
