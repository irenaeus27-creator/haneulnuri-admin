import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
const CACHE_TTL_MS = 10_000;
const DASHBOARD_SHEETS = [
  "bookings",
  "users",
  "aircraft",
  "instructors",
  "students",
  "notifications",
  "instructorSchedules",
  "trainingCharges",
  "logs",
] as const;

type SheetName = (typeof DASHBOARD_SHEETS)[number];
type ApiObject = Record<string, unknown>;
type DashboardData = Record<SheetName, ApiObject[]>;

let cachedDashboard:
  | {
      expiresAt: number;
      data: DashboardData;
      source: "getDashboardData" | "fallback";
    }
  | undefined;

function emptyDashboardData(): DashboardData {
  return DASHBOARD_SHEETS.reduce((acc, sheetName) => {
    acc[sheetName] = [];
    return acc;
  }, {} as DashboardData);
}

function normalizeRows(data: unknown, sheetName?: string): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (sheetName && Array.isArray(obj[sheetName])) return obj[sheetName] as ApiObject[];
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
  }

  return [];
}

function normalizeSheetTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (/T\d{2}:\d{2}/.test(raw) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date).replace(/^24:/, "00:");
    }
  }

  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw.slice(0, 5);

  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function normalizeDashboardTimes(data: DashboardData): DashboardData {
  return {
    ...data,
    bookings: data.bookings.map((booking) => ({
      ...booking,
      startTime: normalizeSheetTime(booking.startTime),
      endTime: normalizeSheetTime(booking.endTime),
    })),
  };
}

function normalizeDashboardData(data: unknown): DashboardData | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as ApiObject;
  const source =
    obj.dashboard && typeof obj.dashboard === "object"
      ? (obj.dashboard as ApiObject)
      : obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
        ? (obj.data as ApiObject)
        : obj;

  const dashboard = emptyDashboardData();
  let hasAnySheet = false;

  DASHBOARD_SHEETS.forEach((sheetName) => {
    const rows = normalizeRows(source[sheetName], sheetName);
    dashboard[sheetName] = rows;
    hasAnySheet = hasAnySheet || rows.length > 0 || Array.isArray(source[sheetName]);
  });

  return hasAnySheet ? normalizeDashboardTimes(dashboard) : null;
}

async function readJsonResponse(response: Response, context: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchAppsScriptDashboardData() {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getDashboardData");
  url.searchParams.set("_ts", String(Date.now()));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "getDashboardData");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "getDashboardData가 실패 응답을 반환했습니다."
    );
  }

  const dashboard = normalizeDashboardData(parsedData);

  if (!dashboard) {
    throw new Error("getDashboardData 응답에 대시보드 시트 데이터가 없습니다.");
  }

  return dashboard;
}

async function fetchSheet(sheetName: SheetName) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
  url.searchParams.set("_ts", String(Date.now()));
    url.searchParams.set("sheet", sheetName);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Apps Script API 오류: ${response.status}`);
    }

    const parsedData = await readJsonResponse(response, `${sheetName} 시트`);

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      throw new Error(
        String((parsedData as ApiObject).message || "") ||
          `${sheetName} 시트를 불러오지 못했습니다.`
      );
    }

    return normalizeRows(parsedData, sheetName);
  } catch (error) {
    console.error(`[dashboard fallback ${sheetName} error]`, error);
    return [];
  }
}

async function fetchFallbackDashboardData() {
  const entries = await Promise.all(
    DASHBOARD_SHEETS.map(async (sheetName) => [sheetName, await fetchSheet(sheetName)] as const)
  );

  const data = entries.reduce((acc, [sheetName, rows]) => {
    acc[sheetName] = rows;
    return acc;
  }, emptyDashboardData());

  return normalizeDashboardTimes(data);
}

export async function GET() {
  try {
    if (!API_URL) {
      return NextResponse.json(
        {
          ok: false,
          message: "NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.",
          source: "none",
          ...emptyDashboardData(),
        },
        { status: 500 }
      );
    }

    if (cachedDashboard && cachedDashboard.expiresAt > Date.now()) {
      return NextResponse.json({
        ok: true,
        source: cachedDashboard.source,
        cached: true,
        cacheTtlSeconds: Math.ceil((cachedDashboard.expiresAt - Date.now()) / 1000),
        ...cachedDashboard.data,
      });
    }

    let source: "getDashboardData" | "fallback" = "getDashboardData";
    let data: DashboardData;

    try {
      data = await fetchAppsScriptDashboardData();
      if (data.logs.length === 0) {
        data.logs = await fetchSheet("logs");
      }
    } catch (error) {
      console.warn("[dashboard getDashboardData fallback]", error instanceof Error ? error.message : error);
      source = "fallback";
      data = await fetchFallbackDashboardData();
    }

    cachedDashboard = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
      source,
    };

    return NextResponse.json({
      ok: true,
      source,
      cached: false,
      cacheTtlSeconds: CACHE_TTL_MS / 1000,
      ...data,
    });
  } catch (error) {
    console.error("[dashboard GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "대시보드 데이터를 불러오지 못했습니다.",
        source: "error",
        ...emptyDashboardData(),
      },
      { status: 500 }
    );
  }
}
