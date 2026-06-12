import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const RESERVATION_SLOT_MINUTES = 15;

type Row = Record<string, unknown>;

type DashboardApiResponse = {
  bookings?: Row[];
  users?: Row[];
  aircraft?: Row[];
  instructors?: Row[];
  students?: Row[];
  notifications?: Row[];
  instructorSchedules?: Row[];
  trainingCharges?: Row[];
  trainingLogs?: Row[];
  flightRecords?: Row[];
  logs?: Row[];
};

type BookingsApiResponse = {
  bookings?: Row[];
  aircraft?: Row[];
  instructors?: Row[];
  students?: Row[];
  settings?: Row[];
  courseCatalog?: Row[];
  rentalPilots?: Row[];
};

type ScheduleItem = {
  id: string;
  date: string;
  aircraftKey: string;
  aircraftName: string;
  bookingType: string;
  courseName: string;
  userName: string;
  instructorKey: string;
  instructorName: string;
  startTime: string;
  endTime: string;
  status: string;
  rawBooking?: Row;
};

type DailyPoint = {
  date: string;
  count: number;
  flightHours: number;
};

type DonutItem = {
  label: string;
  value: number;
  color: string;
};

type MissingFlightLogItem = {
  id: string;
  href: string;
  date: string;
  time: string;
  userName: string;
  aircraftName: string;
  instructorName: string;
  bookingType: string;
};

type WeatherData = {
  ok: boolean;
  source?: string;
  current?: {
    time?: string;
    temperature?: number;
    apparentTemperature?: number;
    humidity?: number;
    precipitation?: number;
    rain?: number;
    weatherCode?: number;
    weatherText?: string;
    cloudCover?: number;
    pressureMsl?: number;
    surfacePressure?: number;
    windSpeed?: number;
    windDirection?: number;
    windGust?: number;
  } | null;
  runway?: { label: string; heading: number } | null;
  windComponents?: { headwind: number; crosswind: number; tailwind: number } | null;
  decision?: { label: string; tone: string; message: string } | null;
  hourly?: {
    time: string;
    hour?: number;
    temperature: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    precipitation: number;
    cloudCover: number;
    missing?: boolean;
  }[];
  message?: string;
};

type OpenMeteoResponse = {
  current?: Record<string, number | string>;
  hourly?: Record<string, (number | string)[]>;
};

function weatherCodeText(code: unknown) {
  const value = Number(code);
  if ([0].includes(value)) return "맑음";
  if ([1, 2, 3].includes(value)) return "구름";
  if ([45, 48].includes(value)) return "안개";
  if ([51, 53, 55, 56, 57].includes(value)) return "이슬비";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "눈";
  if ([95, 96, 99].includes(value)) return "뇌우";
  return "확인 필요";
}

function selectActiveRunway(windDirection: number) {
  const direction = Number.isFinite(windDirection) ? windDirection : 0;
  if (direction >= 51 && direction < 230) return { label: "14", heading: 140 };
  return { label: "32", heading: 320 };
}

function calculateWindComponents(windSpeed: number, windDirection: number, runwayHeading: number) {
  const diff = Math.abs((((windDirection - runwayHeading + 540) % 360) - 180));
  const radians = (diff * Math.PI) / 180;
  const headwind = Math.round(windSpeed * Math.cos(radians));
  const crosswind = Math.round(Math.abs(windSpeed * Math.sin(radians)));
  const tailwind = headwind < 0 ? Math.abs(headwind) : 0;

  return {
    headwind: headwind > 0 ? headwind : 0,
    crosswind,
    tailwind,
  };
}

function buildWeatherDecision(components: { headwind: number; crosswind: number; tailwind: number }, gust: number, precipitation: number) {
  if (components.crosswind >= 15 || gust >= 25 || precipitation >= 5) {
    return { label: "주의", tone: "amber", message: "측풍, 돌풍 또는 강수 조건 확인이 필요합니다." };
  }

  if (components.tailwind >= 5) {
    return { label: "확인 필요", tone: "amber", message: "배풍 성분이 있어 활주로 판단이 필요합니다." };
  }

  return { label: "양호", tone: "emerald", message: "현재 기상 조건은 대체로 양호합니다." };
}

async function fetchOpenMeteoDirect(): Promise<WeatherData> {
  const latitude = 37.106759;
  const longitude = 126.765010;
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Asia/Seoul");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("current", [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "precipitation",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ].join(","));

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`Open-Meteo 직접 호출 오류: ${response.status}`);

  const data = (await response.json()) as OpenMeteoResponse;
  const current = data.current || {};
  const hourly = data.hourly || {};
  const windSpeed = Number(current.wind_speed_10m || 0);
  const windDirection = Number(current.wind_direction_10m || 0);
  const windGust = Number(current.wind_gusts_10m || 0);
  const precipitation = Number(current.precipitation || 0);
  const runway = selectActiveRunway(windDirection);
  const components = calculateWindComponents(windSpeed, windDirection, runway.heading);

  const hourlyRows = Array.isArray(hourly.time)
    ? hourly.time.map((time, index) => ({
        time: String(time),
        hour: Number(String(time).slice(11, 13)),
        temperature: Number((hourly.temperature_2m || [])[index] || 0),
        windSpeed: Number((hourly.wind_speed_10m || [])[index] || 0),
        windDirection: Number((hourly.wind_direction_10m || [])[index] || 0),
        windGust: Number((hourly.wind_gusts_10m || [])[index] || 0),
        precipitation: Number((hourly.precipitation || [])[index] || 0),
        cloudCover: Number((hourly.cloud_cover || [])[index] || 0),
      }))
    : [];

  return {
    ok: true,
    source: "Open-Meteo",
    current: {
      time: String(current.time || ""),
      temperature: Number(current.temperature_2m || 0),
      apparentTemperature: Number(current.apparent_temperature || 0),
      humidity: Number(current.relative_humidity_2m || 0),
      precipitation,
      rain: Number(current.rain || 0),
      weatherCode: Number(current.weather_code || 0),
      weatherText: weatherCodeText(current.weather_code),
      cloudCover: Number(current.cloud_cover || 0),
      pressureMsl: Number(current.pressure_msl || 0),
      surfacePressure: Number(current.surface_pressure || 0),
      windSpeed,
      windDirection,
      windGust,
    },
    runway,
    windComponents: components,
    decision: buildWeatherDecision(components, windGust, precipitation),
    hourly: hourlyRows,
  };
}

const SCHEDULE_START_HOUR = 7;
const SCHEDULE_END_HOUR = 20;
const SCHEDULE_START_MIN = SCHEDULE_START_HOUR * 60;
const SCHEDULE_END_MIN = SCHEDULE_END_HOUR * 60;
const SCHEDULE_TOTAL_MIN = SCHEDULE_END_MIN - SCHEDULE_START_MIN;
const SCHEDULE_SLOT_MINUTES = 15;
const PFI_DURATION_MINUTES = 30;

const DASHBOARD_PANEL_HEADER_CLASS = "flex h-[62px] shrink-0 items-start justify-between px-4 py-3";
const DASHBOARD_PANEL_TITLE_CLASS = "text-[15px] font-semibold leading-none tracking-[-0.01em] text-[#10213f]";
const DASHBOARD_PANEL_DESC_CLASS = "mt-1 text-[12px] font-medium leading-none text-[#61758f]";
const DASHBOARD_PANEL_ACTION_CLASS = "mt-0.5 text-xs font-medium text-[#1264f4]";
const DASHBOARD_PANEL_BADGE_CLASS = "mt-0.5 rounded-full px-3 py-1 text-xs font-medium";
const DASHBOARD_WEATHER_INNER_TITLE_CLASS = "text-[11px] font-medium leading-none tracking-[-0.005em] text-[#243b63]";
const DASHBOARD_WEATHER_INNER_DESC_CLASS = "mt-0.5 text-[9px] font-medium leading-none text-[#7a8ca3]";
const DASHBOARD_SCHEDULE_STICKER_HEIGHT = "h-[58px]";
const DASHBOARD_SCHEDULE_STICKER_TOP = "top-2";

const FALLBACK_AIRCRAFT = [
  "HL-C081",
  "HL-C083",
  "HL-C118",
  "HL-C222",
  "HL-C238",
  "HL-C243",
  "HL-C283",
];

function getAppBaseUrl() {
  const explicitBaseUrl = text(process.env.NEXT_PUBLIC_BASE_URL, "").replace(/\/$/, "");
  if (explicitBaseUrl) return explicitBaseUrl;

  const vercelUrl = text(process.env.VERCEL_URL, "").replace(/\/$/, "");
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 9000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("대시보드 API 호출 실패", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractDashboardRows(data: unknown, sheetName: string) {
  if (!data || typeof data !== "object") return [];

  const obj = data as Row;

  if (Array.isArray(obj[sheetName])) return obj[sheetName] as Row[];

  const nestedData = obj.data;
  if (nestedData && typeof nestedData === "object" && Array.isArray((nestedData as Row)[sheetName])) {
    return (nestedData as Row)[sheetName] as Row[];
  }

  const dashboard = obj.dashboard;
  if (dashboard && typeof dashboard === "object" && Array.isArray((dashboard as Row)[sheetName])) {
    return (dashboard as Row)[sheetName] as Row[];
  }

  return [];
}

function normalizeDashboardBookingRows(rows: Row[]) {
  return rows.map((row) => ({
    ...row,
    bookingDate: normalizeDate(getBookingDateValue(row)),
    requestDate: normalizeDate(row.requestDate),
    startTime: normalizeTime(getBookingStartValue(row)),
    endTime: normalizeTime(getBookingEndValue(row)),
    bufferEndTime: normalizeTime(row.bufferEndTime),
  }));
}

async function safeFetchAppsScriptDashboardData(): Promise<Partial<DashboardApiResponse & BookingsApiResponse>> {
  const apiUrl = text(process.env.NEXT_PUBLIC_API_URL, "");

  if (!apiUrl) return {};

  try {
    const url = new URL(apiUrl);
    url.searchParams.set("action", "getAllData");
    url.searchParams.set("_ts", String(Date.now()));

    const response = await fetch(url.toString(), { cache: "no-store" });

    if (!response.ok) {
      console.warn(`Apps Script 직접 호출 오류: ${response.status}`);
      return {};
    }

    const rawText = await response.text();
    if (!rawText.trim()) return {};

    const parsed = JSON.parse(rawText) as unknown;

    return {
      bookings: normalizeDashboardBookingRows(extractDashboardRows(parsed, "bookings")),
      users: extractDashboardRows(parsed, "users"),
      aircraft: extractDashboardRows(parsed, "aircraft"),
      instructors: extractDashboardRows(parsed, "instructors"),
      students: extractDashboardRows(parsed, "students"),
      notifications: extractDashboardRows(parsed, "notifications"),
      instructorSchedules: extractDashboardRows(parsed, "instructorSchedules"),
      trainingCharges: extractDashboardRows(parsed, "trainingCharges"),
      trainingLogs: extractDashboardRows(parsed, "trainingLogs"),
      flightRecords: extractDashboardRows(parsed, "flightRecords"),
      logs: extractDashboardRows(parsed, "logs"),
      settings: extractDashboardRows(parsed, "settings"),
      courseCatalog: extractDashboardRows(parsed, "courseCatalog"),
      rentalPilots: extractDashboardRows(parsed, "rentalPilots"),
    };
  } catch (error) {
    console.warn("Apps Script 직접 대시보드 호출 실패", error);
    return {};
  }
}

function normalizeRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function toCamelDashboardRow(row: Row) {
  const result: Row = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });

  return result;
}

function withDashboardBookingAliases(row: Row) {
  const next = { ...row };

  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.userName && !next.name) next.name = next.userName;
  if (next.instructorName && !next.instructor) next.instructor = next.instructorName;
  if (next.bookingId && !next.id) next.id = next.bookingId;

  return next;
}

function mapDashboardRows(rows: Row[] | null | undefined, options?: { bookingAlias?: boolean }) {
  return (rows || []).map((row) => {
    const camel = toCamelDashboardRow(row);
    return options?.bookingAlias ? withDashboardBookingAliases(camel) : camel;
  });
}

async function selectDashboardTable(
  table: string,
  options?: {
    orderColumn?: string;
    ascending?: boolean;
    limit?: number;
  },
) {
  try {
    const supabase = getSupabaseServerClient();
    let query = supabase.from(table).select("*");

    if (options?.orderColumn) {
      query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`대시보드 ${table} 조회 실패`, error.message);
      return [];
    }

    return mapDashboardRows(data as Row[]);
  } catch (error) {
    console.warn(`대시보드 ${table} 조회 실패`, error);
    return [];
  }
}

async function selectDashboardBookings(fromDate: string, toDate: string) {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", fromDate)
      .lte("booking_date", toDate)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.warn("대시보드 bookings 조회 실패", error.message);
      return [];
    }

    return mapDashboardRows(data as Row[], { bookingAlias: true }).map((row) => ({
      ...row,
      bookingDate: normalizeDate(getBookingDateValue(row)),
      requestDate: normalizeDate(row.requestDate),
      startTime: normalizeTime(getBookingStartValue(row)),
      endTime: normalizeTime(getBookingEndValue(row)),
      bufferEndTime: normalizeTime(row.bufferEndTime),
    }));
  } catch (error) {
    console.warn("대시보드 bookings 조회 실패", error);
    return [];
  }
}

async function selectDashboardPendingUsers() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .or("status.eq.승인대기,status.eq.요청,status.eq.대기,status.eq.pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("대시보드 users 조회 실패", error.message);
      return [];
    }

    return mapDashboardRows(data as Row[]);
  } catch (error) {
    console.warn("대시보드 users 조회 실패", error);
    return [];
  }
}

async function selectDashboardInstructorSchedules(today: string) {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("instructor_schedules")
      .select("*")
      .or(`schedule_date.is.null,schedule_date.eq.${today}`)
      .order("instructor_name", { ascending: true })
      .limit(80);

    if (error) {
      console.warn("대시보드 instructor_schedules 조회 실패", error.message);
      return [];
    }

    return mapDashboardRows(data as Row[]);
  } catch (error) {
    console.warn("대시보드 instructor_schedules 조회 실패", error);
    return [];
  }
}

