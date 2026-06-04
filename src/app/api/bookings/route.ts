import { NextRequest, NextResponse } from "next/server";
import { normalizeSettingsRows } from "@/lib/settingsOptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type ApiObject = Record<string, unknown>;

type CachedBookingsGet = { expiresAt: number; data: ApiObject };
const bookingsGetCache = new Map<string, CachedBookingsGet>();
const BOOKINGS_GET_CACHE_TTL_MS = 8_000;

function shouldBypassRouteCache(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return params.get("noCache") === "1" || params.get("refresh") === "1";
}

function clearBookingsRouteCache() {
  bookingsGetCache.clear();
}

function kstDateText(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function addDaysText(dateText: string, offset: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getBookingRangeParams(request: NextRequest) {
  const today = kstDateText(new Date());
  const params = request.nextUrl.searchParams;
  const fromDate = params.get("fromDate") || params.get("startDate") || addDaysText(today, -7);
  const toDate = params.get("toDate") || params.get("endDate") || addDaysText(today, 90);

  return { fromDate, toDate };
}


function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) {
    return data as ApiObject[];
  }

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
    if (Array.isArray(obj.bookings)) return obj.bookings as ApiObject[];
  }

  return [];
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

function textValue(value: unknown) {
  return String(value ?? "").trim();
}


function normalizeBookingStatusForApi(value: unknown, action: string) {
  const raw = textValue(value).replace(/\s/g, "");

  if (action === "addBooking") return raw || "확정";
  if (raw === "승인" || raw === "승인완료") return "확정";
  if (raw === "예약확정") return "확정";
  if (raw === "완료처리") return "완료";
  if (raw === "기상" || raw === "기상취소처리") return "기상취소";
  if (raw === "취소승인" || raw === "관리자취소") return "취소";
  if (raw === "취소요청") return "취소요청";
  if (["요청", "확정", "예정", "완료", "취소", "기상취소", "노쇼", "반려"].includes(raw)) return raw;

  return raw || "확정";
}

function normalizeBookingTypeForApi(value: unknown) {
  const raw = textValue(value).replace(/\s/g, "");

  if (raw.includes("렌탈")) return "렌탈비행";
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("정비") || raw.includes("점검")) return "정비";
  if (raw) return raw;

  return "기타";
}


function normalizeExactBookingTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);

  if (!match) return raw.slice(0, 5);

  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function normalizeOutgoingBooking(action: string, data: ApiObject) {
  const next: ApiObject = { ...data };

  next.bookingDate = normalizeSheetDate(next.bookingDate);
  next.startTime = normalizeExactBookingTime(next.startTime);
  next.endTime = normalizeExactBookingTime(next.endTime);
  next.bookingType = normalizeBookingTypeForApi(next.bookingType);
  next.status = normalizeBookingStatusForApi(next.status, action);

  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.aircraft && !next.aircraftName) next.aircraftName = next.aircraft;

  if (next.bookingType !== "체험비행") {
    next.paymentStatus = "";
  }

  return next;
}

function parseSheetDateTime(value: unknown) {
  const raw = textValue(value);

  if (!raw) return null;

  if (raw.includes("T")) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

      return {
        year: kst.getUTCFullYear(),
        month: String(kst.getUTCMonth() + 1).padStart(2, "0"),
        day: String(kst.getUTCDate()).padStart(2, "0"),
        hour: kst.getUTCHours(),
        minute: kst.getUTCMinutes(),
      };
    }
  }

  const dateTimeLike = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{1,2})/);
  if (dateTimeLike) {
    return {
      year: Number(dateTimeLike[1].slice(0, 4)),
      month: dateTimeLike[1].slice(5, 7),
      day: dateTimeLike[1].slice(8, 10),
      hour: Number(dateTimeLike[2]),
      minute: Number(dateTimeLike[3]),
    };
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: dateOnly[2],
      day: dateOnly[3],
      hour: 0,
      minute: 0,
    };
  }

  const timeOnly = raw.match(/^(\d{1,2}):(\d{1,2})/);
  if (timeOnly) {
    return {
      year: 0,
      month: "00",
      day: "00",
      hour: Number(timeOnly[1]),
      minute: Number(timeOnly[2]),
    };
  }

  return null;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeSheetDate(value: unknown) {
  const parts = parseSheetDateTime(value);

  if (parts && parts.year) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const raw = textValue(value);
  return raw ? raw.slice(0, 10) : "";
}

