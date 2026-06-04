"use server";

import { formatKstDate as sharedFormatKstDate, formatKstTime as sharedFormatKstTime } from "@/lib/formatDateTime";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
    if (Array.isArray(obj.trainingLogs)) return obj.trainingLogs as ApiObject[];
  }

  return [];
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatKstDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatKstTime(value);
  return valueText === "-" ? "" : valueText;
}

function isVisibleToStudent(row: ApiObject) {
  const visible = text(row.studentVisible).toUpperCase() === "TRUE";
  const status = text(row.status);
  return visible && ["작성완료", "차감완료"].includes(status);
}

function safeStudentLog(row: ApiObject) {
  return {
    trainingLogId: text(row.trainingLogId),
    bookingId: text(row.bookingId),
    studentId: text(row.studentId),
    studentName: text(row.studentName),
    userId: text(row.userId),
    instructorName: text(row.instructorName),
    aircraftName: text(row.aircraftName),
    trainingDate: normalizeDate(row.trainingDate),
    actualStartTime: normalizeTime(row.actualStartTime),
    actualEndTime: normalizeTime(row.actualEndTime),
    actualFlightMinutes: Number(row.actualFlightMinutes || 0),
    groundBriefingMinutes: Number(row.groundBriefingMinutes || 0),
    trainingType: text(row.trainingType),
    lessonTitle: text(row.lessonTitle),
    trainingItems: text(row.trainingItems),
    studentNotes: text(row.studentNotes),
    homework: text(row.homework),
    cautionNotes: text(row.cautionNotes),
    nextTrainingPlan: text(row.nextTrainingPlan),
    timeDeducted: text(row.timeDeducted).toUpperCase() === "TRUE",
    deductedMinutes: Number(row.deductedMinutes || 0),
    status: text(row.status),
    updatedAt: text(row.updatedAt),
  };
}

async function readJsonResponse(response: Response, label: string) {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(`${label} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${label} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchSheet(sheetName: string) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL 또는 NEXT_PUBLIC_BASE_URL이 설정되지 않았습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getSheet");
  url.searchParams.set("sheet", sheetName);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status} (${sheetName})`);
  }

  const data = await readJsonResponse(response, `${sheetName} 시트`);
  return normalizeRows(data);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = text(searchParams.get("userId"));
    const studentId = text(searchParams.get("studentId"));
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 30), 100));

    if (!userId && !studentId) {
      return NextResponse.json(
        {
          ok: false,
          message: "userId 또는 studentId가 필요합니다.",
          trainingLogs: [],
        },
        { status: 400 }
      );
    }

    const trainingLogs = await fetchSheet("trainingLogs");

    const filtered = trainingLogs
      .filter(isVisibleToStudent)
      .filter((row) => {
        const sameUser = userId && text(row.userId) === userId;
        const sameStudent = studentId && text(row.studentId) === studentId;
        return Boolean(sameUser || sameStudent);
      })
      .sort((a, b) => {
        const aKey = `${normalizeDate(a.trainingDate)} ${normalizeTime(a.actualStartTime)}`;
        const bKey = `${normalizeDate(b.trainingDate)} ${normalizeTime(b.actualStartTime)}`;
        return bKey.localeCompare(aKey, "ko");
      })
      .slice(0, limit)
      .map(safeStudentLog);

    return NextResponse.json({
      ok: true,
      trainingLogs: filtered,
    });
  } catch (error) {
    console.error("[student training logs GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "학생 교육기록을 불러오지 못했습니다.",
        trainingLogs: [],
      },
      { status: 500 }
    );
  }
}