async function fetchDashboardDataDirect(): Promise<Required<DashboardApiResponse>> {
  const today = todayText();
  const fromDate = addDays(today, -2);
  const toDate = addDays(today, 30);

  const [
    bookings,
    users,
    aircraft,
    instructors,
    instructorSchedules,
    notifications,
    logs,
    trainingCharges,
    trainingLogs,
    flightRecords,
  ] = await Promise.all([
    selectDashboardBookings(fromDate, toDate),
    selectDashboardPendingUsers(),
    selectDashboardTable("aircraft", { orderColumn: "aircraft_id", ascending: true }),
    selectDashboardTable("instructors", { orderColumn: "instructor_id", ascending: true }),
    selectDashboardInstructorSchedules(today),
    selectDashboardTable("notifications", { orderColumn: "created_at", ascending: false, limit: 8 }),
    selectDashboardTable("logs", { orderColumn: "created_at", ascending: false, limit: 20 }),
    selectDashboardTable("training_charges", { orderColumn: "charge_date", ascending: false, limit: 12 }),
    selectDashboardTable("training_logs", { orderColumn: "created_at", ascending: false, limit: 500 }),
    selectDashboardTable("flight_records", { orderColumn: "created_at", ascending: false, limit: 500 }),
  ]);

  return {
    bookings,
    users,
    aircraft,
    instructors,
    students: [],
    notifications,
    instructorSchedules,
    trainingCharges,
    trainingLogs,
    flightRecords,
    logs,
  };
}

async function fetchDashboardDataFromApi(): Promise<Required<DashboardApiResponse> | null> {
  const baseUrl = getAppBaseUrl();
  const dashboardData = await fetchJsonWithTimeout(`${baseUrl}/api/dashboard?_ts=${Date.now()}`, 9000) as DashboardApiResponse | null;

  if (!dashboardData) return null;

  return {
    bookings: normalizeRows(dashboardData.bookings),
    users: normalizeRows(dashboardData.users),
    aircraft: normalizeRows(dashboardData.aircraft),
    instructors: normalizeRows(dashboardData.instructors),
    students: normalizeRows(dashboardData.students),
    notifications: normalizeRows(dashboardData.notifications),
    instructorSchedules: normalizeRows(dashboardData.instructorSchedules),
    trainingCharges: normalizeRows(dashboardData.trainingCharges),
    trainingLogs: normalizeRows(dashboardData.trainingLogs),
    flightRecords: normalizeRows(dashboardData.flightRecords),
    logs: normalizeRows(dashboardData.logs),
  };
}

async function safeGetDashboardData(): Promise<Required<DashboardApiResponse>> {
  const emptyData: Required<DashboardApiResponse> = {
    bookings: [],
    users: [],
    aircraft: [],
    instructors: [],
    students: [],
    notifications: [],
    instructorSchedules: [],
    trainingCharges: [],
    trainingLogs: [],
    flightRecords: [],
    logs: [],
  };

  try {
    const directData = await fetchDashboardDataDirect();

    if (directData.bookings.length > 0 || directData.aircraft.length > 0 || directData.instructors.length > 0) {
      return directData;
    }

    return await fetchDashboardDataFromApi() || emptyData;
  } catch (error) {
    console.error("대시보드 데이터를 직접 불러오지 못했습니다.", error);

    try {
      return await fetchDashboardDataFromApi() || emptyData;
    } catch (apiError) {
      console.error("대시보드 API fallback도 실패했습니다.", apiError);
      return emptyData;
    }
  }
}


async function safeGetWeatherData(): Promise<WeatherData> {
  try {
    return await fetchOpenMeteoDirect();
  } catch (error) {
    console.error("날씨 정보를 직접 불러오지 못했습니다.", error);

    try {
      const baseUrl = getAppBaseUrl();
      const response = await fetch(`${baseUrl}/api/weather/open-meteo?_ts=${Date.now()}`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = (await response.json()) as WeatherData;
        if (data.ok && data.current) return data;
      }
    } catch (routeError) {
      console.error("날씨 정보를 내부 API에서도 불러오지 못했습니다.", routeError);
    }

    return {
      ok: false,
      source: "Open-Meteo",
      current: null,
      runway: null,
      windComponents: null,
      decision: {
        label: "확인 필요",
        tone: "slate",
        message: "날씨 정보를 불러오지 못했습니다.",
      },
      hourly: [],
    };
  }
}

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function isGenericRecentLogItem(log: Record<string, unknown>) {
  const action = text(log.action).trim().toLowerCase();
  const targetSheet = text(log.targetSheet).trim().toLowerCase();
  const message = text(log.message).trim().toLowerCase();
  const targetId = text(log.targetId).trim();

  const isGenericAction = action === "append" || action === "update" || action === "add" || action === "edit";
  const isGenericTarget = targetSheet === "bookings" || targetSheet === "users" || targetSheet === "students";
  const hasUsefulMessage =
    Boolean(message) &&
    message !== targetSheet &&
    message !== "bookings" &&
    message !== "users" &&
    message !== "students" &&
    (message.includes("예약") || message.includes("확정") || message.includes("취소") || message.includes("·") || /\d{4}-\d{2}-\d{2}/.test(message));

  if (isGenericAction && isGenericTarget && !hasUsefulMessage) return true;
  if (isGenericAction && isGenericTarget && targetId && !hasUsefulMessage) return true;

  return false;
}

function recentLogTitle(log: Record<string, unknown>) {
  const action = text(log.action).trim().toLowerCase();
  const targetSheet = text(log.targetSheet).trim();
  const message = text(log.message);
  const status = text(log.status);
  const combined = `${message} ${status}`.replace(/\s/g, "");

  if (targetSheet === "bookings") {
    if (combined.includes("기상취소")) return "기상 취소";
    if (combined.includes("취소")) return "예약 취소";
    if (combined.includes("반려")) return "예약 반려";
    if (combined.includes("확정")) return "예약 확정";
    if (combined.includes("요청") || combined.includes("승인대기")) return "예약 요청";
    if (action === "append" || action === "add" || action === "create") return "예약 등록";
    if (action === "update" || action === "edit") return "예약 수정";
    return "예약 변경";
  }

  if (targetSheet === "users") {
    if (combined.includes("승인")) return "회원 승인";
    if (combined.includes("반려")) return "회원 반려";
    if (action === "append" || action === "add" || action === "create") return "회원 등록";
    if (action === "update" || action === "edit") return "회원 수정";
    return "회원 변경";
  }

  if (targetSheet === "students") {
    if (action === "append" || action === "add" || action === "create") return "교육생 등록";
    if (action === "update" || action === "edit") return "교육생 수정";
    return "교육생 변경";
  }

  if (action === "append") return "정보 등록";
  if (action === "update") return "정보 수정";

  return text(log.action) || "변경 내역";
}

function recentLogDetail(log: Record<string, unknown>) {
  const message = text(log.message).trim();
  const targetSheet = text(log.targetSheet).trim().toLowerCase();
  const targetId = text(log.targetId).trim();

  if (
    message &&
    message.toLowerCase() !== targetSheet &&
    message.toLowerCase() !== "bookings" &&
    message.toLowerCase() !== "users" &&
    message.toLowerCase() !== "students"
  ) {
    return message;
  }

  if (targetSheet === "bookings") return targetId ? `예약 정보 · ${targetId}` : "예약 정보 변경";
  if (targetSheet === "users") return targetId ? `회원 정보 · ${targetId}` : "회원 정보 변경";
  if (targetSheet === "students") return targetId ? `교육생 정보 · ${targetId}` : "교육생 정보 변경";

  return text(log.targetSheet) || "시스템 변경";
}

function recentLogTimeValue(log: Record<string, unknown>) {
  const raw = text(log.createdAt) || text(log.updatedAt) || text(log.timestamp);
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleRecentLogs(logs: Record<string, unknown>[], limit = 6) {
  return [...logs]
    .filter((log) => !isGenericRecentLogItem(log))
    .sort((a, b) => recentLogTimeValue(b) - recentLogTimeValue(a))
    .slice(0, limit);
}




function parseDashboardLogDate(log: Record<string, unknown>) {
  const raw = text(log.createdAt) || text(log.updatedAt) || text(log.timestamp) || text(log.date);
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isGenericDashboardLog(log: Record<string, unknown>) {
  const action = text(log.action).toLowerCase();
  const targetSheet = text(log.targetSheet).toLowerCase();
  const message = text(log.message).trim();
  const targetId = text(log.targetId).trim();

  const genericActions = new Set(["append", "update", "add", "edit"]);
  const genericMessages = new Set(["", "bookings", "users", "students", "예약 정보 변경", "회원 정보 변경", "교육생 정보 변경"]);

  if (targetSheet === "bookings" && genericActions.has(action)) {
    const hasMeaningfulMessage =
      message &&
      !genericMessages.has(message.toLowerCase()) &&
      (message.includes("·") || message.includes("예약") || /\d{4}-\d{2}-\d{2}/.test(message));

    if (!hasMeaningfulMessage && !targetId) return true;
    if (!hasMeaningfulMessage && targetId) return true;
  }

  return false;
}

function dashboardLogTitle(log: Record<string, unknown>) {
  const action = text(log.action).toLowerCase();
  const targetSheet = text(log.targetSheet);
  const message = text(log.message);
  const status = text(log.status);

  if (targetSheet === "bookings") {
    const combined = `${message} ${status}`.replace(/\s/g, "");

    if (combined.includes("취소")) return "예약 취소";
    if (combined.includes("반려")) return "예약 반려";
    if (combined.includes("기상취소")) return "기상 취소";
    if (combined.includes("확정") || action === "approvebooking") return "예약 확정";
    if (combined.includes("요청") || combined.includes("승인대기")) return "예약 요청";

    if (action === "append" || action === "add" || action === "create") return "예약 등록";
    if (action === "update" || action === "edit") return "예약 수정";
    if (action === "cancelbooking") return "예약 취소";

    return "예약 변경";
  }

  if (targetSheet === "users") {
    if (action.includes("approve")) return "회원 승인";
    if (action.includes("reject")) return "회원 반려";
    if (action === "append" || action === "add" || action === "create") return "회원 등록";
    if (action === "update" || action === "edit") return "회원 수정";
    return "회원 변경";
  }

  if (targetSheet === "students") {
    if (action === "append" || action === "add" || action === "create") return "교육생 등록";
    if (action === "update" || action === "edit") return "교육생 수정";
    return "교육생 변경";
  }

  return text(log.action) || "변경 내역";
}

function dashboardLogDetail(log: Record<string, unknown>) {
  const message = text(log.message);
  const targetSheet = text(log.targetSheet);
  const targetId = text(log.targetId);

  if (message && message !== targetSheet && message !== targetId) {
    return message
      .replace(/^bookings$/i, "예약관리")
      .replace(/^users$/i, "회원관리")
      .replace(/^students$/i, "교육생관리");
  }

  if (targetSheet === "bookings") return targetId ? `예약 정보 · ${targetId}` : "예약 정보 변경";
  if (targetSheet === "users") return targetId ? `회원 정보 · ${targetId}` : "회원 정보 변경";
  if (targetSheet === "students") return targetId ? `교육생 정보 · ${targetId}` : "교육생 정보 변경";

  return targetSheet || "시스템 변경";
}

function normalizeDashboardLogs(logs: Record<string, unknown>[]) {
  return [...logs]
    .filter((log) => !isGenericDashboardLog(log))
    .sort((a, b) => parseDashboardLogDate(b) - parseDashboardLogDate(a));
}


function normalizeDate(value: unknown) {
  const valueText = sharedFormatBookingDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value, RESERVATION_SLOT_MINUTES);
  return valueText === "-" ? "" : valueText;
}

function timeToMinutes(value: unknown) {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return SCHEDULE_START_MIN;

  return hour * 60 + minute;
}

function getBookingDateValue(row: Row) {
  return row.bookingDate || row.date || row.reservationDate || row.requestDate || row.flightDate || row.booking_date;
}

function getBookingStartValue(row: Row) {
  return row.startTime || row.start || row.startAt || row.start_time || row.bookingStartTime || row.reservationStartTime;
}

function getBookingEndValue(row: Row) {
  return row.endTime || row.end || row.endAt || row.end_time || row.bookingEndTime || row.reservationEndTime;
}

function getBookingStatus(row: Row) {
  return text(row.status || row.bookingStatus || row.reservationStatus || row.booking_state || row.bookingState);
}

function getDisplayBookingStatus(row: Row) {
  const status = getBookingStatus(row).replace(/\s/g, "");

  if (!status) return "확정";
  if (status === "완료") return "확정";

  return getBookingStatus(row);
}

function getBookingInstructorName(row: Row) {
  return text(row.instructorName || row.instructor || row.teacherName || row.instructorDisplayName, "");
}

function getBookingInstructorId(row: Row) {
  return text(row.instructorId || row.instructorID || row.teacherId || row.teacherID || getBookingInstructorName(row), "");
}

function durationHours(row: Row) {
  const start = timeToMinutes(getBookingStartValue(row));
  const end = timeToMinutes(getBookingEndValue(row));

  if (end <= start) return 0;

  return Math.round(((end - start) / 60) * 10) / 10;
}

function todayText() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function currentKstMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return hour * 60 + minute;
}

function currentKstDateTimeLabel() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return { dateLabel, timeLabel };
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function dayOfYear(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(Date.UTC(year, 0, 0));
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function minutesToClock(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function calculateSunTime(dateText: string, sunrise: boolean) {
  const latitude = 37.106759;
  const longitude = 126.765010;
  const zenith = 90.833;
  const lngHour = longitude / 15;
  const n = dayOfYear(dateText);
  const t = n + ((sunrise ? 6 : 18) - lngHour) / 24;

  const meanAnomaly = 0.9856 * t - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly +
      1.916 * Math.sin(toRadians(meanAnomaly)) +
      0.02 * Math.sin(toRadians(2 * meanAnomaly)) +
      282.634,
  );

  let rightAscension = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(trueLongitude))));
  rightAscension = normalizeDegrees(rightAscension);

  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

  const sinDeclination = 0.39782 * Math.sin(toRadians(trueLongitude));
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHourAngle =
    (Math.cos(toRadians(zenith)) - sinDeclination * Math.sin(toRadians(latitude))) /
    (cosDeclination * Math.cos(toRadians(latitude)));

  if (cosHourAngle > 1 || cosHourAngle < -1) return "-";

  const hourAngle = sunrise
    ? 360 - toDegrees(Math.acos(cosHourAngle))
    : toDegrees(Math.acos(cosHourAngle));

  const localMeanTime = hourAngle / 15 + rightAscension - 0.06571 * t - 6.622;
  const utcTime = localMeanTime - lngHour;
  const kstTime = utcTime + 9;

  return minutesToClock(kstTime * 60);
}