function normalizeSheetTime(value: unknown) {
  const raw = textValue(value);

  if (!raw) return "";

  // Plain HH:mm values from the frontend or getDisplayValues() must be preserved exactly.
  const timeOnly = raw.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (timeOnly) {
    return `${String(Number(timeOnly[1])).padStart(2, "0")}:${String(Number(timeOnly[2])).padStart(2, "0")}`;
  }

  // Plain date-time strings without timezone should be read as written.
  const dateTimeLike = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{1,2})(?::\d{1,2})?/);
  if (dateTimeLike && !raw.endsWith("Z")) {
    return `${String(Number(dateTimeLike[2])).padStart(2, "0")}:${String(Number(dateTimeLike[3])).padStart(2, "0")}`;
  }

  // Google Sheets time-only cells often arrive as ISO/Z values around 1899-12-30T...Z.
  // Those represent spreadsheet time values. Convert UTC to Korea time and preserve minutes.
  if (raw.includes("T")) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
      return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
    }
  }

  const parts = parseSheetDateTime(value);
  if (parts) {
    return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }

  return raw.slice(0, 5);
}

function normalizeBookingRows(rows: ApiObject[]) {
  return rows.map((row) => ({
    ...row,
    bookingDate: normalizeSheetDate(row.bookingDate),
    requestDate: normalizeSheetDate(row.requestDate),
    startTime: normalizeSheetTime(row.startTime),
    endTime: normalizeSheetTime(row.endTime),
    bufferEndTime: normalizeSheetTime(row.bufferEndTime),
  }));
}



function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAppsScriptJson(url: string, context: string, retryCount = 2) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();

      if (!response.ok) {
        const detail = rawText.trim().slice(0, 300);
        throw new Error(
          detail
            ? `${context} Apps Script API 오류: ${response.status} / ${detail}`
            : `${context} Apps Script API 오류: ${response.status}`
        );
      }

      if (!rawText.trim()) {
        throw new Error(`${context} 응답이 비어 있습니다.`);
      }

      try {
        const parsedData = JSON.parse(rawText) as unknown;

        if (
          parsedData &&
          typeof parsedData === "object" &&
          "success" in parsedData &&
          (parsedData as ApiObject).success === false
        ) {
          throw new Error(
            String((parsedData as ApiObject).message || "") ||
              `${context} 데이터를 불러오지 못했습니다.`
          );
        }

        return parsedData;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
        }

        throw error;
      }
    } catch (error) {
      lastError = error;

      if (attempt < retryCount) {
        await sleep(350 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${context} 요청에 실패했습니다.`);
}

function extractRowsFromAllData(allData: unknown, sheetName: string) {
  if (!allData || typeof allData !== "object") return [];

  const obj = allData as ApiObject;

  if (Array.isArray(obj[sheetName])) {
    return obj[sheetName] as ApiObject[];
  }

  if (obj.data && typeof obj.data === "object" && Array.isArray((obj.data as ApiObject)[sheetName])) {
    return (obj.data as ApiObject)[sheetName] as ApiObject[];
  }

  return [];
}

async function fetchBookingsRange(fromDate: string, toDate: string) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getBookingsRange");
  url.searchParams.set("fromDate", fromDate);
  url.searchParams.set("toDate", toDate);
  url.searchParams.set("_ts", String(Date.now()));

  const parsedData = await fetchAppsScriptJson(url.toString(), "예약 범위", 2);
  return normalizeRows(parsedData);
}

async function fetchMasterSheets() {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getAllData");
  url.searchParams.set("sheets", "students,instructors,aircraft,settings,courseCatalog,rentalPilots");
  url.searchParams.set("_ts", String(Date.now()));

  const allData = await fetchAppsScriptJson(url.toString(), "예약관리 기준 시트", 2);

  return {
    students: extractRowsFromAllData(allData, "students"),
    instructors: extractRowsFromAllData(allData, "instructors"),
    aircraft: extractRowsFromAllData(allData, "aircraft"),
    settings: normalizeSettingsRows(extractRowsFromAllData(allData, "settings")),
    courseCatalog: extractRowsFromAllData(allData, "courseCatalog"),
    rentalPilots: extractRowsFromAllData(allData, "rentalPilots"),
  };
}

async function fetchAllSheets(request: NextRequest) {
  const { fromDate, toDate } = getBookingRangeParams(request);

  const [bookingsResult, masterResult] = await Promise.allSettled([
    fetchBookingsRange(fromDate, toDate),
    fetchMasterSheets(),
  ]);

  const fallbackMaster = async () => {
    const students = await fetchSheet("students", { optional: true });
    const instructors = await fetchSheet("instructors", { optional: true });
    const aircraft = await fetchSheet("aircraft", { optional: true });
    const rawSettings = await fetchSheet("settings", { optional: true });
    const settings = normalizeSettingsRows(rawSettings);
    const courseCatalog = await fetchSheet("courseCatalog", { optional: true });
    const rentalPilots = await fetchSheet("rentalPilots", { optional: true });
    return { students, instructors, aircraft, settings, courseCatalog, rentalPilots };
  };

  const bookings = bookingsResult.status === "fulfilled"
    ? bookingsResult.value
    : await fetchSheet("bookings");

  const masters = masterResult.status === "fulfilled"
    ? masterResult.value
    : await fallbackMaster();

  return {
    bookings,
    students: masters.students,
    instructors: masters.instructors,
    aircraft: masters.aircraft,
    settings: masters.settings,
    courseCatalog: masters.courseCatalog,
    rentalPilots: masters.rentalPilots,
    range: { fromDate, toDate },
  };
}

async function fetchSheet(sheetName: string, options?: { optional?: boolean }) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("_ts", String(Date.now()));
    url.searchParams.set("sheet", sheetName);

    const parsedData = await fetchAppsScriptJson(url.toString(), `${sheetName} 시트`, 2);

    return normalizeRows(parsedData);
  } catch (error) {
    if (options?.optional) {
      console.warn(`[bookings optional sheet skipped] ${sheetName}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }

    throw error;
  }
}

