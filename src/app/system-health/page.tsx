"use client";

import { useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type HealthResponse = {
  ok?: boolean;
  health?: {
    ok?: boolean;
    now?: string;
    spreadsheetName?: string;
    spreadsheetId?: string;
    sheetCount?: number;
    configuredSheetCount?: number;
    existingSheets?: string[];
    missingSheets?: string[];
    elapsedMs?: number;
  };
  sheetMeta?: {
    ok?: boolean;
    elapsedMs?: number;
    sheets?: Record<string, {
      exists?: boolean;
      rows?: number;
      columns?: number;
      dataRows?: number;
      frozenRows?: number;
    }>;
  };
  message?: string;
};

type ActionResult = {
  ok?: boolean;
  result?: {
    ok?: boolean;
    success?: boolean;
    message?: string;
    elapsedMs?: number;
    warmed?: string[];
    errors?: string[];
  };
  message?: string;
};

const SHEET_LABELS: Record<string, string> = {
  bookings: "예약",
  users: "회원",
  students: "교육생",
  instructors: "교관",
  aircraft: "항공기",
  rentalPilots: "렌탈기장",
  courseCatalog: "교육과정",
  instructorSchedules: "교관스케줄",
  trainingCharges: "교육비",
  trainingLogs: "교육일지",
  notifications: "알림",
  logs: "로그",
  settings: "설정",
};

function formatNumber(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue.toLocaleString("ko-KR");
}

function statusBadge(ok?: boolean) {
  return ok
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-rose-100 bg-rose-50 text-rose-700";
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const sheets = useMemo(() => {
    const sheetMap = health?.sheetMeta?.sheets || {};
    return Object.entries(sheetMap).sort(([a], [b]) => a.localeCompare(b, "ko"));
  }, [health]);

  async function runHealthCheck() {
    try {
      setLoading("health");
      setError("");
      const response = await fetch(`/api/health?_ts=${Date.now()}`, { cache: "no-store" });
      const data = (await response.json()) as HealthResponse;

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "상태 점검에 실패했습니다.");
      }

      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 점검에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function runCacheAction(type: "clear" | "warmup") {
    try {
      setLoading(type);
      setError("");
      setActionResult(null);

      const endpoint = type === "clear" ? "/api/cache/clear" : "/api/cache/warmup";
      const response = await fetch(`${endpoint}?_ts=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as ActionResult;

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "캐시 작업에 실패했습니다.");
      }

      setActionResult(data);
      await runHealthCheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : "캐시 작업에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  return (
    <PageContainer title="시스템 점검" description="Apps Script 연결 상태, 시트 규모, 캐시 상태를 점검하고 운영 캐시를 관리합니다.">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ContentCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[#10213f]">운영 점검</h2>
              <p className="mt-1 text-sm font-medium text-[#667b95]">
                연결 상태 확인, 캐시 초기화, 캐시 워밍업을 실행합니다.
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(Boolean(health?.ok))}`}>
              {health?.ok ? "정상" : "미확인"}
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={runHealthCheck}
              disabled={Boolean(loading)}
              className="rounded-2xl bg-[#071a35] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#102a52] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "health" ? "상태 점검 중..." : "상태 점검 실행"}
            </button>

            <button
              type="button"
              onClick={() => runCacheAction("clear")}
              disabled={Boolean(loading)}
              className="rounded-2xl border border-[#d7e2f0] bg-white px-5 py-3 text-sm font-bold text-[#263b55] shadow-sm transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "clear" ? "캐시 초기화 중..." : "Apps Script 캐시 초기화"}
            </button>

            <button
              type="button"
              onClick={() => runCacheAction("warmup")}
              disabled={Boolean(loading)}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "warmup" ? "캐시 워밍업 중..." : "주요 데이터 캐시 워밍업"}
            </button>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          {actionResult ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              {actionResult.result?.message || "작업을 완료했습니다."}
              {typeof actionResult.result?.elapsedMs === "number" ? (
                <span className="ml-2 text-emerald-600">({actionResult.result.elapsedMs}ms)</span>
              ) : null}
              {actionResult.result?.warmed?.length ? (
                <div className="mt-2 text-xs font-medium text-emerald-800">
                  워밍업: {actionResult.result.warmed.join(", ")}
                </div>
              ) : null}
              {actionResult.result?.errors?.length ? (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  일부 오류: {actionResult.result.errors.join(" / ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </ContentCard>

        <ContentCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[#10213f]">연결 정보</h2>
              <p className="mt-1 text-sm font-medium text-[#667b95]">Apps Script와 스프레드시트 상태입니다.</p>
            </div>
          </div>

          {!health ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
              상태 점검을 실행하면 연결 정보가 표시됩니다.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#e6eef8] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold text-[#667b95]">스프레드시트</p>
                <p className="mt-1 truncate text-base font-bold text-[#10213f]">{health.health?.spreadsheetName || "-"}</p>
                <p className="mt-1 truncate text-xs font-medium text-[#7b8da5]">{health.health?.spreadsheetId || "-"}</p>
              </div>
              <div className="rounded-2xl border border-[#e6eef8] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold text-[#667b95]">응답 시간</p>
                <p className="mt-1 text-base font-bold text-[#10213f]">
                  Health {formatNumber(health.health?.elapsedMs)}ms / Meta {formatNumber(health.sheetMeta?.elapsedMs)}ms
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6eef8] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold text-[#667b95]">시트 수</p>
                <p className="mt-1 text-base font-bold text-[#10213f]">
                  {formatNumber(health.health?.sheetCount)}개 / 설정 {formatNumber(health.health?.configuredSheetCount)}개
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6eef8] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold text-[#667b95]">누락 시트</p>
                <p className="mt-1 text-base font-bold text-[#10213f]">
                  {health.health?.missingSheets?.length ? health.health.missingSheets.join(", ") : "없음"}
                </p>
              </div>
            </div>
          )}
        </ContentCard>
      </div>

      <ContentCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#10213f]">시트별 데이터 규모</h2>
            <p className="mt-1 text-sm font-medium text-[#667b95]">행 수가 크게 늘어난 시트는 조회 속도에 영향을 줄 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={Boolean(loading)}
            className="rounded-xl border border-[#d7e2f0] bg-white px-4 py-2 text-xs font-bold text-[#263b55] hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-50"
          >
            새로고침
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="ui-table min-w-[900px]">
            <thead>
              <tr>
                <th>시트</th>
                <th>상태</th>
                <th>전체 행</th>
                <th>데이터 행</th>
                <th>열</th>
                <th>고정 행</th>
              </tr>
            </thead>
            <tbody>
              {sheets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#7b8da5]">
                    상태 점검을 실행하면 시트 정보가 표시됩니다.
                  </td>
                </tr>
              ) : (
                sheets.map(([sheetName, item]) => (
                  <tr key={sheetName}>
                    <td className="font-bold text-[#10213f]">{SHEET_LABELS[sheetName] || sheetName}</td>
                    <td>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadge(Boolean(item.exists))}`}>
                        {item.exists ? "있음" : "없음"}
                      </span>
                    </td>
                    <td>{formatNumber(item.rows)}</td>
                    <td>{formatNumber(item.dataRows)}</td>
                    <td>{formatNumber(item.columns)}</td>
                    <td>{formatNumber(item.frozenRows)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}