function DashboardTimeSunSummary({ today }: { today: string }) {
  const { dateLabel, timeLabel } = currentKstDateTimeLabel();
  const sunrise = calculateSunTime(today, true);
  const sunset = calculateSunTime(today, false);

  return (
    <div className="fixed right-[88px] top-7 z-30 hidden justify-end xl:flex">
      <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[#d9e6f5] bg-white/90 shadow-[0_12px_30px_rgba(20,46,80,0.07)] backdrop-blur">
        <div className="border-r border-[#edf2f7] px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#7b8da5]">현재 날짜</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#10213f]">{dateLabel}</p>
        </div>
        <div className="border-r border-[#edf2f7] px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#7b8da5]">현재 시간</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#10213f]">{timeLabel}</p>
        </div>
        <div className="border-r border-[#edf2f7] px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#7b8da5]">일출</p>
          <p className="mt-0.5 text-sm font-extrabold text-orange-600">{sunrise}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#7b8da5]">일몰</p>
          <p className="mt-0.5 text-sm font-extrabold text-blue-700">{sunset}</p>
        </div>
      </div>
    </div>
  );
}

function todayLabel() {
  const date = new Date();
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function addDays(dateText: string, offset: number) {
  const [y, m, d] = dateText.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  date.setDate(date.getDate() + offset);

  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;
}

function weekdayKo(dateText: string) {
  const [y, m, d] = dateText.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] || "";
}

function shortDateLabel(dateText: string, today: string) {
  const [y, m, d] = dateText.split("-").map(Number);
  const label = `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}(${weekdayKo(dateText)})`;
  if (dateText === today) return `오늘 ${label}`;
  return label;
}

function createDateOptions(today: string) {
  return Array.from({ length: 22 }, (_, index) => {
    const date = addDays(today, index - 7);
    return { value: date, label: shortDateLabel(date, today) };
  });
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function splitValues(value: unknown) {
  return text(value)
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function weeklyConfigRaw(rowOrValue: unknown) {
  if (rowOrValue && typeof rowOrValue === "object") {
    const row = rowOrValue as Row;
    const direct = text(row.weeklyAvailableTimes);
    if (direct) return direct;

    const memo = text(row.memo);
    const marker = "WEEKLY_CONFIG:";
    const index = memo.indexOf(marker);
    if (index >= 0) return memo.slice(index + marker.length).trim();

    return "";
  }

  return text(rowOrValue);
}

function parseWeeklyAvailableTimes(rowOrValue: unknown) {
  try {
    const raw = weeklyConfigRaw(rowOrValue);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, { state?: string; startTime?: string; endTime?: string; lunchUnavailable?: boolean }>;
  } catch {
    return null;
  }
}

function rowMatchesInstructor(row: Row, instructorId: string, instructorName: string) {
  const rowInstructorId = text(row.instructorId || row.id);
  const rowInstructorName = text(row.instructorName || row.name);
  const scheduleId = text(row.scheduleId);

  return (
    (instructorId && rowInstructorId === instructorId) ||
    (instructorName && rowInstructorName === instructorName) ||
    (instructorId && scheduleId === `WEEKLY-${instructorId}`) ||
    (instructorId && scheduleId.endsWith(`-${instructorId}`)) ||
    (instructorId && scheduleId.includes(instructorId))
  );
}

function isWeeklyScheduleRow(row: Row, instructorId: string, instructorName: string) {
  if (!rowMatchesInstructor(row, instructorId, instructorName)) return false;

  const scheduleType = text(row.scheduleType);
  const scheduleDate = text(row.scheduleDate || row.date);
  const scheduleId = text(row.scheduleId);

  return scheduleType === "weeklyAvailability" || scheduleDate === "WEEKLY" || scheduleId.startsWith("WEEKLY-");
}

function isSameInstructorSchedule(row: Row, instructorId: string, instructorName: string) {
  return rowMatchesInstructor(row, instructorId, instructorName);
}

function isInstructorWorkingOnDate(instructor: Row, schedules: Row[], dateText: string) {
  const instructorId = text(instructor.instructorId);
  const instructorName = text(instructor.name || instructor.instructorName);
  const weekday = weekdayKo(dateText);

  const exceptions = schedules.filter((row) => {
    const scheduleDate = normalizeDate(row.scheduleDate || row.date);
    return scheduleDate === dateText && isSameInstructorSchedule(row, instructorId, instructorName);
  });

  if (exceptions.some((row) => ["휴무", "비활성", "외부일정"].includes(text(row.status).replace(/\s/g, "")))) {
    return false;
  }

  if (exceptions.some((row) => ["가능", "부분가능", "근무"].includes(text(row.status).replace(/\s/g, "")))) {
    return true;
  }

  const weekly = schedules.find((row) => isWeeklyScheduleRow(row, instructorId, instructorName));

  // 교관 스케줄 관리 화면에서 저장 방식이 두 가지로 섞여 있을 수 있습니다.
  // 1) instructorSchedules 시트의 WEEKLY-I-0001 행
  // 2) instructors 시트 자체의 weeklyOffDays / weeklyAvailableTimes 컬럼
  // 대시보드는 두 위치를 모두 확인해야 출근 교관 수가 정확합니다.
  const weeklySource = weekly || instructor;
  const hasWeeklySource =
    Boolean(weekly) ||
    Boolean(text(instructor.weeklyOffDays)) ||
    Boolean(text(instructor.weeklyAvailableTimes)) ||
    Boolean(weeklyConfigRaw(instructor));

  if (hasWeeklySource) {
    const offDays = splitValues(weeklySource.weeklyOffDays);
    if (offDays.includes(weekday)) return false;

    const config = parseWeeklyAvailableTimes(weeklySource);
    const dayConfig = config?.[weekday];

    if (dayConfig) {
      const state = text(dayConfig.state || "근무").replace(/\s/g, "");
      if (state === "휴일" || state === "비활성" || state === "불가") return false;
      return true;
    }

    // weeklyOffDays만 있고 해당 요일이 휴일이 아니면 근무로 판단합니다.
    return true;
  }

  // 교관 스케줄에 주간 근무/휴일 설정이 없는 교관은 출근 교관으로 집계하지 않습니다.
  return false;
}

function countWorkingInstructors(instructors: Row[], schedules: Row[], dateText: string) {
  return instructors.filter((item) => isActive(item.active) && !["비활성", "퇴사"].includes(text(item.status))).filter((item) =>
    isInstructorWorkingOnDate(item, schedules, dateText),
  ).length;
}

function isActive(value: unknown) {
  const raw = text(value).toLowerCase();
  return (
    value === true ||
    raw === "" ||
    raw === "y" ||
    raw === "yes" ||
    raw === "true" ||
    raw === "사용" ||
    raw === "활성"
  );
}

function getAircraftName(row: Row) {
  return text(row.registrationNo || row.aircraftName || row.aircraft || row.aircraftCode || row.aircraftId, "-");
}

function normalizeAircraftKey(value: unknown) {
  return text(value).replace(/\s/g, "").toUpperCase();
}

function aircraftCandidateValues(row: Row) {
  return [
    row.aircraftId,
    row.aircraftName,
    row.aircraft,
    row.aircraftCode,
    row.registrationNo,
    row.registration,
    row.aircraftRegistration,
  ]
    .map((value) => text(value))
    .filter(Boolean);
}

function createAircraftLookup(aircraft: Row[]) {
  const map = new Map<string, string>();

  aircraft.forEach((item) => {
    const displayName = getAircraftName(item);

    aircraftCandidateValues(item).forEach((candidate) => {
      const normalized = normalizeAircraftKey(candidate);
      if (normalized) map.set(normalized, displayName);
      if (candidate) map.set(candidate, displayName);
    });

    if (displayName && displayName !== "-") {
      map.set(displayName, displayName);
      map.set(normalizeAircraftKey(displayName), displayName);
    }
  });

  return map;
}

function getBookingAircraftName(row: Row, aircraftLookup: Map<string, string>) {
  const candidates = aircraftCandidateValues(row);

  for (const candidate of candidates) {
    const mapped = aircraftLookup.get(candidate) || aircraftLookup.get(normalizeAircraftKey(candidate));
    if (mapped) return mapped;
  }

  return candidates[0] || "미배정";
}

function buildVisibleAircraftNameSet(aircraft: Row[]) {
  const names = new Set<string>();

  aircraft.forEach((item) => {
    const displayName = getAircraftName(item);
    if (displayName && displayName !== "-") names.add(displayName);

    aircraftCandidateValues(item).forEach((candidate) => {
      if (candidate) names.add(candidate);
      const normalized = normalizeAircraftKey(candidate);
      if (normalized) names.add(normalized);
    });
  });

  return names;
}

function isScheduleItemForVisibleAircraft(item: ScheduleItem, visibleAircraftNames: Set<string>) {
  return (
    visibleAircraftNames.has(item.aircraftName) ||
    visibleAircraftNames.has(item.aircraftKey) ||
    visibleAircraftNames.has(normalizeAircraftKey(item.aircraftName)) ||
    visibleAircraftNames.has(normalizeAircraftKey(item.aircraftKey))
  );
}

function getBookingType(row: Row) {
  const raw = text(row.bookingType || row.reservationType || row.type || row.category || row.courseType, "기타");

  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("렌탈")) return "렌탈비행";
  if (raw.includes("정비") || raw.includes("점검")) return "정비";

  return raw;
}

function scheduleColorClass(type: string) {
  if (type.includes("교육")) return "border-blue-300 bg-blue-50 text-blue-800";
  if (type.includes("체험")) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (type.includes("렌탈")) return "border-orange-300 bg-orange-50 text-orange-800";
  if (type.includes("PFI")) return "border-sky-300 bg-sky-50 text-sky-800";
  if (type.includes("정비") || type.includes("점검")) return "border-violet-300 bg-violet-50 text-violet-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function scheduleTooltipText(item: ScheduleItem) {
  const raw = item.rawBooking || {};
  const isPfi = item.bookingType === "PFI";
  const userName = isPfi
    ? text(raw.userName || raw.name || raw.customerName || raw.memberName || item.userName, "-")
    : text(item.userName, "-");
  const phone = text(
    raw.phone ||
      raw.userPhone ||
      raw.customerPhone ||
      raw.memberPhone ||
      raw.contact ||
      raw.mobile ||
      raw.mobilePhone ||
      raw.tel ||
      raw.telephone,
    "",
  );
  const instructorName = isPfi
    ? text(getBookingInstructorName(raw), "-")
    : text(item.instructorName, "-");
  const courseName = isPfi
    ? text(raw.courseName || raw.course || item.courseName, "")
    : text(item.courseName, "");

  return [
    `구분: ${isPfi ? "PFI" : item.bookingType}`,
    `예약자: ${userName}`,
    phone ? `전화번호: ${phone}` : "",
    `항공기: ${item.aircraftName}`,
    `시간: ${item.startTime}~${item.endTime}`,
    `담당교관: ${instructorName}`,
    courseName ? `과정: ${courseName}` : "",
    `상태: ${isPfi ? "예약 전 점검" : text(item.status, "-")}`,
  ].filter(Boolean).join("\n");
}

function isRentalBookingType(value: unknown) {
  return text(value).includes("렌탈");
}

function isCancelRequestStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "").toLowerCase();

  return [
    "취소요청",
    "취소신청",
    "취소대기",
    "cancelrequest",
    "cancelrequested",
    "cancellationrequest",
    "pendingcancel",
  ].includes(status);
}

function isCancelledStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "").toLowerCase();

  if (!status) return false;
  if (isCancelRequestStatus(status)) return false;

  if (status.includes("기상취소")) return true;
  if (status.includes("예약취소")) return true;
  if (status.includes("취소")) return true;
  if (status.includes("cancelled") || status.includes("canceled")) return true;

  return ["취소완료", "반려", "노쇼", "noshow", "no-show", "rejected"].includes(status);
}

function isConfirmedStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "");
  return status === "확정" || status === "승인완료" || status.toLowerCase() === "approved";
}

function isFinalStatusForMissingFlightLog(value: unknown) {
  const status = text(value).replace(/\s/g, "").toLowerCase();

  if (!status) return false;
  if (isCancelRequestStatus(status)) return true;
  if (isCancelledStatus(status)) return true;

  return [
    "완료",
    "done",
    "complete",
    "completed",
    "finish",
    "finished",
    "비행완료",
    "운항완료",
    "차감완료",
  ].includes(status);
}

function isFlightLogTargetBooking(row: Row) {
  const status = getBookingStatus(row);
  const typeText = `${text(row.bookingType || row.reservationType || row.type)} ${text(row.courseName || row.course)}`.replace(/\s/g, "");

  if (!isConfirmedStatus(status)) return false;
  if (isFinalStatusForMissingFlightLog(status)) return false;
  if (typeText.includes("PFI")) return false;
  if (typeText.includes("정비") || typeText.includes("점검")) return false;

  return true;
}

function logBookingId(row: Row) {
  return text(row.bookingId || row.booking_id || row.sourceBookingId || row.source_booking_id || row.reservationId || row.reservation_id);
}

function bookingLogFallbackKey(row: Row, aircraftLookup?: Map<string, string>) {
  const date = normalizeDate(getBookingDateValue(row));
  const start = normalizeTime(getBookingStartValue(row));
  const userName = text(row.userName || row.name || row.customerName || row.memberName).replace(/\s/g, "");
  const aircraftName = aircraftLookup ? getBookingAircraftName(row, aircraftLookup) : text(row.aircraftName || row.aircraft || row.registrationNo || row.aircraftId);

  return [date, start, userName, text(aircraftName).replace(/\s/g, "")].join("|");
}

function isPastBookingEnd(row: Row, today: string, currentMinutes: number) {
  const date = normalizeDate(getBookingDateValue(row));
  if (!date) return false;
  if (date < today) return true;
  if (date > today) return false;

  const end = normalizeTime(getBookingEndValue(row) || getBookingStartValue(row));
  return timeToMinutes(end) <= currentMinutes;
}