async function fetchSheetsSequentialFallback() {
  const bookings = await fetchSheet("bookings");
  const students = await fetchSheet("students", { optional: true });
  const instructors = await fetchSheet("instructors", { optional: true });
  const aircraft = await fetchSheet("aircraft", { optional: true });
  const rawSettings = await fetchSheet("settings", { optional: true });
  const settings = normalizeSettingsRows(rawSettings);
  const courseCatalog = await fetchSheet("courseCatalog", { optional: true });
  const rentalPilots = await fetchSheet("rentalPilots", { optional: true });

  return {
    bookings,
    students,
    instructors,
    aircraft,
    settings,
    courseCatalog,
    rentalPilots,
  };
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action,
      data,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "Apps Script");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

export async function GET(request: NextRequest) {
  try {
    const { fromDate, toDate } = getBookingRangeParams(request);
    const cacheKey = `${fromDate}:${toDate}`;
    const cached = bookingsGetCache.get(cacheKey);

    if (!shouldBypassRouteCache(request) && cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
        cacheTtlSeconds: Math.ceil((cached.expiresAt - Date.now()) / 1000),
      });
    }

    let sheets;

    try {
      sheets = await fetchAllSheets(request);
    } catch (bulkError) {
      console.warn(
        "[bookings GET range fallback]",
        bulkError instanceof Error ? bulkError.message : String(bulkError)
      );
      sheets = await fetchSheetsSequentialFallback();
    }

    const normalizedBookings = normalizeBookingRows(sheets.bookings);

    const responseData: ApiObject = {
      ok: true,
      cached: false,
      cacheTtlSeconds: BOOKINGS_GET_CACHE_TTL_MS / 1000,
      bookings: normalizedBookings,
      students: sheets.students,
      instructors: sheets.instructors,
      aircraft: sheets.aircraft,
      settings: sheets.settings,
      courseCatalog: sheets.courseCatalog,
      rentalPilots: sheets.rentalPilots,
      range: "range" in sheets ? sheets.range : { fromDate, toDate },
      rangeLimited: "range" in sheets,
    };

    bookingsGetCache.set(cacheKey, {
      expiresAt: Date.now() + BOOKINGS_GET_CACHE_TTL_MS,
      data: responseData,
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[bookings GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "예약 데이터를 불러오지 못했습니다.",
        bookings: [],
        students: [],
        instructors: [],
        aircraft: [],
        settings: [],
        courseCatalog: [],
        rentalPilots: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    clearBookingsRouteCache();
    const body = await request.json();
    const action = String(body.action || "").trim();
    const data = (body.data || {}) as ApiObject;

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: "action 값이 필요합니다.",
        },
        { status: 400 }
      );
    }

    const allowedActions = new Set([
      "addBooking",
      "updateBooking",
      "approveBooking",
      "cancelBooking",
    ]);

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: `지원하지 않는 action입니다: ${action}`,
        },
        { status: 400 }
      );
    }

    const outgoingData = normalizeOutgoingBooking(action, data);

    const result = await postToAppsScript(action, outgoingData);
    clearBookingsRouteCache();

    return NextResponse.json({
      ok: true,
      success: true,
      result,
    });
  } catch (error) {
    console.error("[bookings POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "예약 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
