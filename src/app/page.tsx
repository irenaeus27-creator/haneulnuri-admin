import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

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

const SCHEDULE_START_HOUR = 7;
const SCHEDULE_END_HOUR = 20;
const SCHEDULE_START_MIN = SCHEDULE_START_HOUR * 60;
const SCHEDULE_END_MIN = SCHEDULE_END_HOUR * 60;
const SCHEDULE_TOTAL_MIN = SCHEDULE_END_MIN - SCHEDULE_START_MIN;

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
    logs: [],
  };

  try {
    const directData = await safeFetchAppsScriptDashboardData();

    if (normalizeRows(directData.bookings).length > 0 || normalizeRows(directData.aircraft).length > 0) {
      return {
        bookings: normalizeRows(directData.bookings),
        users: normalizeRows(directData.users),
        aircraft: normalizeRows(directData.aircraft),
        instructors: normalizeRows(directData.instructors),
        students: normalizeRows(directData.students),
        notifications: normalizeRows(directData.notifications),
        instructorSchedules: normalizeRows(directData.instructorSchedules),
        trainingCharges: normalizeRows(directData.trainingCharges),
        logs: normalizeRows(directData.logs),
      };
    }

    const baseUrl = getAppBaseUrl();

    const [dashboardResult, bookingsResult] = await Promise.allSettled([
      fetch(`${baseUrl}/api/dashboard?_ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`${baseUrl}/api/bookings?_ts=${Date.now()}`, { cache: "no-store" }),
    ]);

    let dashboardData: DashboardApiResponse = {};
    let bookingCalendarData: BookingsApiResponse = {};

    if (dashboardResult.status === "fulfilled" && dashboardResult.value.ok) {
      dashboardData = (await dashboardResult.value.json()) as DashboardApiResponse;
    }

    if (bookingsResult.status === "fulfilled" && bookingsResult.value.ok) {
      bookingCalendarData = (await bookingsResult.value.json()) as BookingsApiResponse;
    }

    return {
      bookings: normalizeRows(bookingCalendarData.bookings).length > 0
        ? normalizeRows(bookingCalendarData.bookings)
        : normalizeRows(dashboardData.bookings),
      users: normalizeRows(dashboardData.users),
      aircraft: normalizeRows(bookingCalendarData.aircraft).length > 0
        ? normalizeRows(bookingCalendarData.aircraft)
        : normalizeRows(dashboardData.aircraft),
      instructors: normalizeRows(bookingCalendarData.instructors).length > 0
        ? normalizeRows(bookingCalendarData.instructors)
        : normalizeRows(dashboardData.instructors),
      students: normalizeRows(dashboardData.students),
      notifications: normalizeRows(dashboardData.notifications),
      instructorSchedules: normalizeRows(dashboardData.instructorSchedules),
      trainingCharges: normalizeRows(dashboardData.trainingCharges),
      logs: normalizeRows(dashboardData.logs),
    };
  } catch (error) {
    console.error("대시보드 데이터를 불러오지 못했습니다.", error);
    return emptyData;
  }
}


async function safeGetWeatherData(): Promise<WeatherData> {
  try {
    const baseUrl = getAppBaseUrl();
    const response = await fetch(`${baseUrl}/api/weather/open-meteo`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`날씨 API 오류: ${response.status}`);
    }

    return (await response.json()) as WeatherData;
  } catch (error) {
    console.error("날씨 정보를 불러오지 못했습니다.", error);
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

function normalizeDate(value: unknown) {
  const valueText = sharedFormatBookingDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value);
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
          <p className="text-[11px] font-bold text-[#7b8da5]">현재 날짜</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#10213f]">{dateLabel}</p>
        </div>
        <div className="border-r border-[#edf2f7] px-4 py-2.5">
          <p className="text-[11px] font-bold text-[#7b8da5]">현재 시간</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#10213f]">{timeLabel}</p>
        </div>
        <div className="border-r border-[#edf2f7] px-4 py-2.5">
          <p className="text-[11px] font-bold text-[#7b8da5]">일출</p>
          <p className="mt-0.5 text-sm font-extrabold text-orange-600">{sunrise}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] font-bold text-[#7b8da5]">일몰</p>
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

function isCancelledStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "");
  return ["취소", "취소완료", "반려", "노쇼", "기상취소", "cancelled", "rejected"].includes(status);
}

function isConfirmedStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "");
  return status === "확정" || status === "승인완료" || status.toLowerCase() === "approved";
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

function buildScheduleItems(bookings: Row[], aircraftResources: Row[], selectedDate: string): ScheduleItem[] {
  const visibleBookings = bookings
    .filter((row) => normalizeDate(getBookingDateValue(row)) === selectedDate)
    .filter((row) => !isCancelledStatus(getBookingStatus(row)));

  const items: ScheduleItem[] = [];

  aircraftResources.forEach((resource) => {
    const aircraftName = aircraftDisplay(resource);

    visibleBookings
      .filter((row) => bookingMatchesAircraftResource(row, resource))
      .forEach((row, index) => {
        const bookingType = getBookingType(row);
        const bookingId = text(
          row.bookingId,
          `${aircraftName}-${normalizeDate(getBookingDateValue(row))}-${normalizeTime(getBookingStartValue(row))}-${index}`,
        );
        const startTime = normalizeTime(getBookingStartValue(row));
        const endTime = normalizeTime(getBookingEndValue(row));

        if (requiresPfi(row)) {
          const startMinutes = timeToMinutes(startTime);
          const pfiStart = Math.max(0, startMinutes - 30);
          const pfiEnd = startMinutes;

          if (pfiEnd > pfiStart) {
            items.push({
              id: `pfi-${bookingId}`,
              date: normalizeDate(getBookingDateValue(row)),
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

        items.push({
          id: bookingId,
          date: normalizeDate(getBookingDateValue(row)),
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

function buildRecentActivities(logs: Row[], notifications: Row[], bookings: Row[]) {
  const logItems = logs.map((log) => ({
    time: text(log.createdAt || log.timestamp || log.updatedAt),
    title: text(log.action || log.message || log.title, "운영 기록"),
    detail: text(log.targetSheet || log.targetId || log.userName || log.status, ""),
    tone: "blue",
  }));

  const notificationItems = notifications.map((notification) => ({
    time: text(notification.createdAt || notification.sentAt || notification.updatedAt),
    title: text(notification.title || notification.message || notification.type, "알림 기록"),
    detail: text(notification.status || notification.targetName || notification.targetType, ""),
    tone: "sky",
  }));

  const bookingItems = bookings.map((booking) => ({
    time: text(booking.updatedAt || booking.createdAt || `${normalizeDate(getBookingDateValue(booking))} ${normalizeTime(getBookingStartValue(booking))}`),
    title: `예약 ${text(getBookingStatus(booking), "변경")} · ${text(booking.userName || booking.name, "예약자 미입력")}`,
    detail: `${normalizeDate(getBookingDateValue(booking))} ${normalizeTime(getBookingStartValue(booking))} ${getBookingType(booking)}`,
    tone: text(getBookingStatus(booking)).includes("취소") ? "rose" : "emerald",
  }));

  return [...logItems, ...notificationItems, ...bookingItems]
    .filter((item) => item.time || item.title)
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 6);
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
    memo: "대시보드 30분 이동 기능에서 자동 생성",
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
    <ContentCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          {icon}
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#243b63]">{title}</p>
          <p className="mt-1 text-[24px] font-bold leading-none tracking-[-0.02em] text-[#10213f]">
            {value}
          </p>
          <p className="mt-1.5 text-[11px] font-bold text-[#6f8199]">{sub}</p>
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
      <div className="mb-1 flex items-center gap-4 px-2 text-xs font-bold text-[#526a89]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#1264f4]" />예약 건수</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />총 비행시간</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const y = top + innerH - (index / 5) * innerH;
          return (
            <g key={index}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="#dbe5f1" />
              <text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" fontWeight="850" fill="#6f8199">
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
            <text x={point.x} y={height - 9} textAnchor="middle" fontSize="11" fontWeight="850" fill="#536985">
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
          <div key={segment.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-[#314965]">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="text-sm font-bold text-[#526a89]">
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
  const showCurrentTimeLine =
    selectedDate === today &&
    currentTimeMinutes >= SCHEDULE_START_MIN &&
    currentTimeMinutes <= SCHEDULE_END_MIN;
  const currentTimeLeft = ((currentTimeMinutes - SCHEDULE_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;

  return (
    <ContentCard className="flex h-full min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[#10213f]">운항 일정</h2>
          <p className="mt-0.5 text-[12px] font-medium text-[#61758f]">항공기별 예약·PFI·정비 타임라인</p>
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

      <div className="px-6 pb-4">
        <div className="w-full min-w-0">
          <div className="grid grid-cols-[110px_1fr] border-b border-[#dbe5f1] pb-2">
            <div className="text-[15px] font-bold text-[#314965]">항공기</div>
            <div className="relative h-8">
              {showCurrentTimeLine ? (
                <div
                  className="absolute bottom-0 top-0 z-20 border-l-2 border-rose-400"
                  style={{ left: `${currentTimeLeft}%` }}
                  aria-hidden="true"
                >
                  <span className="absolute -top-1 left-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
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
                className="grid min-h-[92px] grid-cols-[116px_1fr] border-b border-[#edf2f7]"
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
                  {hours.map((hour, index) => (
                    <div
                      key={`${aircraftName}-${hour}`}
                      className="absolute bottom-0 top-0 border-l border-dashed border-[#dbe5f1]"
                      style={{ left: `${((hour - SCHEDULE_START_HOUR) / (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR)) * 100}%` }}
                    />
                  ))}

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
                        className={`absolute top-3 h-[68px] cursor-help rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          item.bookingType === "PFI"
                            ? "z-10 overflow-hidden px-0 py-0"
                            : isShortBlock
                              ? "z-20 overflow-hidden px-1 py-1"
                              : "z-20 overflow-hidden px-3.5 py-2"
                        } ${scheduleColorClass(item.bookingType)}`}
                        style={{
                          left: `${displayLeft}%`,
                          width: `${Math.min(width, 100 - displayLeft)}%`,
                          minWidth: item.bookingType === "PFI" ? "56px" : "0px",
                        }}
                      >
                        {item.bookingType === "PFI" ? (
                          <div className="flex h-full w-full items-center justify-center text-[15px] font-semibold leading-none text-sky-900" aria-label="PFI">PFI</div>
                        ) : isShortBlock ? (
                          <div className="flex h-full min-h-0 flex-col items-center justify-center text-center text-[#16365f]">
                            <div className="max-w-full truncate text-[11px] font-semibold leading-[14px] text-[#102a52]">{item.userName}</div>
                            <div className="max-w-full truncate text-[9px] font-normal leading-[11px] text-[#405a78]">{item.bookingType.replace("비행", "")}</div>
                            {item.instructorName ? <div className="max-w-full truncate text-[10.5px] font-normal leading-[12px] text-[#405a78]">{item.instructorName.replace(/^교관\s*/, "")}</div> : null}
                          </div>
                        ) : (
                          <div className="flex h-full min-h-0 flex-col justify-center gap-0.5 text-[#16365f]">
                            <div className="truncate text-[12px] font-medium leading-[16px]">{item.bookingType}</div>
                            <div className="truncate text-[14px] font-semibold leading-[18px] text-[#102a52]">{item.userName}</div>
                            {item.instructorName ? <div className="truncate text-[13px] font-normal leading-[17px] text-[#405a78]">{item.instructorName}</div> : null}
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

      <div className="flex flex-wrap items-center gap-5 px-6 pb-4 pt-2 text-xs font-medium text-[#61758f]">
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
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <h3 className="text-lg font-bold text-[#10213f]">{title}</h3>
        <Link href={href} className="text-xs font-bold text-[#1264f4]">
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
          <h3 className="text-[17px] font-bold text-[#10213f]">교관별 오늘 일정</h3>
          <p className="mt-1 text-xs font-bold text-[#6f8199]">교육·체험 등 교관이 필요한 비행만 표시합니다.</p>
        </div>
        <Link href="/instructor-schedules" className="text-xs font-bold text-[#1264f4]">
          교관 스케줄 ›
        </Link>
      </div>

      <div className="max-h-[330px] overflow-y-auto overflow-x-hidden px-5 pb-5">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbfe] p-8 text-center text-sm font-bold text-[#6f8199]">
            오늘 교관 배정 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((group) => (
              <div key={group.instructorName} className="rounded-2xl border border-[#e2ebf5] bg-white p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-[#10213f]">{group.instructorName}</div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {group.count}건
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {group.items.slice(0, 4).map((item) => (
                    <div key={item.id} className="grid grid-cols-[82px_1fr_78px] items-center gap-2 text-sm">
                      <div className="font-bold text-[#10213f]">{item.startTime}</div>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-[#314965]">{item.bookingType} · {item.userName}</div>
                        <div className="truncate text-xs font-bold text-[#6f8199]">{item.courseName}</div>
                      </div>
                      <div className="truncate text-right text-xs font-bold text-[#526a89]">{item.aircraftName}</div>
                    </div>
                  ))}
                  {group.items.length > 4 ? (
                    <div className="text-xs font-bold text-[#6f8199]">외 {group.items.length - 4}건 더 있음</div>
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
}: {
  pendingRequests: number;
  cancelRequests: number;
  pendingUsers: number;
  todayBookings: number;
}) {
  const items = [
    { label: "예약 승인 대기", value: pendingRequests, href: "/bookings?status=요청", tone: "amber" },
    { label: "취소 요청", value: cancelRequests, href: "/bookings?status=취소요청", tone: "rose" },
    { label: "회원 승인 대기", value: pendingUsers, href: "/users?status=승인대기", tone: "blue" },
    { label: "오늘 확정 운항", value: todayBookings, href: "/bookings?status=확정", tone: "emerald" },
  ];

  const toneClass: Record<string, string> = {
    amber: "bg-[#fffaf0] text-[#7c5b22] border-[#eadcc7]",
    rose: "bg-[#fff7f7] text-[#8a3d4a] border-[#ecd4d9]",
    blue: "bg-[#f4f8ff] text-[#31547c] border-[#d9e4f2]",
    emerald: "bg-[#f5fbf8] text-[#315f50] border-[#d7e9df]",
    sky: "bg-[#f4f9fc] text-[#315d76] border-[#d8e8f2]",
  };

  return (
    <ContentCard className="rounded-[22px] border border-[#d9e6f5] bg-white/95 p-4 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#10213f]">오늘 처리할 일</h3>
          <p className="mt-1 text-xs font-bold text-[#6f8199]">승인·취소·운항 전 확인 항목</p>
        </div>
        <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#526a89]">
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
            <span className="text-sm font-bold">{item.label}</span>
            <span className="flex items-center gap-2 text-lg font-bold">
              {item.value}건
              <span className="text-xs opacity-50">›</span>
            </span>
          </Link>
        ))}
      </div>
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
          <h3 className="text-lg font-bold text-[#10213f]">오늘 기상 요약</h3>
          <p className="mt-1 text-xs font-medium text-[#61758f]">
            Open-Meteo · 좌표 37.106759, 126.765010
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${weatherToneClass(decision?.tone)}`}>
          {decision?.label || "확인 필요"}
        </span>
      </div>

      {!weather.ok || !current ? (
        <div className="mx-5 mb-5 rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
          날씨 정보를 불러오지 못했습니다. 잠시 후 다시 확인하세요.
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <p className="text-[11px] font-semibold text-blue-700">Active RWY</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{runway?.label || "-"}</p>
              <p className="mt-1 text-xs font-medium text-[#61758f]">활주로 {runway?.heading || "-"}° 기준</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold text-emerald-700">현재 바람</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{numberText(current.windSpeed, "kt")}</p>
              <p className="mt-1 text-xs font-medium text-[#61758f]">{numberText(current.windDirection, "°")} · 돌풍 {numberText(current.windGust, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">측풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.crosswind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">정풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.headwind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">배풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.tailwind, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기온 {numberText(current.temperature, "℃")} · 체감 {numberText(current.apparentTemperature, "℃")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">습도 {numberText(current.humidity, "%")}</div>
            
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기압 {numberText(current.pressureMsl, "hPa")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">강수 {Number(current.precipitation || current.rain || 0).toFixed(1)}mm</div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#fbfdff] p-3">
            <p className="text-xs font-bold text-[#10213f]">{current.weatherText || "-"} · {decision?.message}</p>
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
  const height = 340;
  const padding = { top: 20, right: 20, bottom: 54, left: 70 };
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
    <div className="rounded-[22px] border border-[#dfe8f5] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)] px-4 py-3.5 shadow-[0_10px_30px_rgba(20,46,80,0.05)]">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-bold tracking-[-0.02em] text-[#10213f]">{title}</p>
          <p className="mt-0.5 text-[12px] font-medium text-[#61758f]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {series.map((item) => {
            const palette = colorToken(item.stroke);
            const latest = Number(rows[rows.length - 1]?.[item.key] || 0);

            return (
              <span
                key={item.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-xs font-extrabold text-[#31455f] shadow-sm"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.solid }} />
                {item.label} {latest}
              </span>
            );
          })}
          <span className="ml-1 shrink-0 text-[13px] font-extrabold text-[#263b55]">{unit}</span>
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
                fontSize="17"
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
                  fontSize="17"
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
    <ContentCard className="flex h-full min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="flex shrink-0 items-center justify-between px-5 py-3.5">
        <div>
          <h3 className="text-[17px] font-bold tracking-[-0.02em] text-[#10213f]">시간별 기상 그래프</h3>
          <p className="mt-0.5 text-[12px] font-medium text-[#61758f]">07:00~20:00 전체 시간대 표시</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">Open-Meteo</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
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
  };

  return (
    <ContentCard className={`flex min-h-0 flex-col p-4 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#10213f]">최근 변경 내역</h3>
          <p className="mt-1 text-xs font-medium text-[#61758f]">예약·알림·로그 기준 최근 활동</p>
        </div>
        <Link href="/logs" className="text-xs font-semibold text-[#1264f4]">로그 보기 ›</Link>
      </div>

      {activities.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-center text-sm font-medium text-[#6f8199]">
          최근 변경 내역이 없습니다.
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {activities.map((activity, index) => (
            <div key={`${activity.time}-${activity.title}-${index}`} className="flex gap-3 rounded-xl border border-[#edf2f7] bg-white px-3 py-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[activity.tone] || "bg-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[#10213f]">{activity.title}</p>
                  <span className="shrink-0 text-[11px] font-medium text-[#8a9ab0]">{shortActivityTime(activity.time)}</span>
                </div>
                {activity.detail ? <p className="mt-0.5 truncate text-xs font-medium text-[#61758f]">{activity.detail}</p> : null}
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

  return (
    <ContentCard className={`flex flex-col overflow-hidden p-0 ${className}`}>
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div>
          <h3 className="text-[16px] font-bold text-[#10213f]">교관별 오늘 배정</h3>
          <p className="mt-1 text-[11px] font-medium text-[#61758f]">상태·일정·휴무 여부</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">총 {totalAssigned}건</span>
      </div>

      <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto px-4 pb-4 sm:grid-cols-2 xl:grid-cols-1">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-4 text-center text-sm font-medium text-[#6f8199]">
            배정된 교관 일정이 없습니다.
          </div>
        ) : (
          items.slice(0, 8).map((item) => {
            const preview = item.items[0];
            const compactStatus =
              item.workLabel === "휴무"
                ? "휴무"
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
                className="rounded-2xl border border-[#e7eef7] bg-white px-3 py-2"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[14px] font-extrabold text-[#10213f]">{item.name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${instructorStatusBadgeClass(item.workTone)}`}>
                        {item.workLabel}
                      </span>
                    </div>
                  </div>

                  <p className={`min-w-0 truncate text-center text-[11px] font-extrabold ${instructorStatusBadgeClass(item.statusTone).split(" ").slice(-1)[0]}`}>
                    {compactStatus}
                  </p>

                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${item.count ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500"}`}>
                    {item.count}건
                  </span>
                </div>

                <div className="mt-1.5 rounded-xl bg-[#f8fbff] px-3 py-1.5">
                  {preview ? (
                    <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2 text-[10.5px]">
                      <span className="font-extrabold text-[#10213f]">{preview.startTime}</span>
                      <span className="min-w-0 truncate font-bold text-[#405875]">
                        {preview.userName} · {preview.bookingType.replace("비행", "")}
                      </span>
                      <span className="truncate font-bold text-[#7b8da5]">{preview.aircraftName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-bold text-[#61758f]">{item.workLabel === "휴무" ? "예약 배정 없음" : "대기 가능"}</span>
                      <span className="font-extrabold text-[#10213f]">{item.workLabel === "휴무" ? "오늘 휴무" : "오늘 배정 없음"}</span>
                    </div>
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


function DashboardSidePanel({
  pendingRequests,
  cancelRequests,
  pendingUsers,
  todayBookings,
  weather,
}: {
  pendingRequests: number;
  cancelRequests: number;
  pendingUsers: number;
  todayBookings: number;
  weather: WeatherData;
}) {
  return (
    <div className="grid gap-4">
      <OperationChecklist
        pendingRequests={pendingRequests}
        cancelRequests={cancelRequests}
        pendingUsers={pendingUsers}
        todayBookings={todayBookings}
      />
      <WeatherSummaryCard weather={weather} />
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
    logs,
  } = await safeGetDashboardData();
  const weather = await safeGetWeatherData();

  const today = todayText();
  const dateOptions = createDateOptions(today);
  const requestedDate = firstParam(params.date);
  const selectedDate = dateOptions.some((option) => option.value === requestedDate) ? requestedDate : today;
  const selectedInstructor = firstParam(params.instructor) || "all";
  const aircraftLookup = createAircraftLookup(aircraft);
  const visibleDashboardAircraft = buildDashboardAircraftResources(aircraft, bookings, aircraftLookup);
  const scheduleItems = buildScheduleItems(bookings, visibleDashboardAircraft, selectedDate);
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

  const todayBookings = bookings.filter((booking) => normalizeDate(getBookingDateValue(booking)) === today);
  const todayScheduleItems = buildScheduleItems(bookings, visibleDashboardAircraft, today);
  const instructorTodaySchedules = buildInstructorScheduleSummary(todayScheduleItems);
  const pendingRequestBookings = bookings.filter((booking) => getBookingStatus(booking).replace(/\s/g, "") === "요청");
  const cancelRequestBookings = bookings.filter((booking) => getBookingStatus(booking).replace(/\s/g, "") === "취소요청");
  const pendingUsers = users.filter(isPendingUser);
  const approvalWaitingCount = pendingRequestBookings.length + cancelRequestBookings.length + pendingUsers.length;
  const todayFlightHours = sumFlightHours(todayBookings);
  const upcomingBookings = [...bookings]
    .filter((booking) => normalizeDate(getBookingDateValue(booking)) >= today)
    .filter(isActiveBooking)
    .sort((a, b) => `${normalizeDate(getBookingDateValue(a))} ${normalizeTime(getBookingStartValue(a))}`.localeCompare(`${normalizeDate(getBookingDateValue(b))} ${normalizeTime(getBookingStartValue(b))}`))
    .slice(0, 8);
  const recentActivities = buildRecentActivities(logs, notifications, bookings);
  const instructorAssignmentSummary = buildInstructorAssignmentSummary(activeInstructors, todayScheduleItems, instructorSchedules, today, currentKstMinutes());

  return (
    <PageContainer title="관리자 대시보드" description="하늘누리 비행교육원의 운영 현황을 한눈에 확인하세요.">
      <DashboardTimeSunSummary today={today} />
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
          <ScheduleGraph
            aircraftRows={aircraftRows}
            scheduleItems={filteredScheduleItems}
            selectedDate={selectedDate}
            dateOptions={dateOptions}
            selectedInstructor={selectedInstructor}
            instructorOptions={instructorOptions}
            today={today}
            currentTimeMinutes={currentKstMinutes()}
          />

          <div className="grid min-h-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1.08fr)_minmax(0,0.68fr)]">
            <MiniTable title="다가오는 예약" href="/bookings" headers={["예약자", "예약시간", "유형", "항공기", "담당교관", "상태/처리"]} className="h-full min-h-[430px]">
            {upcomingBookings.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-[#6f8199]">다가오는 예약이 없습니다.</td></tr>
            ) : (
            upcomingBookings.map((booking, index) => {
            const actions = bookingActionOptions(booking);
            const bookingType = getBookingType(booking);
            return (
            <tr key={text(booking.bookingId) || index}>
            <td className="font-bold text-[#10213f]">{text(booking.userName || booking.name || booking.customerName || booking.memberName, "-")}</td>
            <td>
            <div className="font-bold text-[#10213f]">{normalizeDate(getBookingDateValue(booking)).slice(5)}</div>
            <div className="text-xs font-bold text-[#6f8199]">{normalizeTime(getBookingStartValue(booking))}~{normalizeTime(getBookingEndValue(booking))}</div>
            </td>
            <td>
            <span className={`ui-badge w-fit whitespace-nowrap px-2.5 py-1 text-[11px] ${scheduleColorClass(bookingType)}`}>
            {bookingType}
            </span>
            </td>
            <td>{getBookingAircraftName(booking, aircraftLookup)}</td>
            <td>{isRentalBookingType(bookingType) ? "-" : text(getBookingInstructorName(booking), "-")}</td>
            <td>
            <div className="flex flex-col gap-1.5">
            <span className={`ui-badge w-fit px-2.5 py-1 text-[11px] ${badgeClass(getDisplayBookingStatus(booking))}`}>{getDisplayBookingStatus(booking) || "-"}</span>
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

            <WeatherDetailPanel weather={weather} />

            <InstructorAssignmentSummaryPanel items={instructorAssignmentSummary} className="h-full min-h-[430px]" />
          </div>
        </div>

        <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
          <DashboardSidePanel
            pendingRequests={pendingRequestBookings.length}
            cancelRequests={cancelRequestBookings.length}
            pendingUsers={pendingUsers.length}
            todayBookings={todayBookings.filter((booking) => getDisplayBookingStatus(booking) === "확정").length}
            weather={weather}
          />
          <RecentActivityPanel activities={recentActivities} className="h-full min-h-[430px]" />
        </div>
      </div>
    </PageContainer>
  );
}