function buildMissingFlightLogItems(
  bookings: Row[],
  trainingLogs: Row[],
  flightRecords: Row[],
  aircraftLookup: Map<string, string>,
  today: string,
  currentMinutes: number,
): MissingFlightLogItem[] {
  const loggedBookingIds = new Set<string>();
  const loggedFallbackKeys = new Set<string>();

  [...trainingLogs, ...flightRecords].forEach((row) => {
    const bookingId = logBookingId(row);
    if (bookingId) loggedBookingIds.add(bookingId);
    loggedFallbackKeys.add(bookingLogFallbackKey(row, aircraftLookup));
  });

  return bookings
    .filter((booking) => isFlightLogTargetBooking(booking))
    .filter((booking) => isPastBookingEnd(booking, today, currentMinutes))
    .filter((booking) => {
      const bookingId = text(booking.bookingId || booking.booking_id || booking.id);
      if (bookingId && loggedBookingIds.has(bookingId)) return false;
      return !loggedFallbackKeys.has(bookingLogFallbackKey(booking, aircraftLookup));
    })
    .sort((a, b) => `${normalizeDate(getBookingDateValue(a))} ${normalizeTime(getBookingStartValue(a))}`.localeCompare(`${normalizeDate(getBookingDateValue(b))} ${normalizeTime(getBookingStartValue(b))}`))
    .slice(0, 8)
    .map((booking, index) => {
      const bookingId = text(booking.bookingId || booking.booking_id || booking.id, `missing-${index}`);
      const date = normalizeDate(getBookingDateValue(booking));
      const start = normalizeTime(getBookingStartValue(booking));
      const end = normalizeTime(getBookingEndValue(booking));

      return {
        id: bookingId,
        href: `/training-logs?bookingId=${encodeURIComponent(bookingId)}`,
        date,
        time: `${start || "-"}${end ? `~${end}` : ""}`,
        userName: text(booking.userName || booking.name || booking.customerName || booking.memberName, "예약자 미입력"),
        aircraftName: getBookingAircraftName(booking, aircraftLookup),
        instructorName: text(getBookingInstructorName(booking), "미배정"),
        bookingType: getBookingType(booking),
      };
    });
}

function calendarPersonLabel(row: Row) {
  return text(row.userName || row.name || row.customerName || row.memberName, "-");
}

function calendarInstructorLabel(row: Row) {
  const typeText = text(row.bookingType || row.reservationType || row.type, "");
  const instructorName = getBookingInstructorName(row);

  if (!instructorName) return "";
  if (typeText.includes("렌탈")) return `감독 ${instructorName}`;
  if (typeText.includes("교육")) return `교관 ${instructorName}`;
  if (typeText.includes("체험")) return `교관 ${instructorName}`;

  return instructorName;
}

function calendarResourceKeys(resource: Row) {
  return [
    resource.aircraftId,
    resource.aircraftName,
    resource.registrationNo,
  ]
    .map((value) => text(value))
    .filter(Boolean);
}

function bookingAircraftKeys(row: Row) {
  return [
    row.aircraftId,
    row.aircraftName,
    row.aircraft,
    row.registrationNo,
  ]
    .map((value) => text(value))
    .filter(Boolean);
}

function bookingMatchesAircraftResource(row: Row, resource: Row) {
  const resourceKeys = calendarResourceKeys(resource);
  const bookingKeys = bookingAircraftKeys(row);
  const normalizedResourceKeys = resourceKeys.map(normalizeAircraftKey).filter(Boolean);
  const normalizedBookingKeys = bookingKeys.map(normalizeAircraftKey).filter(Boolean);

  return (
    bookingKeys.some((key) => resourceKeys.includes(key)) ||
    resourceKeys.some((key) => bookingKeys.includes(key)) ||
    normalizedBookingKeys.some((key) => normalizedResourceKeys.includes(key)) ||
    normalizedResourceKeys.some((key) => normalizedBookingKeys.includes(key))
  );
}

function aircraftDisplay(row: Row) {
  return text(row.registrationNo || row.aircraftName || row.aircraftId, "-");
}

function isAircraftOperational(row: Row) {
  if (!isActive(row.active)) return false;

  const status = text(row.status || row.aircraftStatus).replace(/\s/g, "");
  if (!status) return true;

  return (
    ["운항가능", "가능", "정상", "활성", "available", "active"].includes(status.toLowerCase()) ||
    status === "운항가능"
  );
}

function requiresPfi(row: Row) {
  const raw = `${text(row.bookingType || row.reservationType || row.type, "")} ${text(row.courseName || row.course || row.courseNameKo, "")}`;
  return raw.includes("교육") || raw.includes("렌탈");
}

function minutesToTime(minutes: number) {
  const safe = Math.max(0, minutes);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function badgeClass(value: unknown) {
  const status = text(value).replace(/\s/g, "");

  if (["확정", "승인완료", "완료", "확인", "운항가능", "근무중"].includes(status)) {
    return "border-[#d7e2f2] bg-[#f7fbff] text-blue-700";
  }

  if (["대기", "예정"].includes(status)) {
    return "border-[#d3eadf] bg-[#f7fdf9] text-emerald-700";
  }

  if (["요청", "승인대기"].includes(status)) {
    return "border-[#eadfc9] bg-[#fffbf2] text-amber-700";
  }

  if (["취소", "미확인", "거절", "반려", "비활성"].includes(status)) {
    return "border-[#ead4d8] bg-[#fff7f8] text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function buildScheduleItems(bookings: Row[], aircraftResources: Row[], selectedDate: string, aircraftLookup: Map<string, string>): ScheduleItem[] {
  const visibleBookings = bookings
    .filter((row) => normalizeDate(getBookingDateValue(row)) === selectedDate)
    .filter((row) => !isCancelledStatus(getBookingStatus(row)));

  const items: ScheduleItem[] = [];
  const seen = new Set<string>();

  visibleBookings.forEach((row, index) => {
    const bookingType = getBookingType(row);
    const matchedResource = aircraftResources.find((resource) => bookingMatchesAircraftResource(row, resource));
    const aircraftName = matchedResource ? aircraftDisplay(matchedResource) : getBookingAircraftName(row, aircraftLookup);
    const date = normalizeDate(getBookingDateValue(row));
    const startTime = normalizeTime(getBookingStartValue(row));
    const endTime = normalizeTime(getBookingEndValue(row));
    const bookingId = text(
      row.bookingId || row.booking_id || row.id,
      `${aircraftName}-${date}-${startTime}-${endTime}-${index}`,
    );

    const pushItem = (item: ScheduleItem) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      items.push(item);
    };

    if (requiresPfi(row)) {
      const startMinutes = timeToMinutes(startTime);
      const pfiStart = Math.max(0, startMinutes - PFI_DURATION_MINUTES);
      const pfiEnd = startMinutes;

      if (pfiEnd > pfiStart) {
        pushItem({
          id: `pfi-${bookingId}`,
          date,
          aircraftKey: aircraftName,
          aircraftName,
          bookingType: "PFI",
          courseName: "PFI",
          userName: "PFI",
          instructorKey: "",
          instructorName: "PFI",
          startTime: minutesToTime(pfiStart),
          endTime: minutesToTime(pfiEnd),
          status: "PFI",
          rawBooking: row,
        });
      }
    }

    pushItem({
      id: bookingId,
      date,
      aircraftKey: aircraftName,
      aircraftName,
      bookingType,
      courseName: text(row.courseName || row.course || bookingType),
      userName: calendarPersonLabel(row),
      instructorKey: text(getBookingInstructorId(row), "미배정"),
      instructorName: calendarInstructorLabel(row),
      startTime,
      endTime,
      status: getBookingStatus(row),
      rawBooking: row,
    });
  });

  return items.sort((a, b) => `${a.aircraftName}${a.startTime}${a.bookingType}`.localeCompare(`${b.aircraftName}${b.startTime}${b.bookingType}`, "ko"));
}

function buildAircraftRows(aircraft: Row[]) {
  const rows = aircraft
    .map(aircraftDisplay)
    .filter((name) => name && name !== "-");

  if (rows.length > 0) return rows.sort((a, b) => a.localeCompare(b, "ko"));

  return FALLBACK_AIRCRAFT;
}

function addAircraftResourceKeysToSet(target: Set<string>, resource: Row) {
  calendarResourceKeys(resource).forEach((key) => {
    const normalized = normalizeAircraftKey(key);
    if (normalized) target.add(normalized);
  });

  const displayName = aircraftDisplay(resource);
  const normalizedDisplayName = normalizeAircraftKey(displayName);
  if (normalizedDisplayName) target.add(normalizedDisplayName);
}

function buildDashboardAircraftResources(aircraft: Row[], bookings: Row[], aircraftLookup: Map<string, string>) {
  const resources = aircraft
    .filter(shouldShowDashboardAircraft)
    .sort((a, b) => aircraftDisplay(a).localeCompare(aircraftDisplay(b), "ko"));

  const seen = new Set<string>();
  resources.forEach((resource) => addAircraftResourceKeysToSet(seen, resource));

  bookings
    .filter(isActiveBooking)
    .forEach((booking) => {
      const displayName = getBookingAircraftName(booking, aircraftLookup);
      const normalizedDisplayName = normalizeAircraftKey(displayName);

      if (!normalizedDisplayName || displayName === "미배정") return;
      if (seen.has(normalizedDisplayName)) return;

      const syntheticResource: Row = {
        aircraftId: text(booking.aircraftId || displayName),
        aircraftName: displayName,
        aircraft: displayName,
        registrationNo: displayName,
        status: "운항 가능",
        active: "TRUE",
      };

      resources.push(syntheticResource);
      addAircraftResourceKeysToSet(seen, syntheticResource);

      bookingAircraftKeys(booking).forEach((key) => {
        const normalized = normalizeAircraftKey(key);
        if (normalized) seen.add(normalized);
      });
    });

  return resources.sort((a, b) => aircraftDisplay(a).localeCompare(aircraftDisplay(b), "ko"));
}

function buildDailyChart(bookings: Row[], today: string): DailyPoint[] {
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));

  return days.map((date) => {
    const dayBookings = bookings.filter((booking) => normalizeDate(getBookingDateValue(booking)) === date);

    return {
      date,
      count: dayBookings.length,
      flightHours: Math.round(dayBookings.reduce((sum, booking) => sum + durationHours(booking), 0) * 10) / 10,
    };
  });
}

function isActiveBooking(row: Row) {
  return !isCancelledStatus(getBookingStatus(row));
}

function sumFlightHours(bookings: Row[]) {
  return Math.round(bookings.filter(isActiveBooking).reduce((sum, booking) => sum + durationHours(booking), 0) * 10) / 10;
}

type InstructorScheduleSummary = {
  instructorName: string;
  count: number;
  items: ScheduleItem[];
};

function buildInstructorScheduleSummary(items: ScheduleItem[]): InstructorScheduleSummary[] {
  const flightItems = items
    .filter((item) => item.bookingType !== "PFI")
    .filter((item) => !isRentalBookingType(item.bookingType))
    .filter((item) => item.instructorName && item.instructorName !== "담당자 미정")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const map = new Map<string, ScheduleItem[]>();

  flightItems.forEach((item) => {
    const key = item.instructorName || "담당자 미정";
    const prev = map.get(key) || [];
    prev.push(item);
    map.set(key, prev);
  });

  return Array.from(map.entries())
    .map(([instructorName, values]) => ({
      instructorName,
      count: values.length,
      items: values,
    }))
    .sort((a, b) => a.instructorName.localeCompare(b.instructorName, "ko"));
}

function buildDonutItems(bookings: Row[]): DonutItem[] {
  const typeLabels = ["체험비행", "교육비행", "렌탈비행", "자가비행", "정비", "기타"];
  const colors: Record<string, string> = {
    체험비행: "#4fc48d",
    교육비행: "#4f86f7",
    렌탈비행: "#ff9f43",
    자가비행: "#8b5cf6",
    정비: "#a855f7",
    기타: "#b8c3d2",
  };

  return typeLabels.map((label) => ({
    label,
    value: bookings.filter((booking) => {
      const type = getBookingType(booking);
      if (label === "기타") {
        return !typeLabels.slice(0, 5).includes(type);
      }
      return type === label;
    }).length,
    color: colors[label] || "#b8c3d2",
  }));
}

function isAircraftAvailable(row: Row) {
  return isAircraftOperational(row);
}

function shouldShowDashboardAircraft(row: Row) {
  const aircraftName = aircraftDisplay(row).replace(/\s/g, "").toLowerCase();
  const memo = text(row.memo || row.note).replace(/\s/g, "").toLowerCase();

  if (aircraftName.includes("aog") || memo.includes("aog")) return false;

  return isAircraftOperational(row);
}

function aircraftStatusLabel(row: Row) {
  return text(row.status || row.aircraftStatus, "운항 가능");
}

function aircraftStatusClass(row: Row) {
  const status = aircraftStatusLabel(row).replace(/\s/g, "");

  if (["운항가능", "가능", ""].includes(status)) {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status.includes("점검")) {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status.includes("정비")) {
    return "border-orange-100 bg-orange-50 text-orange-700";
  }

  if (status.includes("불가") || status.includes("비활성")) {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function activityToneFromTitle(title: string) {
  const value = title.replace(/\s/g, "");

  if (value.includes("취소") || value.includes("반려") || value.includes("노쇼")) return "rose";
  if (value.includes("확정") || value.includes("승인") || value.includes("완료")) return "emerald";
  if (value.includes("수정") || value.includes("변경") || value.includes("이동")) return "violet";
  if (value.includes("등록") || value.includes("생성") || value.includes("요청")) return "blue";
  if (value.includes("알림")) return "sky";

  return "slate";
}

function cleanActivityText(value: unknown) {
  return text(value, "")
    .replace(/^bookings$/i, "")
    .replace(/^users$/i, "")
    .replace(/^students$/i, "")
    .replace(/^notifications$/i, "")
    .replace(/^logs$/i, "")
    .trim();
}

function compactActivityDate(value: unknown) {
  const raw = text(value, "");
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return raw;

  return `${match[2]}.${match[3]}`;
}

function compactActivityTimeRange(value: unknown) {
  const raw = text(value, "");
  const range = raw.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);

  if (range) return `${range[1]}~${range[2]}`;

  const single = raw.match(/(\d{1,2}:\d{2})/);
  return single ? single[1] : "";
}

function compactBookingTypeLabelForActivity(value: unknown) {
  const raw = text(value, "");

  if (raw.includes("렌탈")) return "렌탈";
  if (raw.includes("교육")) return "교육";
  if (raw.includes("체험")) return "체험";
  if (raw.includes("정비") || raw.includes("점검")) return "정비";

  return raw;
}

function compactAircraftLabelForActivity(value: unknown) {
  const raw = text(value, "");
  const hl = raw.match(/HL-[A-Z0-9]+/i);

  if (hl) return hl[0].toUpperCase();

  return raw;
}

function compactActivityName(value: unknown) {
  const raw = text(value, "")
    .replace(/^예약자\s*미입력$/, "")
    .replace(/^(교관|감독)\s+/, "")
    .trim();

  return raw;
}

function compactActivityTitle(title: string) {
  const parts = title.split("·").map((item) => item.trim()).filter(Boolean);
  const first = parts[0] || title;
  const action = first.replace(/예약\s+/, "예약 ").trim();
  const name = compactActivityName(parts[1]);

  return name ? `${action} · ${name}` : action;
}

function compactActivityDetail(value: unknown) {
  const raw = cleanActivityText(value);
  if (!raw) return "";

  const parts = raw.split("·").map((item) => item.trim()).filter(Boolean);
  const datePart = parts.find((item) => /\d{4}-\d{2}-\d{2}/.test(item)) || "";
  const timePart = parts.find((item) => /\d{1,2}:\d{2}/.test(item)) || "";
  const typePart = parts.find((item) => /렌탈|교육|체험|정비|점검/.test(item)) || "";
  const aircraftPart = parts.find((item) => /HL-|A-\d+/i.test(item)) || "";

  const compactDate = compactActivityDate(datePart || timePart);
  const compactTime = compactActivityTimeRange(timePart || datePart);
  const compactType = compactBookingTypeLabelForActivity(typePart);
  const compactAircraft = compactAircraftLabelForActivity(aircraftPart);

  return [
    [compactDate, compactTime].filter(Boolean).join(" "),
    compactType,
    compactAircraft,
  ]
    .filter(Boolean)
    .join(" · ");
}

function parseActivityFromDetail(defaultTitle: string, detailValue: unknown, fallbackSubject?: unknown) {
  const rawDetail = cleanActivityText(detailValue);
  const fallback = cleanActivityText(fallbackSubject);
  const slashParts = rawDetail
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);

  let title = fallback ? `${defaultTitle} · ${fallback}` : defaultTitle;
  let detailParts = slashParts;

  if (slashParts.length > 0) {
    const first = slashParts[0];
    const dotParts = first.split("·").map((item) => item.trim()).filter(Boolean);
    const firstLooksLikeAction = /예약|회원|교육생|항공기|교관|코스|문서|파일|로그|알림/.test(dotParts[0] || "");

    if (dotParts.length >= 2 && firstLooksLikeAction) {
      const kind = dotParts[0];
      const subject = dotParts[1];
      title = compactActivityName(subject) ? `${kind} · ${compactActivityName(subject)}` : kind;
      detailParts = slashParts.slice(1);
    }
  }

  const detail = compactActivityDetail(detailParts.join(" · ") || rawDetail);

  return {
    title: compactActivityTitle(title),
    detail,
  };
}

