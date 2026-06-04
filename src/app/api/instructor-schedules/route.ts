import { NextRequest, NextResponse } from "next/server";
import { normalizeSettingsRows } from "@/lib/settingsOptions";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
type ApiObject = Record<string, unknown>;

type WeeklyMemo = {
  weeklyOffDays?: string;
  weeklyAvailableTimes?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRows(data: unknown, key?: string): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];
  if (data && typeof data === "object") {
    const obj = data as ApiObject;
    if (key && Array.isArray(obj[key])) return obj[key] as ApiObject[];
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
  }
  return [];
}

function parseWeeklyMemo(row?: ApiObject): WeeklyMemo {
  const memo = text(row?.memo);
  const marker = "WEEKLY_CONFIG:";

  if (!memo.includes(marker)) return {};

  try {
    const jsonText = memo.slice(memo.indexOf(marker) + marker.length).trim();
    const parsed = JSON.parse(jsonText) as WeeklyMemo;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function makeWeeklyMemo(data: ApiObject) {
  return `WEEKLY_CONFIG:${JSON.stringify({
    weeklyOffDays: text(data.weeklyOffDays),
    weeklyAvailableTimes: text(data.weeklyAvailableTimes),
  })}`;
}

async function fetchSheet(sheetName: string, optional = false) {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");

  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("sheet", sheetName);

    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const rawText = await response.text();

    if (!response.ok) throw new Error(`Apps Script API 오류: ${response.status}`);
    if (!rawText.trim()) return [];

    const parsedData = JSON.parse(rawText) as unknown;

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      if (optional) return [];
      throw new Error(String((parsedData as ApiObject).message || `${sheetName} 시트를 불러오지 못했습니다.`));
    }

    return normalizeRows(parsedData, sheetName);
  } catch (error) {
    if (optional) return [];
    throw error;
  }
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) throw new Error(`Apps Script API 오류: ${response.status}`);
  if (!rawText.trim()) throw new Error("Apps Script 응답이 비어 있습니다.");

  const parsedData = JSON.parse(rawText) as ApiObject;

  if (parsedData && parsedData.success === false) {
    throw new Error(String(parsedData.message || "Apps Script 처리에 실패했습니다."));
  }

  return parsedData;
}

function isWeeklyConfigRow(row: ApiObject, instructorId?: string) {
  const scheduleType = text(row.scheduleType);
  const scheduleId = text(row.scheduleId);
  const date = text(row.scheduleDate || row.date);
  const memo = text(row.memo);
  const sameInstructor = instructorId ? text(row.instructorId) === instructorId : true;

  return (
    sameInstructor &&
    (
      scheduleType === "weeklyAvailability" ||
      scheduleId.startsWith("WEEKLY-") ||
      date === "WEEKLY" ||
      memo.includes("WEEKLY_CONFIG:")
    )
  );
}

function mergeWeeklyConfigIntoInstructors(instructors: ApiObject[], instructorSchedules: ApiObject[]) {
  return instructors.map((instructor) => {
    const instructorId = text(instructor.instructorId);
    const weeklyRow = instructorSchedules.find((row) => isWeeklyConfigRow(row, instructorId));

    if (!weeklyRow) return instructor;

    const memoConfig = parseWeeklyMemo(weeklyRow);

    return {
      ...instructor,
      weeklyOffDays: weeklyRow.weeklyOffDays ?? memoConfig.weeklyOffDays ?? instructor.weeklyOffDays,
      weeklyAvailableTimes:
        weeklyRow.weeklyAvailableTimes ?? memoConfig.weeklyAvailableTimes ?? instructor.weeklyAvailableTimes,
    };
  });
}

function makeWeeklyScheduleId(instructorId: string) {
  return `WEEKLY-${instructorId || "UNKNOWN"}`;
}

async function saveWeeklyAvailability(data: ApiObject) {
  const instructorId = text(data.instructorId);
  if (!instructorId) throw new Error("교관 ID가 없습니다.");

  const instructorSchedules = await fetchSheet("instructorSchedules", true);
  const existing = instructorSchedules.find((row) => isWeeklyConfigRow(row, instructorId));
  const scheduleId = text(existing?.scheduleId) || makeWeeklyScheduleId(instructorId);

  const weeklyData: ApiObject = {
    ...existing,
    ...data,
    scheduleId,
    scheduleType: "weeklyAvailability",
    scheduleDate: "WEEKLY",
    date: "WEEKLY",
    status: "주간설정",
    startTime: "",
    endTime: "",
    memo: makeWeeklyMemo(data),
  };

  if (existing) {
    return postToAppsScript("updateInstructorSchedule", weeklyData);
  }

  return postToAppsScript("addInstructorSchedule", weeklyData);
}

export async function GET() {
  try {
    const [instructorSchedules, rawInstructors, bookings, rawSettings] = await Promise.all([
      fetchSheet("instructorSchedules", true),
      fetchSheet("instructors"),
      fetchSheet("bookings", true),
      fetchSheet("settings", true),
    ]);

    const instructors = mergeWeeklyConfigIntoInstructors(rawInstructors, instructorSchedules);

    const settings = normalizeSettingsRows(rawSettings);

    return NextResponse.json({ ok: true, instructorSchedules, instructors, bookings, settings });
  } catch (error) {
    console.error("[instructor-schedules GET error]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "교관 스케줄 데이터를 불러오지 못했습니다.",
        instructorSchedules: [],
        instructors: [],
        bookings: [],
        settings: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = String(body.mode || "").trim();
    const data = (body.data || {}) as ApiObject;

    if (mode === "add") {
      return NextResponse.json({ ok: true, result: await postToAppsScript("addInstructorSchedule", data) });
    }

    if (mode === "update") {
      return NextResponse.json({ ok: true, result: await postToAppsScript("updateInstructorSchedule", data) });
    }

    if (mode === "updateWeeklyOffDays") {
      return NextResponse.json({ ok: true, result: await saveWeeklyAvailability(data) });
    }

    return NextResponse.json({ ok: false, message: `지원하지 않는 mode입니다: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error("[instructor-schedules POST error]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "교관 스케줄을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