function bookingActivityDetail(booking: Row) {
  const date = compactActivityDate(normalizeDate(getBookingDateValue(booking)));
  const start = normalizeTime(getBookingStartValue(booking));
  const end = normalizeTime(getBookingEndValue(booking));
  const type = compactBookingTypeLabelForActivity(getBookingType(booking));
  const aircraftName = compactAircraftLabelForActivity(booking.aircraftName || booking.aircraft || booking.registrationNo || booking.aircraftId);

  return [
    [date, start && end ? `${start}~${end}` : start].filter(Boolean).join(" "),
    type,
    aircraftName,
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildRecentActivities(logs: Row[], notifications: Row[], bookings: Row[]) {
  const logItems = normalizeDashboardLogs(logs as Record<string, unknown>[]).map((log) => {
    const defaultTitle = dashboardLogTitle(log);
    const parsed = parseActivityFromDetail(defaultTitle, dashboardLogDetail(log), log.userName || log.targetName || log.targetId);

    return {
      time: text(log.createdAt || log.timestamp || log.updatedAt),
      title: parsed.title,
      detail: parsed.detail,
      tone: activityToneFromTitle(parsed.title),
    };
  });

  const notificationItems = notifications.map((notification) => {
    const title = compactActivityTitle(cleanActivityText(notification.title || notification.message || notification.type) || "알림 기록");
    const detail = compactActivityDetail(notification.body || notification.memo);

    return {
      time: text(notification.createdAt || notification.sentAt || notification.updatedAt),
      title,
      detail,
      tone: activityToneFromTitle(title || "알림"),
    };
  });

  const bookingItems = bookings.map((booking) => {
    const status = text(getBookingStatus(booking), "변경");
    const userName = text(booking.userName || booking.name || booking.customerName || booking.memberName, "예약자 미입력");
    const title = compactActivityTitle(`예약 ${status} · ${userName}`);

    return {
      time: text(booking.updatedAt || booking.createdAt || `${normalizeDate(getBookingDateValue(booking))} ${normalizeTime(getBookingStartValue(booking))}`),
      title,
      detail: bookingActivityDetail(booking),
      tone: activityToneFromTitle(title),
    };
  });

  return [...logItems, ...notificationItems, ...bookingItems]
    .filter((item) => item.time || item.title)
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 5);
}

function shortActivityTime(value: string) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value.replace("T", " ") : value;
  return normalized.slice(5, 16);
}


function weatherToneClass(tone?: string) {
  if (tone === "emerald") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "border-amber-100 bg-amber-50 text-amber-700";
  if (tone === "rose") return "border-rose-100 bg-rose-50 text-rose-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

function formatWeatherTime(value?: string) {
  if (!value) return "-";
  const normalized = value.replace("T", " ");
  return normalized.slice(11, 16) || normalized;
}

function numberText(value: unknown, suffix = "") {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return `-${suffix}`;
  return `${Math.round(numberValue)}${suffix}`;
}

function durationTextFromMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;

  if (hour > 0 && minute > 0) return `${hour}시간 ${minute}분`;
  if (hour > 0) return `${hour}시간`;
  return `${minute}분`;
}

function instructorWorkStatus(instructor: Row, schedules: Row[], dateText: string) {
  const rawStatus = text(instructor.status).replace(/\s/g, "");

  if (["비활성", "퇴사", "중단"].includes(rawStatus)) {
    return {
      label: "비활성",
      tone: "rose",
      message: "비활성 교관",
    };
  }

  const working = isInstructorWorkingOnDate(instructor, schedules, dateText);

  if (!working) {
    return {
      label: "휴무",
      tone: "slate",
      message: "오늘 휴무",
    };
  }

  return {
    label: "근무중",
    tone: "emerald",
    message: "근무중",
  };
}

function instructorStatusBadgeClass(tone: string) {
  if (tone === "emerald") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (tone === "blue") return "border-blue-100 bg-blue-50 text-blue-700";
  if (tone === "amber") return "border-amber-100 bg-amber-50 text-amber-700";
  if (tone === "rose") return "border-rose-100 bg-rose-50 text-rose-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

function buildInstructorAssignmentSummary(
  instructors: Row[],
  scheduleItems: ScheduleItem[],
  instructorSchedules: Row[],
  dateText: string,
  currentMinutes: number,
) {
  return instructors.map((instructor) => {
    const name = text(instructor.name || instructor.instructorName, "이름 미입력");
    const instructorId = text(instructor.instructorId || name);
    const workStatus = instructorWorkStatus(instructor, instructorSchedules, dateText);
    const items = scheduleItems
      .filter((item) => item.bookingType !== "PFI")
      .filter((item) =>
        item.instructorKey === instructorId ||
        item.instructorName === name ||
        item.instructorName === instructorId ||
        item.instructorKey === name
      )
      .sort((a, b) => normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime)));

    const ongoing = items.find((item) => {
      const start = timeToMinutes(item.startTime);
      const end = timeToMinutes(item.endTime);
      return currentMinutes >= start && currentMinutes < end;
    });
    const next = items.find((item) => timeToMinutes(item.startTime) > currentMinutes);
    const firstTime = items.length ? normalizeTime(items[0].startTime) : "";
    const totalMinutes = items.reduce((sum, item) => {
      const start = timeToMinutes(item.startTime);
      const end = timeToMinutes(item.endTime);
      return sum + Math.max(0, end - start);
    }, 0);

    let statusText = workStatus.message;
    let statusTone = workStatus.tone;
    let nextLabel = "";

    if (workStatus.label === "휴무" || workStatus.label === "비활성") {
      statusText = workStatus.message;
    } else if (ongoing) {
      statusText = `현재 일정 중 · ${normalizeTime(ongoing.endTime)} 종료`;
      statusTone = "blue";
      nextLabel = `진행중 ${normalizeTime(ongoing.startTime)}`;
    } else if (next) {
      statusText = `다음 ${normalizeTime(next.startTime)}`;
      statusTone = "amber";
      nextLabel = `다음 ${normalizeTime(next.startTime)}`;
    } else if (items.length > 0) {
      statusText = "오늘 일정 종료";
      statusTone = "slate";
      nextLabel = "종료";
    } else {
      statusText = "대기 가능 · 오늘 배정 없음";
      statusTone = "emerald";
      nextLabel = "대기";
    }

    return {
      id: instructorId,
      name,
      count: items.length,
      firstTime,
      totalMinutes,
      workLabel: workStatus.label,
      workTone: workStatus.tone,
      statusText,
      statusTone,
      nextLabel,
      items: items.slice(0, 2).map((item) => ({
        id: item.id,
        startTime: normalizeTime(item.startTime),
        endTime: normalizeTime(item.endTime),
        userName: item.userName,
        bookingType: item.bookingType,
        aircraftName: item.aircraftName,
      })),
      hiddenCount: Math.max(0, items.length - 2),
    };
  }).sort((a, b) => {
    const rank = (item: { workLabel: string; count: number }) => {
      if (item.workLabel === "휴무" || item.workLabel === "비활성") return 2;
      if (item.count > 0) return 0;
      return 1;
    };

    return rank(a) - rank(b) || b.count - a.count || a.name.localeCompare(b.name, "ko");
  });
}

function isPendingApprovalBooking(booking: Row) {
  const status = text(booking.status).replace(/\s/g, "");
  return status === "요청" || status === "취소요청";
}

function isPendingUser(user: Row) {
  const status = text(user.status).replace(/\s/g, "").toLowerCase();
  return ["승인대기", "요청", "대기", "pending"].includes(status);
}

function bookingActionOptions(booking: Row) {
  const status = text(booking.status).replace(/\s/g, "");

  if (status === "요청") {
    return [
      { label: "확정", nextStatus: "확정", tone: "primary", actionLabel: "대시보드 예약 요청 승인" },
      { label: "반려", nextStatus: "반려", tone: "danger", actionLabel: "대시보드 예약 요청 반려" },
    ];
  }

  if (status === "취소요청") {
    return [
      { label: "취소승인", nextStatus: "취소", tone: "danger", actionLabel: "대시보드 취소 요청 승인" },
      { label: "유지", nextStatus: "확정", tone: "secondary", actionLabel: "대시보드 취소 요청 반려" },
    ];
  }

  return [];
}

function buildActionMemo(existingMemo: unknown, actionLabel: string) {
  const lines = [text(existingMemo)].filter(Boolean);
  const stamp = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  lines.push(`[${stamp}] ${actionLabel}`);

  return lines.join("\n").trim();
}

function shiftTimeByMinutes(value: unknown, minutes: number) {
  const current = timeToMinutes(value);
  return minutesToTime(current + minutes);
}

async function createBookingChangeNotification(booking: Row, oldStart: string, oldEnd: string, newStart: string, newEnd: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않아 예약 변경 알림을 만들 수 없습니다.");

  const bookingDate = normalizeDate(booking.bookingDate);
  const userName = text(booking.userName || booking.name || booking.customerName, "예약자");
  const notificationId = `N-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    notificationId,
    title: "예약 시간 변경",
    message: `${userName}님의 예약 시간이 ${bookingDate} ${oldStart}~${oldEnd}에서 ${newStart}~${newEnd}로 변경되었습니다.`,
    targetType: "예약자",
    targetId: text(booking.userId),
    targetName: userName,
    phone: text(booking.phone),
    bookingId: text(booking.bookingId),
    bookingDate,
    bookingType: text(booking.bookingType),
    status: "unread",
    read: "N",
    category: "예약변경",
    createdAt: new Date().toISOString(),
    memo: "대시보드 15분 이동 기능에서 자동 생성",
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "addNotification", data: payload }),
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`예약 변경 알림 생성 실패: ${response.status}`);

  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Row;
      if (parsed && parsed.success === false) {
        throw new Error(text(parsed.message, "예약 변경 알림 생성 실패"));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("예약 변경 알림")) throw error;
    }
  }
}

async function updateDashboardBookingStatus(formData: FormData) {
  "use server";

  const rawBooking = String(formData.get("booking") || "{}");
  const nextStatus = String(formData.get("nextStatus") || "").trim();
  const actionLabel = String(formData.get("actionLabel") || "대시보드 상태 변경").trim();

  if (!nextStatus) return;

  const booking = JSON.parse(rawBooking) as Row;
  const baseUrl = getAppBaseUrl();

  await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateBooking",
      data: {
        ...booking,
        bookingId: text(booking.bookingId),
        bookingDate: normalizeDate(booking.bookingDate),
        startTime: normalizeTime(booking.startTime),
        endTime: normalizeTime(booking.endTime),
        status: nextStatus,
        memo: buildActionMemo(booking.memo, actionLabel),
      },
    }),
    cache: "no-store",
  });

  revalidatePath("/");
  revalidatePath("/bookings");
  revalidatePath("/booking-calendar");
}

function linePath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function polar(cx: number, cy: number, r: number, t: number) {
  const angle = Math.PI * 2 * t - Math.PI / 2;

  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  };
}

function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const so = polar(cx, cy, outer, start);
  const eo = polar(cx, cy, outer, end);
  const si = polar(cx, cy, inner, end);
  const ei = polar(cx, cy, inner, start);
  const large = end - start > 0.5 ? 1 : 0;

  return [
    `M ${so.x} ${so.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${eo.x} ${eo.y}`,
    `L ${si.x} ${si.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ei.x} ${ei.y}`,
    "Z",
  ].join(" ");
}

function StatCard({
  title,
  value,
  sub,
  icon,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <ContentCard className="p-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-medium leading-tight tracking-[-0.005em] text-[#243b63]">{title}</p>
          <p className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#10213f]">
            {value}
          </p>
          <p className="mt-1.5 text-[11px] font-semibold text-[#6f8199]">{sub}</p>
        </div>
      </div>
    </ContentCard>
  );
}

function ReservationChart({ data }: { data: DailyPoint[] }) {
  const width = 410;
  const height = 220;
  const left = 38;
  const right = 14;
  const top = 22;
  const bottom = 42;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(5, Math.ceil(Math.max(...data.flatMap((item) => [item.count, item.flightHours]), 1) / 5) * 5);
  const points = data.map((item, index) => ({
    x: left + (innerW / Math.max(data.length - 1, 1)) * index,
    y: top + innerH - (item.count / max) * innerH,
    ...item,
  }));
  const hourPoints = data.map((item, index) => ({
    x: left + (innerW / Math.max(data.length - 1, 1)) * index,
    y: top + innerH - (item.flightHours / max) * innerH,
    ...item,
  }));

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5 px-2 text-xs font-semibold text-[#526a89]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#1264f4]" />예약 건수</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />총 비행시간</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full">
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const y = top + innerH - (index / 5) * innerH;
          return (
            <g key={index}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="#dbe5f1" />
              <text x={left - 10} y={y + 4} textAnchor="end" fontSize="14" fontWeight="850" fill="#6f8199">
                {Math.round((max / 5) * index)}
              </text>
            </g>
          );
        })}

        <path d={linePath(hourPoints)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeDasharray="5 4" />
        <path d={linePath(points)} fill="none" stroke="#1264f4" strokeWidth="2.2" />

        {points.map((point, index) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#1264f4" strokeWidth="3" />
            <circle cx={hourPoints[index].x} cy={hourPoints[index].y} r="3.5" fill="#fff" stroke="#10b981" strokeWidth="2.5" />
            <text x={point.x} y={point.y - 11} textAnchor="middle" fontSize="12" fontWeight="850" fill="#10213f">
              {point.count}
            </text>
            <text x={point.x} y={height - 24} textAnchor="middle" fontSize="10" fontWeight="850" fill="#10b981">
              {point.flightHours}h
            </text>
            <text x={point.x} y={height - 9} textAnchor="middle" fontSize="14" fontWeight="850" fill="#536985">
              {point.date.slice(5).replace("-", "/")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DonutChart({ items }: { items: DonutItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  const segments = items.map((item, index) => {
    const previousValue = items
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.value, 0);

    const start = previousValue / Math.max(total, 1);
    const end = (previousValue + item.value) / Math.max(total, 1);

    return {
      ...item,
      start,
      end,
      percent: total ? Math.round((item.value / total) * 1000) / 10 : 0,
    };
  });

  return (
    <div className="grid grid-cols-[190px_1fr] items-center gap-2">
      <svg viewBox="0 0 210 210" className="h-[190px] w-[190px]">
        {total === 0 ? (
          <path d={arcPath(105, 105, 78, 43, 0, 0.999)} fill="#e6edf6" />
        ) : (
          segments.map((segment) => {
            if (segment.value <= 0) return null;

            return (
              <path
                key={segment.label}
                d={arcPath(
                  105,
                  105,
                  78,
                  43,
                  Math.min(segment.start + 0.004, segment.end),
                  Math.max(segment.end - 0.004, segment.start),
                )}
                fill={segment.color}
              />
            );
          })
        )}

        <circle cx="105" cy="105" r="41" fill="white" />
        <text x="105" y="98" textAnchor="middle" fontSize="13" fontWeight="850" fill="#6f8199">
          총 예약
        </text>
        <text x="105" y="124" textAnchor="middle" fontSize="26" fontWeight="850" fill="#10213f">
          {total}건
        </text>
      </svg>

      <div className="space-y-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-[#314965]">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="text-sm font-semibold text-[#526a89]">
              {segment.value}건 ({segment.percent}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleGraph({
  aircraftRows,
  scheduleItems,
  selectedDate,
  dateOptions,
  selectedInstructor,
  instructorOptions,
  today,
  currentTimeMinutes,
}: {
  aircraftRows: string[];
  scheduleItems: ScheduleItem[];
  selectedDate: string;
  dateOptions: { value: string; label: string }[];
  selectedInstructor: string;
  instructorOptions: { value: string; label: string }[];
  today: string;
  currentTimeMinutes: number;
}) {
  const hours = Array.from(
    { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR },
    (_, index) => SCHEDULE_START_HOUR + index,
  );
  const quarterSlots = Array.from(
    { length: SCHEDULE_TOTAL_MIN / SCHEDULE_SLOT_MINUTES + 1 },
    (_, index) => SCHEDULE_START_MIN + index * SCHEDULE_SLOT_MINUTES,
  );
  const showCurrentTimeLine = false;
  const currentTimeLeft = ((currentTimeMinutes - SCHEDULE_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;

  return (
    <ContentCard className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="flex flex-col gap-2.5 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[#10213f]">운항 일정</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#61758f]">항공기별 예약·PFI·정비 타임라인</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/">
          <label className="grid gap-1 text-[13px] font-bold text-[#526a89]">
            날짜
            <select name="date" defaultValue={selectedDate} className="h-10 rounded-xl border border-[#dbe5f1] bg-white px-3.5 text-[14px] font-semibold text-[#10213f] outline-none">
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] font-bold text-[#526a89]">
            교관별 일정
            <select name="instructor" defaultValue={selectedInstructor} className="h-10 rounded-xl border border-[#dbe5f1] bg-white px-3.5 text-[14px] font-semibold text-[#10213f] outline-none">
              {instructorOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-xl border border-[#cfdbea] bg-white px-4 text-[14px] font-bold text-[#274464] transition hover:bg-[#f6f9fd]">조회</button>
        </form>
      </div>

      <div className="overflow-x-auto px-6 pb-4">
        <div className="min-w-[1220px]">
          <div className="grid grid-cols-[110px_1fr] border-b border-[#d4e1ef] pb-2">
            <div className="text-[15px] font-bold text-[#314965]">항공기</div>
            <div className="relative h-8">
              {showCurrentTimeLine ? (
                <div
                  className="absolute bottom-0 top-0 z-20 border-l-2 border-rose-400"
                  style={{ left: `${currentTimeLeft}%` }}
                  aria-hidden="true"
                >
                  <span className="absolute -top-1 left-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                    현재
                  </span>
                </div>
              ) : null}
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="absolute top-0 text-[14px] font-semibold text-[#405875]"
                  style={{ left: `${((hour - SCHEDULE_START_HOUR) / (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR)) * 100}%` }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {aircraftRows.map((aircraftName) => {
            const items = scheduleItems.filter((item) => item.aircraftName === aircraftName);

            return (
              <div
                key={aircraftName}
                className="grid min-h-[74px] grid-cols-[116px_1fr] border-b border-[#e4edf7]"
              >
                <div className="flex items-center gap-2 text-[15px] font-extrabold text-[#10213f]">
                  <span className="text-[#1264f4]">✈</span>
                  {aircraftName}
                </div>

                <div className="relative">
                  {showCurrentTimeLine ? (
                    <div
                      className="absolute bottom-0 top-0 z-10 border-l-2 border-rose-300"
                      style={{ left: `${currentTimeLeft}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {quarterSlots.map((minutes) => {
                    const offset = minutes - SCHEDULE_START_MIN;
                    const isHour = offset % 60 === 0;
                    const isHalfHour = offset % 30 === 0;

                    return (
                      <div
                        key={`${aircraftName}-slot-${minutes}`}
                        className={`absolute bottom-0 top-0 ${
                          isHour
                            ? "border-l-2 border-solid border-[#a9bdd3]"
                            : isHalfHour
                              ? "border-l border-solid border-[#c0d0e2]"
                              : "border-l border-dashed border-[#e4edf7]"
                        }`}
                        style={{ left: `${((minutes - SCHEDULE_START_MIN) / SCHEDULE_TOTAL_MIN) * 100}%` }}
                      />
                    );
                  })}

                  {items.map((item) => {
                    const start = Math.max(timeToMinutes(item.startTime), SCHEDULE_START_MIN);
                    const end = Math.min(timeToMinutes(item.endTime), SCHEDULE_END_MIN);
                    const left = ((start - SCHEDULE_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;
                    const durationMinutes = Math.max(0, end - start);
                    const rawWidth = (durationMinutes / SCHEDULE_TOTAL_MIN) * 100;
                    const width = rawWidth;
                    const displayLeft = left;
                    const isShortBlock = item.bookingType !== "PFI" && durationMinutes <= 30;
                    const dashboardBookingId = item.id.startsWith("pfi-") ? item.id.slice(4) : item.id;

                    return (
                      <div
                        key={item.id}
                        data-dashboard-booking-id={item.bookingType === "PFI" ? undefined : dashboardBookingId}
                        data-dashboard-pfi-for={item.bookingType === "PFI" ? dashboardBookingId : undefined}
                        data-start-time={item.startTime}
                        data-end-time={item.endTime}
                        title={scheduleTooltipText(item)}
                        aria-label={scheduleTooltipText(item)}
                        className={`absolute ${DASHBOARD_SCHEDULE_STICKER_TOP} ${DASHBOARD_SCHEDULE_STICKER_HEIGHT} cursor-help rounded-[6px] border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          item.bookingType === "PFI"
                            ? "z-10 overflow-hidden px-0 py-0"
                            : isShortBlock
                              ? "z-20 overflow-hidden px-1 py-1"
                              : "z-20 overflow-hidden px-2.5 py-1.5"
                        } ${scheduleColorClass(item.bookingType)}`}
                        style={{
                          left: `${displayLeft}%`,
                          width: `${Math.min(width, 100 - displayLeft)}%`,
                          minWidth: item.bookingType === "PFI" ? "46px" : "0px",
                          maxWidth: `${Math.min(width, 100 - displayLeft)}%`,
                        }}
                      >
                        {item.bookingType === "PFI" ? (
                          <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold leading-none text-sky-900" aria-label="PFI">PFI</div>
                        ) : isShortBlock ? (
                          <div className="flex h-full min-h-0 flex-col justify-center gap-0.5 text-[#16365f]">
                            <div className="truncate text-[9.5px] font-medium leading-[11px] text-[#405a78]">{item.bookingType.replace("비행", "")}</div>
                            <div className="truncate text-[11px] font-semibold leading-[12px] text-[#102a52]">{item.userName}</div>
                            {item.instructorName ? <div className="truncate text-[9.5px] font-medium leading-[11px] text-[#405a78]">{item.instructorName.replace(/^교관\s*/, "")}</div> : null}
                          </div>
                        ) : (
                          <div className="flex h-full min-h-0 flex-col justify-center gap-0.5 text-[#16365f]">
                            <div className="truncate text-[11px] font-medium leading-[13px]">{item.bookingType}</div>
                            <div className="truncate text-[13px] font-semibold leading-[14px] text-[#102a52]">{item.userName}</div>
                            {item.instructorName ? <div className="truncate text-[11px] font-medium leading-[13px] text-[#405a78]">{item.instructorName}</div> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 px-6 pb-4 pt-2 text-[11px] font-medium text-[#61758f]">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />교육비행</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />체험비행</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" />렌탈비행</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />PFI</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />정비</span>
      </div>
    </ContentCard>
  );
}

function MiniTable({
  title,
  href,
  headers,
  children,
  className = "",
}: {
  title: string;
  href: string;
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContentCard className={`flex flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)] ${className}`}>
      <div className={DASHBOARD_PANEL_HEADER_CLASS}>
        <div className="min-w-0">
          <h3 className={DASHBOARD_PANEL_TITLE_CLASS}>{title}</h3>
          <p className={DASHBOARD_PANEL_DESC_CLASS}>오늘 이후 확정 예약</p>
        </div>
        <Link href={href} className={DASHBOARD_PANEL_ACTION_CLASS}>
          전체 보기 ›
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 text-[13px]">
        <table className="ui-table w-full table-fixed">
          <thead className="sticky top-0 z-10 bg-[#f6f9fd]">
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </ContentCard>
  );
}

function InstructorScheduleTable({
  items,
}: {
  items: InstructorScheduleSummary[];
}) {
  return (
    <ContentCard className="overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div>
          <h3 className="text-[17px] font-semibold text-[#10213f]">교관별 오늘 일정</h3>
          <p className="mt-1 text-xs font-semibold text-[#6f8199]">교육·체험 등 교관이 필요한 비행만 표시합니다.</p>
        </div>
        <Link href="/instructor-schedules" className="text-xs font-medium text-[#1264f4]">
          교관 스케줄 ›
        </Link>
      </div>

      <div className="max-h-[330px] overflow-y-auto overflow-x-hidden px-5 pb-5">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbfe] p-8 text-center text-sm font-semibold text-[#6f8199]">
            오늘 교관 배정 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((group) => (
              <div key={group.instructorName} className="rounded-2xl border border-[#e2ebf5] bg-white p-3.5">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="font-semibold text-[#10213f]">{group.instructorName}</div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {group.count}건
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {group.items.slice(0, 4).map((item) => (
                    <div key={item.id} className="grid grid-cols-[82px_1fr_78px] items-center gap-2 text-sm">
                      <div className="font-semibold text-[#10213f]">{item.startTime}</div>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-[#314965]">{item.bookingType} · {item.userName}</div>
                        <div className="truncate text-xs font-semibold text-[#6f8199]">{item.courseName}</div>
                      </div>
                      <div className="truncate text-right text-xs font-semibold text-[#526a89]">{item.aircraftName}</div>
                    </div>
                  ))}
                  {group.items.length > 4 ? (
                    <div className="text-xs font-medium text-[#6f8199]">외 {group.items.length - 4}건 더 있음</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ContentCard>
  );
}

function OperationChecklist({
  pendingRequests,
  cancelRequests,
  pendingUsers,
  todayBookings,
  missingFlightLogs,
}: {
  pendingRequests: number;
  cancelRequests: number;
  pendingUsers: number;
  todayBookings: number;
  missingFlightLogs: number;
}) {
  const items = [
    { label: "예약 승인 대기", value: pendingRequests, href: "/bookings?status=요청", tone: "amber" },
    { label: "취소 요청", value: cancelRequests, href: "/bookings?status=취소요청", tone: "rose" },
    { label: "비행일지 미작성", value: missingFlightLogs, href: "/training-logs", tone: "violet" },
    { label: "회원 승인 대기", value: pendingUsers, href: "/users?status=승인대기", tone: "blue" },
    { label: "오늘 확정 운항", value: todayBookings, href: "/bookings?status=확정", tone: "emerald" },
  ];

  const toneClass: Record<string, string> = {
    amber: "bg-[#fffaf0] text-[#7c5b22] border-[#eadcc7]",
    rose: "bg-[#fff7f7] text-[#8a3d4a] border-[#ecd4d9]",
    blue: "bg-[#f4f8ff] text-[#31547c] border-[#d9e4f2]",
    emerald: "bg-[#f5fbf8] text-[#315f50] border-[#d7e9df]",
    sky: "bg-[#f4f9fc] text-[#315d76] border-[#d8e8f2]",
    violet: "bg-[#f8f5ff] text-[#5b4a7a] border-[#e0d8f1]",
  };

  return (
    <ContentCard className="rounded-[22px] border border-[#d9e6f5] bg-white/95 p-3 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="block text-[14px] font-medium leading-none tracking-[-0.01em] text-[#10213f]">오늘 처리할 일</span>
          <p className="mt-1 text-xs font-medium text-[#6f8199]">승인·취소·운항 전 확인 항목</p>
        </div>
        <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-medium text-[#526a89]">
          운영 체크
        </span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition hover:bg-white hover:shadow-sm ${toneClass[item.tone]}`}
          >
            <span className="text-sm font-medium">{item.label}</span>
            <span className="flex items-center gap-2 text-lg font-medium">
              {item.value}건
              <span className="text-xs opacity-50">›</span>
            </span>
          </Link>
        ))}
      </div>
    </ContentCard>
  );
}



function MissingFlightLogPanel({ items }: { items: MissingFlightLogItem[] }) {
  return (
    <ContentCard className="rounded-[22px] border border-[#d9e6f5] bg-white/95 p-3 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[14px] font-medium leading-none tracking-[-0.01em] text-[#10213f]">비행일지 미작성</span>
          <p className="mt-1 text-xs font-medium text-[#61758f]">시간이 지난 확정 운항 중 기록이 없는 항목</p>
        </div>
        <Link href="/training-logs" className="shrink-0 text-xs font-medium text-[#1264f4]">작성 화면 ›</Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] px-3 py-4 text-center text-sm font-medium text-[#6f8199]">
          미작성 비행일지가 없습니다.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-xl border border-[#e5edf7] bg-white px-3 py-2 transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#10213f]">{item.userName} · {item.bookingType}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-[#61758f]">{item.date.slice(5)} {item.time}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f3f7fb] px-2 py-0.5 text-[11px] font-medium text-[#526a89]">작성</span>
              </div>
              <p className="mt-1 truncate text-xs font-medium text-[#6f8199]">{item.aircraftName} · 담당 {item.instructorName}</p>
            </Link>
          ))}
        </div>
      )}
    </ContentCard>
  );
}


function WeatherSummaryCard({ weather }: { weather: WeatherData }) {
  const current = weather.current;
  const runway = weather.runway;
  const components = weather.windComponents;
  const decision = weather.decision;
  const hourly = weather.hourly || [];

  return (
    <ContentCard className="overflow-hidden p-0">
      <div className="flex items-start justify-between px-5 py-3.5">
        <div>
          <span className="block text-[14px] font-medium leading-none tracking-[-0.01em] text-[#10213f]">오늘 기상 요약</span>
          <p className="mt-1 text-[11px] font-medium text-[#61758f]">
            Open-Meteo · 좌표 37.106759, 126.765010
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${weatherToneClass(decision?.tone)}`}>
          {decision?.label || "확인 필요"}
        </span>
      </div>

      {!weather.ok || !current ? (
        <div className="mx-5 mb-5 rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
          날씨 정보를 불러오지 못했습니다. 잠시 후 다시 확인하세요.
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-[11px] font-medium text-blue-700">Active RWY</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{runway?.label || "-"}</p>
              <p className="mt-1 text-[11px] font-medium text-[#61758f]">활주로 {runway?.heading || "-"}° 기준</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-[11px] font-medium text-emerald-700">현재 바람</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{numberText(current.windSpeed, "kt")}</p>
              <p className="mt-1 text-[11px] font-medium text-[#61758f]">{numberText(current.windDirection, "°")} · 돌풍 {numberText(current.windGust, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">측풍</p>
              <p className="mt-1 text-[16px] font-semibold leading-tight text-[#10213f]">{numberText(components?.crosswind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">정풍</p>
              <p className="mt-1 text-[16px] font-semibold leading-tight text-[#10213f]">{numberText(components?.headwind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">배풍</p>
              <p className="mt-1 text-[16px] font-semibold leading-tight text-[#10213f]">{numberText(components?.tailwind, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기온 {numberText(current.temperature, "℃")} · 체감 {numberText(current.apparentTemperature, "℃")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">습도 {numberText(current.humidity, "%")}</div>
            
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기압 {numberText(current.pressureMsl, "hPa")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">강수 {Number(current.precipitation || current.rain || 0).toFixed(1)}mm</div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#fbfdff] p-3">
            <p className="text-xs font-semibold text-[#10213f]">{current.weatherText || "-"} · {decision?.message}</p>
            <p className="mt-1 text-[11px] font-medium text-[#7b8da5]">업데이트 {formatWeatherTime(current.time)}</p>
          </div>

        </div>
      )}
    </ContentCard>
  );
}

function WeatherLineChart({
  title,
  subtitle,
  unit,
  rows,
  series,
}: {
  title: string;
  subtitle: string;
  unit: string;
  rows: { hour: number; label: string; [key: string]: number | string }[];
  series: { key: string; label: string; className: string; stroke: string }[];
}) {
  const width = 760;
  const height = 470;
  const padding = { top: 26, right: 24, bottom: 70, left: 82 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key] || 0)));
  const rawMaxValue = Math.max(1, Math.max(...values));
  const maxValue = Math.max(5, Math.ceil(rawMaxValue / 5) * 5);
  const yTicks = Array.from({ length: Math.floor(maxValue / 5) + 1 }, (_, index) => index * 5);

  function xAt(index: number) {
    if (rows.length <= 1) return padding.left;
    return padding.left + (index / (rows.length - 1)) * chartWidth;
  }

  function yAt(value: number) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  function linePoints(key: string) {
    return rows.map((row, index) => `${xAt(index)},${yAt(Number(row[key] || 0))}`).join(" ");
  }

  function buildSmoothPath(points: { x: number; y: number }[]) {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    const tension = 1;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const afterNext = points[index + 2] || next;

      const cp1x = current.x + ((next.x - previous.x) / 6) * tension;
      const cp1y = current.y + ((next.y - previous.y) / 6) * tension;
      const cp2x = next.x - ((afterNext.x - current.x) / 6) * tension;
      const cp2y = next.y - ((afterNext.y - current.y) / 6) * tension;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }

    return path;
  }

  function smoothLinePath(key: string) {
    const points = rows.map((row, index) => ({
      x: xAt(index),
      y: yAt(Number(row[key] || 0)),
    }));

    return buildSmoothPath(points);
  }

  function areaPath(key: string) {
    const points = rows.map((row, index) => ({
      x: xAt(index),
      y: yAt(Number(row[key] || 0)),
    }));
    const top = buildSmoothPath(points);
    const lastX = xAt(rows.length - 1);
    const firstX = xAt(0);
    const bottomY = padding.top + chartHeight;
    return `${top} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }

  function colorToken(stroke: string) {
    if (stroke === "#2563eb") return { solid: "#2563eb", glow: "rgba(37,99,235,0.12)", fillStart: "rgba(37,99,235,0.16)", fillEnd: "rgba(37,99,235,0.02)" };
    if (stroke === "#f59e0b") return { solid: "#f59e0b", glow: "rgba(245,158,11,0.14)", fillStart: "rgba(245,158,11,0.13)", fillEnd: "rgba(245,158,11,0.02)" };
    if (stroke === "#f43f5e") return { solid: "#f43f5e", glow: "rgba(244,63,94,0.12)", fillStart: "rgba(244,63,94,0.12)", fillEnd: "rgba(244,63,94,0.02)" };
    return { solid: stroke, glow: "rgba(100,116,139,0.12)", fillStart: "rgba(100,116,139,0.12)", fillEnd: "rgba(100,116,139,0.02)" };
  }

  const chartIdBase = title.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="rounded-[22px] border border-[#dfe8f5] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)] px-3 py-2.5 shadow-[0_10px_30px_rgba(20,46,80,0.05)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className={DASHBOARD_WEATHER_INNER_TITLE_CLASS}>{title}</p>
          <p className={DASHBOARD_WEATHER_INNER_DESC_CLASS}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {series.map((item) => {
            const palette = colorToken(item.stroke);
            const latest = Number(rows[rows.length - 1]?.[item.key] || 0);

            return (
              <span
                key={item.key}
                className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-[#42566f] shadow-sm"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.solid }} />
                {item.label} {latest}
              </span>
            );
          })}
          <span className="ml-0.5 shrink-0 text-[10px] font-semibold text-[#334963]">{unit}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[#edf2f7] bg-white/90 px-3 py-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-0">
          <defs>
            {series.map((item) => {
              const palette = colorToken(item.stroke);
              return (
                <linearGradient key={`${item.key}-gradient`} id={`${chartIdBase}-${item.key}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={palette.fillStart} />
                  <stop offset="100%" stopColor={palette.fillEnd} />
                </linearGradient>
              );
            })}
            {series.map((item) => {
              const palette = colorToken(item.stroke);
              return (
                <filter key={`${item.key}-shadow`} id={`${chartIdBase}-${item.key}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={palette.glow} />
                </filter>
              );
            })}
          </defs>

          {yTicks.map((tick, index) => (
            <g key={`y-${tick}-${index}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke={tick === 0 ? "#dbe5f1" : "#eef3f8"}
                strokeWidth={tick === 0 ? "1.4" : "1"}
                strokeDasharray={tick === 0 ? "" : "3 4"}
              />
              <text
                x={padding.left - 14}
                y={yAt(tick) + 5}
                textAnchor="end"
                fill="#263b55"
                fontSize="20"
                fontWeight="850"
              >
                {tick}
              </text>
            </g>
          ))}

          {rows.map((row, index) => (
            <g key={`x-${row.label}-${index}`}>
              <line
                x1={xAt(index)}
                x2={xAt(index)}
                y1={padding.top}
                y2={padding.top + chartHeight}
                stroke="#f5f8fc"
                strokeWidth="1"
              />
              {(index % 2 === 0 && row.label !== "20:00") ? (
                <text
                  x={xAt(index)}
                  y={height - 14}
                  textAnchor="middle"
                  fill="#263b55"
                  fontSize="20"
                  fontWeight="850"
                >
                  {row.label}
                </text>
              ) : null}
            </g>
          ))}

          {series.map((item) => (
            <path
              key={`${item.key}-area`}
              d={areaPath(item.key)}
              fill={`url(#${chartIdBase}-${item.key}-fill)`}
            />
          ))}

          {series.map((item) => (
            <path
              key={`${item.key}-line`}
              d={smoothLinePath(item.key)}
              fill="none"
              stroke={item.stroke}
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${chartIdBase}-${item.key}-shadow)`}
            />
          ))}

          {series.map((item) => (
            <g key={`dots-${item.key}`}>
              {rows.map((row, index) => (
                <g key={`${item.key}-${row.label}`}>
                  <circle
                    cx={xAt(index)}
                    cy={yAt(Number(row[item.key] || 0))}
                    r="4.1"
                    fill="#ffffff"
                    stroke={item.stroke}
                    strokeWidth="3"
                  />
                  <circle
                    cx={xAt(index)}
                    cy={yAt(Number(row[item.key] || 0))}
                    r="2.2"
                    fill={item.stroke}
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function WeatherDetailPanel({ weather }: { weather: WeatherData }) {
  const sourceRows = (weather.hourly || []).filter((item) => {
    const hour = Number(item.time.slice(11, 13));
    return hour >= 7 && hour <= 20;
  });

  const sourceMap = new Map(sourceRows.map((item) => [Number(item.time.slice(11, 13)), item]));
  const rows = Array.from({ length: 14 }, (_, index) => {
    const hour = index + 7;
    const item = sourceMap.get(hour);

    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      windSpeed: Math.round(Number(item?.windSpeed || 0)),
      windGust: Math.round(Number(item?.windGust || 0)),
      temperature: Math.round(Number(item?.temperature || 0)),
    };
  });
  const hasWeatherRows = sourceRows.some((item) => !item.missing);

  return (
    <ContentCard className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className={DASHBOARD_PANEL_HEADER_CLASS}>
        <div className="min-w-0">
          <h3 className={DASHBOARD_PANEL_TITLE_CLASS}>시간별 기상 그래프</h3>
          <p className={DASHBOARD_PANEL_DESC_CLASS}>07:00~20:00 전체 시간대 표시</p>
        </div>
        <span className={`${DASHBOARD_PANEL_BADGE_CLASS} bg-sky-50 text-sky-700`}>Open-Meteo</span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4">
        {!hasWeatherRows ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
            07:00~20:00 기상 정보를 불러오지 못했습니다.
          </div>
        ) : (
          <div className="grid gap-2.5">
            <WeatherLineChart
              title="풍속·돌풍 변화"
              subtitle="시간에 따른 바람 세기 변화"
              unit="kt"
              rows={rows}
              series={[
                { key: "windSpeed", label: "풍속", className: "bg-blue-50 text-blue-700", stroke: "#2563eb" },
                { key: "windGust", label: "돌풍", className: "bg-amber-50 text-amber-700", stroke: "#f59e0b" },
              ]}
            />

            <WeatherLineChart
              title="기온 변화"
              subtitle="운영시간 중 시간별 기온"
              unit="℃"
              rows={rows}
              series={[
                { key: "temperature", label: "기온", className: "bg-rose-50 text-rose-700", stroke: "#f43f5e" },
              ]}
            />
          </div>
        )}
      </div>
    </ContentCard>
  );
}

function RecentActivityPanel({
  activities,
  className = "",
}: {
  activities: { time: string; title: string; detail: string; tone: string }[];
  className?: string;
}) {
  const dotClass: Record<string, string> = {
    blue: "bg-blue-500",
    sky: "bg-sky-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
  };

  return (
    <ContentCard className={`flex min-h-0 flex-col p-3 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <span className="block text-[14px] font-medium leading-none tracking-[-0.01em] text-[#10213f]">최근 작업 내역</span>
          <p className="mt-1 text-[11px] font-medium text-[#61758f]">예약·회원·교육생 기준 최근 작업</p>
        </div>
        <Link href="/logs" className="text-xs font-medium text-[#1264f4]">로그 보기 ›</Link>
      </div>

      {activities.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-center text-sm font-medium text-[#6f8199]">
          최근 작업 내역이 없습니다.
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {activities.map((activity, index) => (
            <div key={`${activity.time}-${activity.title}-${index}`} className="flex gap-2.5 rounded-xl border border-[#edf2f7] bg-white px-3 py-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[activity.tone] || "bg-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-[#10213f]" title={activity.title}>{activity.title}</p>
                  <span className="shrink-0 text-[11px] font-medium text-[#8a9ab0]">{shortActivityTime(activity.time)}</span>
                </div>
                {activity.detail ? (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[#61758f]" title={activity.detail}>
                    {activity.detail}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentCard>
  );
}




function InstructorAssignmentSummaryPanel({
  items,
  className = "",
}: {
  items: {
    id: string;
    name: string;
    count: number;
    firstTime: string;
    totalMinutes: number;
    workLabel: string;
    workTone: string;
    statusText: string;
    statusTone: string;
    nextLabel: string;
    items: {
      id: string;
      startTime: string;
      endTime: string;
      userName: string;
      bookingType: string;
      aircraftName: string;
    }[];
    hiddenCount: number;
  }[];
  className?: string;
}) {
  const totalAssigned = items.reduce((sum, item) => sum + item.count, 0);

  const formatAssignedMinutes = (minutes: number) => {
    if (!minutes) return "0분";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours && rest) return `${hours}시간 ${rest}분`;
    if (hours) return `${hours}시간`;
    return `${rest}분`;
  };

  return (
    <ContentCard className={`flex min-h-0 flex-col overflow-hidden p-0 ${className}`}>
      <div className={DASHBOARD_PANEL_HEADER_CLASS}>
        <div className="min-w-0">
          <h3 className={DASHBOARD_PANEL_TITLE_CLASS}>교관별 오늘 배정</h3>
          <p className={DASHBOARD_PANEL_DESC_CLASS}>교관별 근무 상태·다음 일정·배정 요약</p>
        </div>
        <span className={`${DASHBOARD_PANEL_BADGE_CLASS} bg-blue-50 text-blue-700`}>총 {totalAssigned}건</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto px-4 pb-3 lg:grid-cols-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-3 text-center text-sm font-medium text-[#6f8199] lg:col-span-2">
            배정된 교관 일정이 없습니다.
          </div>
        ) : (
          items.slice(0, 8).map((item) => {
            const preview = item.items[0];
            const second = item.items[1];
            const compactStatus =
              item.workLabel === "휴무"
                ? "오늘 휴무"
                : item.workLabel === "비활성"
                  ? "비활성"
                  : item.nextLabel === "대기"
                    ? "대기 가능"
                    : item.nextLabel === "종료"
                      ? "일정 종료"
                      : item.nextLabel || item.statusText;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[#e7eef7] bg-white px-3 py-2 shadow-[0_8px_18px_rgba(20,46,80,0.035)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-[#10213f]">{item.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${instructorStatusBadgeClass(item.workTone)}`}>
                      {item.workLabel}
                    </span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.count ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500"}`}>
                    {item.count}건
                  </span>
                </div>

                <div className="mt-1 grid grid-cols-[58px_1fr] items-center gap-2 rounded-xl bg-[#f8fbff] px-2.5 py-1.5">
                  <span className="text-[10.5px] font-semibold text-[#7a8ca3]">다음 일정</span>
                  {preview ? (
                    <p className="min-w-0 truncate text-[11.5px] font-semibold text-[#10213f]">
                      {preview.startTime}~{preview.endTime} · {preview.userName} · {preview.aircraftName}
                    </p>
                  ) : (
                    <p className="min-w-0 truncate text-[11.5px] font-semibold text-[#10213f]">
                      {compactStatus}
                    </p>
                  )}
                </div>

                <div className="mt-1.5 rounded-xl border border-[#edf2f7] bg-white px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold text-[#61758f]">
                      오늘 배정 {item.count}건 · {formatAssignedMinutes(item.totalMinutes)}
                    </span>
                    {item.count > 2 ? (
                      <span className="text-[10.5px] font-semibold text-[#1264f4]">외 {item.count - 2}건</span>
                    ) : null}
                  </div>

                  {preview ? (
                    <div className="mt-1 space-y-0.5 text-[10.5px]">
                      <div className="grid grid-cols-[70px_1fr_58px] gap-2">
                        <span className="font-semibold text-[#10213f]">{preview.startTime}~{preview.endTime}</span>
                        <span className="min-w-0 truncate font-medium text-[#405875]">
                          {preview.userName} · {preview.bookingType.replace("비행", "")}
                        </span>
                        <span className="truncate text-right font-semibold text-[#7b8da5]">{preview.aircraftName}</span>
                      </div>
                      {second ? (
                        <div className="grid grid-cols-[70px_1fr_58px] gap-2">
                          <span className="font-semibold text-[#10213f]">{second.startTime}~{second.endTime}</span>
                          <span className="min-w-0 truncate font-medium text-[#405875]">
                            {second.userName} · {second.bookingType.replace("비행", "")}
                          </span>
                          <span className="truncate text-right font-semibold text-[#7b8da5]">{second.aircraftName}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 truncate text-[10.5px] font-medium text-[#7a8ca3]">
                      {item.workLabel === "휴무" ? "오늘 휴무로 배정된 예약이 없습니다." : "오늘 배정된 예약이 없습니다."}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </ContentCard>
  );
}



function DashboardDebugPanel({
  bookings,
  aircraft,
  selectedDate,
  today,
  scheduleItems,
  aircraftRows,
}: {
  bookings: Row[];
  aircraft: Row[];
  selectedDate: string;
  today: string;
  scheduleItems: ScheduleItem[];
  aircraftRows: string[];
}) {
  const selectedDateBookings = bookings.filter((booking) => normalizeDate(getBookingDateValue(booking)) === selectedDate);
  const activeSelectedDateBookings = selectedDateBookings.filter(isActiveBooking);
  const sampleBookings = bookings.slice(0, 5).map((booking) => ({
    id: text(booking.bookingId, "-"),
    date: normalizeDate(getBookingDateValue(booking)),
    aircraftId: text(booking.aircraftId, "-"),
    aircraftName: text(booking.aircraftName || booking.aircraft || booking.registrationNo, "-"),
    start: normalizeTime(getBookingStartValue(booking)),
    end: normalizeTime(getBookingEndValue(booking)),
    status: text(getBookingStatus(booking), "-"),
  }));

  return (
    <ContentCard className="rounded-[18px] border border-amber-200 bg-amber-50/80 p-3 text-[12px] text-[#5f4517]">
      <div className="mb-2 text-[14px] font-bold text-amber-800">대시보드 디버그</div>
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div><b>today</b><br />{today}</div>
        <div><b>selectedDate</b><br />{selectedDate}</div>
        <div><b>bookings</b><br />{bookings.length}건</div>
        <div><b>selected bookings</b><br />{selectedDateBookings.length}건</div>
        <div><b>active selected</b><br />{activeSelectedDateBookings.length}건</div>
        <div><b>scheduleItems</b><br />{scheduleItems.length}건</div>
        <div><b>aircraft</b><br />{aircraft.length}대</div>
        <div><b>aircraftRows</b><br />{aircraftRows.length}대</div>
      </div>
      <pre className="mt-3 max-h-[190px] overflow-auto rounded-xl border border-amber-200 bg-white/80 p-3 text-[11px] leading-5 text-[#263b55]">
        {JSON.stringify({ aircraftRows, sampleBookings }, null, 2)}
      </pre>
    </ContentCard>
  );
}


function DashboardSidePanel({
  pendingRequests,
  cancelRequests,
  pendingUsers,
  todayBookings,
  missingFlightLogs,
  missingFlightLogItems,
}: {
  pendingRequests: number;
  cancelRequests: number;
  pendingUsers: number;
  todayBookings: number;
  missingFlightLogs: number;
  missingFlightLogItems: MissingFlightLogItem[];
}) {
  return (
    <div className="grid gap-2.5">
      <OperationChecklist
        pendingRequests={pendingRequests}
        cancelRequests={cancelRequests}
        pendingUsers={pendingUsers}
        todayBookings={todayBookings}
        missingFlightLogs={missingFlightLogs}
      />
      <MissingFlightLogPanel items={missingFlightLogItems} />
    </div>
  );
}


export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const params = await Promise.resolve(searchParams || {});
  const {
    bookings,
    users,
    aircraft,
    instructors,
    notifications,
    instructorSchedules,
    trainingLogs,
    flightRecords,
    logs,
  } = await safeGetDashboardData();
  const today = todayText();
  const nowMinutes = currentKstMinutes();
  const dateOptions = createDateOptions(today);
  const requestedDate = firstParam(params.date);
  const selectedDate = dateOptions.some((option) => option.value === requestedDate) ? requestedDate : today;
  const selectedInstructor = firstParam(params.instructor) || "all";
  const aircraftLookup = createAircraftLookup(aircraft);
  const visibleDashboardAircraft = buildDashboardAircraftResources(aircraft, bookings, aircraftLookup);
  const scheduleItems = buildScheduleItems(bookings, visibleDashboardAircraft, selectedDate, aircraftLookup);
  const filteredScheduleItems = selectedInstructor === "all"
    ? scheduleItems
    : scheduleItems.filter((item) => item.instructorKey === selectedInstructor || item.instructorName.includes(selectedInstructor));
  const aircraftRows = buildAircraftRows(visibleDashboardAircraft);
  const activeAircraft = visibleDashboardAircraft;
  const activeInstructors = instructors.filter((item) => isActive(item.active) && !["비활성", "퇴사"].includes(text(item.status)));
  const workingInstructorCount = countWorkingInstructors(activeInstructors, instructorSchedules, today);
  const instructorOptions = [
    { value: "all", label: "전체 교관" },
    ...activeInstructors.map((item) => {
      const name = text(item.name || item.instructorName, "이름 미입력");
      const id = text(item.instructorId || name);
      return { value: id, label: `${name}${text(item.instructorId) ? ` / ${text(item.instructorId)}` : ""}` };
    }),
  ];

  const todayBookings = bookings
    .filter((booking) => normalizeDate(getBookingDateValue(booking)) === today)
    .filter(isActiveBooking);
  const todayScheduleItems = buildScheduleItems(bookings, visibleDashboardAircraft, today, aircraftLookup);
  const instructorTodaySchedules = buildInstructorScheduleSummary(todayScheduleItems);
  const pendingRequestBookings = bookings.filter((booking) => getBookingStatus(booking).replace(/\s/g, "") === "요청");
  const cancelRequestBookings = bookings.filter((booking) => isCancelRequestStatus(getBookingStatus(booking)));
  const pendingUsers = users.filter(isPendingUser);
  const approvalWaitingCount = pendingRequestBookings.length + cancelRequestBookings.length + pendingUsers.length;
  const todayFlightHours = sumFlightHours(todayBookings);
  const upcomingBookings = [...bookings]
    .filter((booking) => normalizeDate(getBookingDateValue(booking)) >= today)
    .filter(isActiveBooking)
    .sort((a, b) => `${normalizeDate(getBookingDateValue(a))} ${normalizeTime(getBookingStartValue(a))}`.localeCompare(`${normalizeDate(getBookingDateValue(b))} ${normalizeTime(getBookingStartValue(b))}`))
    .slice(0, 5);
  const recentActivities = buildRecentActivities(logs, notifications, bookings);
  const instructorAssignmentSummary = buildInstructorAssignmentSummary(activeInstructors, todayScheduleItems, instructorSchedules, today, nowMinutes);
  const missingFlightLogItems = buildMissingFlightLogItems(bookings, trainingLogs, flightRecords, aircraftLookup, today, nowMinutes);

  return (
    <PageContainer title="관리자 대시보드" description="하늘누리 비행교육원의 운영 현황을 한눈에 확인하세요.">
      <DashboardTimeSunSummary today={today} />
      <div className="w-full overflow-x-auto pb-3">
      <div className="grid w-[1690px] shrink-0 items-stretch gap-2.5 grid-cols-[1310px_360px]">
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2.5">
          <ScheduleGraph
            aircraftRows={aircraftRows}
            scheduleItems={filteredScheduleItems}
            selectedDate={selectedDate}
            dateOptions={dateOptions}
            selectedInstructor={selectedInstructor}
            instructorOptions={instructorOptions}
            today={today}
            currentTimeMinutes={nowMinutes}
          />

          <div className="grid min-h-0 items-stretch gap-2.5 grid-cols-[520px_778px]">
            <MiniTable title="다가오는 예약" href="/bookings" headers={["예약자", "시간", "유형", "항공기", "교관", "상태"]} className="h-full min-h-[360px]">
            {upcomingBookings.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-[#6f8199]">다가오는 예약이 없습니다.</td></tr>
            ) : (
            upcomingBookings.map((booking, index) => {
            const actions = bookingActionOptions(booking);
            const bookingType = getBookingType(booking);
            return (
            <tr key={text(booking.bookingId) || index}>
            <td className="truncate font-semibold text-[#10213f]">{text(booking.userName || booking.name || booking.customerName || booking.memberName, "-")}</td>
            <td>
            <div className="font-semibold text-[#10213f]">{normalizeDate(getBookingDateValue(booking)).slice(5)}</div>
            <div className="text-xs font-semibold text-[#6f8199]">{normalizeTime(getBookingStartValue(booking))}~{normalizeTime(getBookingEndValue(booking))}</div>
            </td>
            <td>
            <span className={`ui-badge w-fit whitespace-nowrap px-2.5 py-1 text-[11px] ${scheduleColorClass(bookingType)}`}>
            {bookingType}
            </span>
            </td>
            <td className="whitespace-nowrap text-[12px] font-semibold text-[#10213f]">{getBookingAircraftName(booking, aircraftLookup)}</td>
            <td className="truncate text-[12px] font-semibold text-[#10213f]">{isRentalBookingType(bookingType) ? "-" : text(getBookingInstructorName(booking), "-")}</td>
            <td>
            <div className="flex flex-col gap-1.5">
            <span className={`ui-badge w-fit px-2 py-0.5 text-[10px] ${badgeClass(getDisplayBookingStatus(booking))}`}>{getDisplayBookingStatus(booking) || "-"}</span>
            {actions.length > 0 ? (
            <div className="flex gap-1.5">
            {actions.map((action) => (
            <form key={`${text(booking.bookingId)}-${action.nextStatus}`} action={updateDashboardBookingStatus}>
            <input type="hidden" name="booking" value={JSON.stringify(booking)} />
            <input type="hidden" name="nextStatus" value={action.nextStatus} />
            <input type="hidden" name="actionLabel" value={action.actionLabel} />
            <button
            type="submit"
            className={`rounded-lg px-3 py-1 text-xs font-extrabold ${action.tone === "primary" ? "bg-blue-600 text-white" : action.tone === "danger" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}
            >
            {action.label}
            </button>
            </form>
            ))}
            </div>
            ) : null}
            </div>
            </td>
            </tr>
            );
            })
            )}
            </MiniTable>

            <InstructorAssignmentSummaryPanel items={instructorAssignmentSummary} className="h-full min-h-[360px]" />
          </div>
        </div>

        <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2.5">
          <DashboardSidePanel
            pendingRequests={pendingRequestBookings.length}
            cancelRequests={cancelRequestBookings.length}
            pendingUsers={pendingUsers.length}
            todayBookings={todayBookings.filter((booking) => getDisplayBookingStatus(booking) === "확정").length}
            missingFlightLogs={missingFlightLogItems.length}
            missingFlightLogItems={missingFlightLogItems}
          />
          <RecentActivityPanel activities={recentActivities} className="h-full min-h-[360px]" />
        </div>
      </div>
      </div>
    </PageContainer>
  );
}


