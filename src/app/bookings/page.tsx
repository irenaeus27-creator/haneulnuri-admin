"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import TopAlertBell from "@/components/TopAlertBell";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";


type AnyRow = Record<string, unknown>;

type BookingRow = {
  bookingId?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  bookingType?: string;
  courseId?: string;
  courseName?: string;
  userId?: string;
  userName?: string;
  phone?: string;
  instructorId?: string;
  instructorName?: string;
  aircraftId?: string;
  aircraftName?: string;
  status?: string;
  paymentStatus?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type StudentRow = {
  studentId?: string;
  userId?: string;
  name?: string;
  phone?: string;
  course?: string;
  trainingStatus?: string;
  assignedInstructorId?: string;
  assignedInstructorName?: string;
  assignedAircraftId?: string;
  assignedAircraftName?: string;
  assignedAircraftIds?: string;
  aircraftId?: string;
  aircraftName?: string;
  defaultDurationMinutes?: string | number;
  [key: string]: unknown;
};

type InstructorRow = {
  instructorId?: string;
  name?: string;
  status?: string;
  active?: string;
  weeklyOffDays?: string;
  weeklyAvailableTimes?: string;
  memo?: string;
  [key: string]: unknown;
};

type InstructorScheduleRow = {
  scheduleId?: string;
  scheduleType?: string;
  instructorId?: string;
  instructorName?: string;
  scheduleDate?: string;
  date?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  weeklyOffDays?: string;
  weeklyAvailableTimes?: string;
  memo?: string;
  [key: string]: unknown;
};

type AircraftRow = {
  aircraftId?: string;
  aircraftName?: string;
  registrationNo?: string;
  status?: string;
  active?: string;
  [key: string]: unknown;
};

type SettingRow = {
  key?: string;
  value?: string;
  memo?: string;
  [key: string]: unknown;
};

type CourseRow = {
  courseId?: string;
  courseType?: string;
  courseName?: string;
  durationMinutes?: string | number;
  defaultMinutes?: string | number;
  duration_minutes?: string | number;
  default_minutes?: string | number;
  price?: string | number;
  active?: string;
  sortOrder?: string | number;
  memo?: string;
  [key: string]: unknown;
};

type RentalPilotRow = {
  pilotId?: string;
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  licenseNo?: string;
  assignedAircraftIds?: string;
  status?: string;
  [key: string]: unknown;
};

type BookingForm = {
  bookingId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  bookingType: string;
  durationMinutes?: string | number;
  courseId?: string;
  courseName: string;
  userId: string;
  userName: string;
  phone: string;
  instructorId: string;
  instructorName: string;
  aircraftId: string;
  aircraftName: string;
  status: string;
  paymentStatus: string;
  memo: string;
  rentalPilotId?: string;
  rentalPilotName?: string;
};

type CalendarDragSelection = {
  resourceKey: string;
  date: string;
  startIndex: number;
  endIndex: number;
  invalid: boolean;
} | null;

type CalendarMoveDrag = {
  bookingId: string;
  startX: number;
  timelineLeft: number;
  timelineWidth: number;
  grabOffsetX: number;
  deltaSteps: number;
  originalStartTime: string;
  originalEndTime: string;
} | null;

type CalendarResizeDrag = {
  bookingId: string;
  startX: number;
  timelineLeft: number;
  timelineWidth: number;
  grabOffsetX: number;
  deltaSteps: number;
  originalStartTime: string;
  originalEndTime: string;
} | null;

const defaultBookingStatuses = [
  "요청",
  "확정",
  "예정",
  "취소",
  "기상취소",
  "노쇼",
  "반려",
  "취소요청",
];

const defaultBookingTypes = [
  "체험비행",
  "교육비행",
  "렌탈비행",
  "동승비행",
  "자가비행",
  "기타",
];

const defaultPaymentStatuses = ["미결제", "결제완료", "부분결제", "환불"];

const RESERVATION_SLOT_MINUTES = 15;
const MIN_RESERVATION_DURATION_MINUTES = 30;
const PFI_DURATION_MINUTES = 30;
const CALENDAR_START_MINUTES = 7 * 60;
const CALENDAR_END_MINUTES = 20 * 60;
const CALENDAR_SLOT_COUNT = (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) / RESERVATION_SLOT_MINUTES;

const emptyForm: BookingForm = {
  bookingId: "",
  bookingDate: "",
  startTime: "",
  endTime: "",
  bookingType: "교육비행",
  courseName: "",
  userId: "",
  userName: "",
  phone: "",
  instructorId: "",
  instructorName: "",
  aircraftId: "",
  aircraftName: "",
  status: "확정",
  paymentStatus: "미결제",
  memo: "",
};

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function numberValue(value: unknown) {
  const raw = formValue(value).replace(/,/g, "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function courseDurationMinutes(item?: CourseRow | null) {
  if (!item) return 0;
  return numberValue(
    item.durationMinutes ??
      item.defaultMinutes ??
      item.duration_minutes ??
      item.default_minutes ??
      0
  );
}

function rentalPilotValue(item: Record<string, unknown>) {
  return formValue(
    (item as Record<string, unknown>).rentalPilotId ||
      (item as Record<string, unknown>).pilotId ||
      (item as Record<string, unknown>).userId ||
      (item as Record<string, unknown>).studentId ||
      (item as Record<string, unknown>).phone ||
      (item as Record<string, unknown>).name,
  );
}

function rentalPilotName(item: Record<string, unknown>) {
  return formValue(
    (item as Record<string, unknown>).name ||
      (item as Record<string, unknown>).pilotName ||
      (item as Record<string, unknown>).userName ||
      (item as Record<string, unknown>).rentalPilotName ||
      (item as Record<string, unknown>).phone,
  );
}

function findRentalPilot(items: Record<string, unknown>[], value: string) {
  const target = formValue(value);
  if (!target) return null;

  return (
    items.find((item) => {
      const candidates = [
        rentalPilotValue(item),
        rentalPilotName(item),
        formValue((item as Record<string, unknown>).rentalPilotId),
        formValue((item as Record<string, unknown>).pilotId),
        formValue((item as Record<string, unknown>).userId),
        formValue((item as Record<string, unknown>).studentId),
        formValue((item as Record<string, unknown>).phone),
      ];

      return candidates.some((candidate) => candidate && candidate === target);
    }) || null
  );
}



function getRentalPilotLabelValue(item: Record<string, unknown>) {
  return formValue(
    (item as Record<string, unknown>).pilotId ||
      (item as Record<string, unknown>).rentalPilotId ||
      (item as Record<string, unknown>).userId ||
      (item as Record<string, unknown>).studentId ||
      (item as Record<string, unknown>).phone ||
      (item as Record<string, unknown>).name,
  );
}

function getRentalPilotDisplayName(item: Record<string, unknown>) {
  return formValue(
    (item as Record<string, unknown>).name ||
      (item as Record<string, unknown>).pilotName ||
      (item as Record<string, unknown>).userName ||
      (item as Record<string, unknown>).name ||
      (item as Record<string, unknown>).phone,
  );
}

function findRentalPilotByAnyValue(items: Record<string, unknown>[], value: string) {
  const target = formValue(value);
  if (!target) return null;

  return (
    items.find((item) => {
      const values = [
        getRentalPilotLabelValue(item),
        getRentalPilotDisplayName(item),
        formValue((item as Record<string, unknown>).phone),
        formValue((item as Record<string, unknown>).userId),
        formValue((item as Record<string, unknown>).studentId),
      ];

      return values.some((candidate) => candidate && candidate === target);
    }) || null
  );
}



function parseSheetDateTime(value: unknown) {
  const raw = formValue(value).trim();

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

function snapToReservationSlotMinutes(hour: number, minute: number) {
  const total = hour * 60 + minute;
  return Math.round(total / RESERVATION_SLOT_MINUTES) * RESERVATION_SLOT_MINUTES;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value, RESERVATION_SLOT_MINUTES);
  return valueText === "-" ? "" : valueText;
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatBookingDate(value);
  return valueText === "-" ? "" : valueText;
}

function formatBookingSummaryDate(value: unknown) {
  return normalizeDate(value) || "-";
}

function formatCompactBookingDate(value: unknown) {
  const normalized = normalizeDate(value);
  if (!normalized) return "-";
  const parts = normalized.split("-");
  if (parts.length !== 3) return normalized;
  return `${parts[1]}.${parts[2]}`;
}

function formatBookingSummaryTimeRange(start: unknown, end: unknown) {
  const startText = normalizeTime(start);
  const endText = normalizeTime(end);

  if (!startText && !endText) return "-";
  if (!startText) return endText;
  if (!endText) return startText;

  return `${startText}~${endText}`;
}

function toForm(row: BookingRow): BookingForm {
  return {
    bookingId: formValue(row.bookingId),
    bookingDate: normalizeDate(row.bookingDate),
    startTime: normalizeTime(row.startTime),
    endTime: normalizeTime(row.endTime),
    bookingType: formValue(row.bookingType).includes("정비") || formValue(row.bookingType).includes("점검") ? "기타" : formValue(row.bookingType || emptyForm.bookingType),
    courseId: formValue(row.courseId),
    courseName: formValue(row.courseName),
    userId: formValue(row.userId),
    userName: formValue(row.userName),
    phone: formValue(row.phone),
    instructorId: formValue(row.instructorId),
    instructorName: formValue(row.instructorName),
    aircraftId: formValue(row.aircraftId),
    aircraftName: formValue(row.aircraftName),
    status: formValue(row.status || emptyForm.status),
    paymentStatus: formValue(row.paymentStatus || emptyForm.paymentStatus),
    memo: formValue(row.memo),
  };
}

function uniqueValues(values: string[], fallback: string[]) {
  const result: string[] = [];

  [...values, ...fallback].forEach((value) => {
    const trimmed = value.trim();

    if (trimmed && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  });

  return result;
}

function isActiveValue(value: unknown) {
  const normalized = formValue(value).trim().toLowerCase();

  if (!normalized) return true;

  return !["n", "no", "false", "0", "비활성", "중지", "정지"].includes(
    normalized
  );
}

function isAircraftOperational(aircraft: AircraftRow) {
  if (!isActiveValue(aircraft.active)) return false;

  const status = formValue(aircraft.status).replace(/\s/g, "");

  if (!status) return true;

  return ["운항가능", "가능", "정상", "활성", "available", "active"].includes(status.toLowerCase()) ||
    status === "운항가능";
}

function aircraftStatusLabel(aircraft: AircraftRow) {
  if (!isAircraftOperational(aircraft)) return "AOG";
  return "운항 가능";
}

function isRentalType(value: string) {
  return value.includes("렌탈");
}

function isRideAlongType(value: string) {
  return value.includes("동승");
}

function courseTypeToBookingType(value: unknown, fallback: string) {
  const raw = text(value, "").replace(/\s/g, "");
  const fallbackType = text(fallback, "교육비행");

  if (!raw || raw === "전체") return fallbackType;
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("렌탈")) return "렌탈비행";
  if (raw.includes("동승")) return "동승비행";
  if (raw.includes("자가")) return "자가비행";
  if (raw.includes("정비") || raw.includes("점검")) return "정비";
  if (raw.includes("기타")) return "기타";

  return fallbackType;
}

function isCancelledStatus(value: unknown) {
  const status = text(value, "").replace(/\s/g, "");
  return ["취소", "반려", "노쇼", "기상취소", "cancelled", "rejected"].includes(status);
}

function isFinalHiddenStatus(value: unknown) {
  const status = normalizeBookingStatusForDisplay(value).replace(/\s/g, "");
  return ["취소", "반려", "노쇼", "기상취소", "cancelled", "rejected"].includes(status);
}

function isConfirmedStatus(value: unknown) {
  const status = text(value, "").replace(/\s/g, "");
  return status === "확정" || status === "승인완료" || status.toLowerCase() === "approved";
}

function bookingSortWeight(value: unknown) {
  const status = text(value, "").replace(/\s/g, "");

  if (["요청", "취소요청", "예정", "승인대기"].includes(status)) return 0;
  if (isConfirmedStatus(status)) return 1;
  if (status === "완료") return 2;
  if (isCancelledStatus(status)) return 9;

  return 3;
}

function timeToMinutes(value: unknown) {
  const normalized = normalizeTime(value);
  const parts = normalized.split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return -1;

  return hour * 60 + minute;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart < 0 || aEnd < 0 || bStart < 0 || bEnd < 0) return false;

  return aStart < bEnd && aEnd > bStart;
}

function splitAssignedAircraftIds(value: unknown) {
  return formValue(value)
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rentalPilotCanUseAircraft(pilot: RentalPilotRow, selectedAircraft?: AircraftRow) {
  const assignedIds = splitAssignedAircraftIds(pilot.assignedAircraftIds || pilot.aircraftIds);

  if (!selectedAircraft || !formValue(selectedAircraft.aircraftId)) {
    return false;
  }

  if (assignedIds.length === 0) {
    return false;
  }

  const aircraftKeys = [
    formValue(selectedAircraft.aircraftId),
    formValue(selectedAircraft.aircraftName),
    formValue(selectedAircraft.registrationNo),
  ].filter(Boolean);

  return aircraftKeys.some((key) => assignedIds.includes(key));
}


function addMinutes(timeText: string, minutes: number) {
  const normalized = normalizeTime(timeText);
  const parts = normalized.split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return "";
  }

  const total = hour * 60 + minute + minutes;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(
    2,
    "0"
  )}`;
}

function addDaysToDate(dateText: string, days: number) {
  const normalized = normalizeDate(dateText) || todayIsoText();
  const [year, month, day] = normalized.split("-").map(Number);

  if (!year || !month || !day) return todayIsoText();

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function shortDateLabel(dateText: string) {
  const parts = normalizeDate(dateText).split("-");
  if (parts.length !== 3) return dateText;

  return `${parts[1]}/${parts[2]}`;
}

function weekdayLabel(dateText: string) {
  const date = new Date(`${normalizeDate(dateText)}T00:00:00`);
  const labels = ["일", "월", "화", "수", "목", "금", "토"];

  return labels[date.getDay()] || "";
}

function koreanDateLabel(dateText: string) {
  const normalized = normalizeDate(dateText);
  const parts = normalized.split("-");

  if (parts.length !== 3) return normalized || "-";

  return `${Number(parts[1])}월 ${Number(parts[2])}일 ${weekdayLabel(normalized)}요일`;
}

function bookingTooltip(booking: BookingRow) {
  const rows = [
    `예약자: ${text(booking.userName, "-")}`,
    `전화번호: ${text(booking.phone, "-")}`,
    `유형: ${normalizeBookingTypeForSave(booking.bookingType)}`,
    `상태: ${normalizedStatusOf(booking)}`,
    `일정: ${formatBookingSummaryDate(booking.bookingDate)} ${formatBookingSummaryTimeRange(booking.startTime, booking.endTime)}`,
    `항공기: ${aircraftDisplay(booking)}`,
    `교관/감독: ${text(booking.instructorName, "-")}`,
  ];

  const warning = futureCompletedTitle(booking);
  if (warning) rows.push(`경고: ${warning}`);

  return rows.join("\n");
}

function bookingResourceStartTime(item: BookingRow | BookingForm) {
  const startTime = normalizeTime(item.startTime);

  if (!startTime) return "";

  const bookingType = text(item.bookingType, "");
  if (bookingType.includes("교육") || bookingType.includes("렌탈")) {
    return addMinutes(startTime, -PFI_DURATION_MINUTES);
  }

  return startTime;
}

function bookingResourceEndTime(item: BookingRow | BookingForm) {
  return normalizeTime(item.endTime);
}

function conflictRangeLabel(item: BookingRow | BookingForm) {
  const startTime = bookingResourceStartTime(item);
  const endTime = bookingResourceEndTime(item);
  const originalStartTime = normalizeTime(item.startTime);
  const pfiIncluded = startTime && originalStartTime && startTime !== originalStartTime;

  if (!startTime || !endTime) return "-";
  return `${startTime}~${endTime}${pfiIncluded ? " · PFI 포함" : ""}`;
}

function bookingTimeLabelForConflict(item: BookingRow | BookingForm) {
  const resourceRange = conflictRangeLabel(item);
  return `${formatBookingSummaryTimeRange(item.startTime, item.endTime)}${resourceRange.includes("PFI") ? ` / 점유 ${resourceRange}` : ""}`;
}


function isPfiConflictBooking(item: BookingRow | BookingForm) {
  const bookingType = formValue((item as BookingRow | BookingForm).bookingType).toUpperCase();
  const memo = formValue((item as BookingRow | BookingForm).memo).toUpperCase();

  return bookingType === "PFI" || memo.includes("PFI");
}

function bookingConflictIdentityKey(item: BookingRow | BookingForm) {
  return [
    normalizeDate((item as BookingRow | BookingForm).bookingDate),
    normalizeTime((item as BookingRow | BookingForm).startTime),
    normalizeTime((item as BookingRow | BookingForm).endTime),
    formValue((item as BookingRow | BookingForm).bookingType),
    formValue((item as BookingRow | BookingForm).aircraftId || (item as BookingRow).aircraftName || (item as BookingRow).aircraft),
    formValue((item as BookingRow | BookingForm).instructorId || (item as BookingRow).instructorName),
    formValue((item as BookingRow | BookingForm).userName || (item as BookingRow).name || (item as BookingRow).customerName),
    formValue((item as BookingRow | BookingForm).phone),
  ].join("|");
}

function isSameRecentlySavedBooking(form: BookingForm, booking: BookingRow, recentKey: string) {
  if (!recentKey) return false;
  return bookingConflictIdentityKey(form) === recentKey && bookingConflictIdentityKey(booking) === recentKey;
}


type ConflictWarning = {
  type: "aircraft" | "instructor";
  message: string;
  bookingId: string;
};

function calendarChangeConfirmMessage(label: string, booking: BookingRow, beforeStart: string, beforeEnd: string, afterStart: string, afterEnd: string) {
  const beforeRange = `${beforeStart}~${beforeEnd}`;
  const afterRange = `${afterStart}~${afterEnd}`;
  const afterResourceRange = conflictRangeLabel({
    ...toForm(booking),
    startTime: afterStart,
    endTime: afterEnd,
  });

  return [
    `${text(booking.userName, "예약자")} / ${bookingDisplayTitle(booking)}`,
    `${label}할까요?`,
    `기존: ${beforeRange}`,
    `변경: ${afterRange}`,
    `점유: ${afterResourceRange}`,
    "교육/렌탈은 PFI 30분을 포함해 점유시간을 확인합니다.",
  ].join("\n");
}

function pendingRequestToneClass(status: unknown) {
  const normalized = normalizedStatusOf({ status } as BookingRow);

  if (normalized === "취소요청") return "border-orange-200 bg-orange-50/70";
  if (normalized === "요청") return "border-blue-100 bg-blue-50/50";

  return "border-[#edf2f8] bg-white";
}

function pendingRequestSummary(item: BookingRow) {
  return [
    normalizedStatusOf(item),
    `${formatCompactBookingDate(item.bookingDate)} ${formatBookingSummaryTimeRange(item.startTime, item.endTime)}`,
    normalizeBookingTypeForSave(item.bookingType),
    text(item.userName, "-"),
    aircraftDisplay(item),
  ].join(" / ");
}


function changeMemoText(label: string, beforeStart: string, beforeEnd: string, afterStart: string, afterEnd: string) {
  return `${label}: ${beforeStart}~${beforeEnd} → ${afterStart}~${afterEnd}`;
}

const scheduleWeekdays = ["월", "화", "수", "목", "금", "토", "일"];
const defaultInstructorDay = {
  state: "근무",
  startTime: "09:00",
  endTime: "17:00",
  lunchUnavailable: false,
};

type InstructorDayConfig = {
  state?: string;
  startTime?: string;
  endTime?: string;
  lunchUnavailable?: boolean;
  lunchStartTime?: string;
  lunchEndTime?: string;
};

function splitWords(value: unknown) {
  return formValue(value)
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function weeklyConfigTextFromMemo(value: unknown) {
  const memo = formValue(value);
  const marker = "WEEKLY_CONFIG:";
  const index = memo.indexOf(marker);

  if (index < 0) return "";

  return memo.slice(index + marker.length).trim();
}

function weeklyConfigFromRow(row?: InstructorScheduleRow | InstructorRow | null) {
  if (!row) return null;

  const offDays = splitWords(row.weeklyOffDays);
  const raw = formValue(row.weeklyAvailableTimes) || weeklyConfigTextFromMemo(row.memo);

  const base = scheduleWeekdays.reduce((acc, day) => {
    acc[day] = {
      ...defaultInstructorDay,
      state: offDays.includes(day) ? "휴일" : "근무",
    };
    return acc;
  }, {} as Record<string, InstructorDayConfig>);

  if (!raw) return offDays.length ? base : null;

  try {
    const parsed = JSON.parse(raw) as Record<string, InstructorDayConfig>;

    scheduleWeekdays.forEach((day) => {
      const item = parsed[day] || {};
      base[day] = {
        ...base[day],
        ...item,
        state: item.state === "휴일" || offDays.includes(day) ? "휴일" : "근무",
        startTime: formValue(item.startTime) || base[day].startTime,
        endTime: formValue(item.endTime) || base[day].endTime,
        lunchUnavailable: Boolean(item.lunchUnavailable),
        lunchStartTime: formValue(item.lunchStartTime) || "12:00",
        lunchEndTime: formValue(item.lunchEndTime) || "13:00",
      };
    });

    return base;
  } catch {
    return offDays.length ? base : null;
  }
}

function isWeeklyScheduleRow(row: InstructorScheduleRow, instructor: InstructorRow) {
  const scheduleType = formValue(row.scheduleType);
  const scheduleId = formValue(row.scheduleId);
  const date = formValue(row.scheduleDate || row.date);
  const sameInstructor =
    (formValue(instructor.instructorId) && formValue(row.instructorId) === formValue(instructor.instructorId)) ||
    (formValue(instructor.name) && formValue(row.instructorName) === formValue(instructor.name));

  return Boolean(
    sameInstructor &&
      (scheduleType === "weeklyAvailability" || scheduleId.startsWith("WEEKLY-") || date === "WEEKLY")
  );
}

function isDateScheduleRow(row: InstructorScheduleRow, instructor: InstructorRow, dateText: string) {
  const rowDate = normalizeDate(row.scheduleDate || row.date);
  const sameInstructor =
    (formValue(instructor.instructorId) && formValue(row.instructorId) === formValue(instructor.instructorId)) ||
    (formValue(instructor.name) && formValue(row.instructorName) === formValue(instructor.name));

  return Boolean(rowDate && rowDate !== "WEEKLY" && rowDate === normalizeDate(dateText) && sameInstructor);
}

function needsPfiBlock(booking: BookingRow) {
  const raw = `${text(booking.bookingType, "")} ${text(booking.courseName, "")}`;
  return raw.includes("교육") || raw.includes("렌탈");
}

function usesInstructorResource(booking: BookingRow) {
  const raw = `${text(booking.bookingType, "")} ${text(booking.courseName, "")}`;
  return raw.includes("교육") || raw.includes("체험") || raw.includes("렌탈");
}

function compactBookingTypeLabel(type: unknown) {
  const value = text(type, "");

  if (value.includes("체험")) return "체험";
  if (value.includes("교육")) return "교육";
  if (value.includes("렌탈")) return "렌탈";
  if (value.includes("정비")) return "정비";

  return value || "예약";
}

function calendarPersonLabel(booking: BookingRow) {
  return text(booking.userName, "-");
}

function calendarInstructorLabel(booking: BookingRow) {
  const typeText = text(booking.bookingType, "");
  const instructorName = text(booking.instructorName, "");

  if (!instructorName) return "";

  if (typeText.includes("렌탈")) return `감독 ${instructorName}`;
  if (typeText.includes("교육")) return `교관 ${instructorName}`;
  if (typeText.includes("체험")) return `교관 ${instructorName}`;

  return instructorName;
}

function isShortCalendarBlock(booking: BookingRow) {
  const start = timeToMinutes(booking.startTime);
  const end = timeToMinutes(booking.endTime);

  return start >= 0 && end >= 0 && end - start <= 30;
}

function isUnpaidExperience(booking: BookingRow) {
  return text(booking.bookingType, "").includes("체험") && !["결제완료", "완납"].includes(text(booking.paymentStatus, ""));
}

function calendarTypeClass(type: unknown) {
  const value = text(type, "");

  if (value.includes("교육")) return "border-blue-400 bg-blue-100 text-blue-950";
  if (value.includes("체험")) return "border-emerald-400 bg-emerald-100 text-emerald-950";
  if (value.includes("렌탈")) return "border-orange-400 bg-orange-100 text-orange-950";
  if (value.includes("정비")) return "border-violet-400 bg-violet-100 text-violet-950";

  return "border-slate-400 bg-slate-100 text-slate-900";
}

function statusBadgeClass(status: unknown) {
  const value = text(status, "");

  if (value === "확정") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value === "요청" || value === "예정") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (value === "완료") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value === "취소요청") return "bg-orange-50 text-orange-700 ring-orange-200";
  if (["취소", "기상취소", "노쇼", "반려"].includes(value)) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function statusBadgeTitle(status: unknown) {
  const value = normalizeBookingStatusForDisplay(status);

  if (value === "요청") return "요청: 승인 대기 예약입니다.";
  if (value === "확정" || value === "예정") return "확정: 운항 예정 예약입니다.";
  if (value === "완료") return "완료: 비행 종료 처리된 예약입니다.";
  if (value === "취소요청") return "취소요청: 취소 승인 또는 반려가 필요합니다.";
  if (value === "기상취소") return "기상취소: 기상 사유로 취소된 예약입니다.";
  if (value === "노쇼") return "노쇼: 예약자가 나타나지 않은 예약입니다.";
  if (value === "취소") return "취소: 취소 처리된 예약입니다.";
  if (value === "반려") return "반려: 요청이 반려된 예약입니다.";

  return "예약 상태";
}

function actionButtonTitle(nextStatus: string) {
  if (nextStatus === "완료") return "완료: 실제 비행이 끝난 경우에만 사용합니다.";
  if (nextStatus === "기상취소") return "기상: 기상 사유로 비행하지 못한 경우에만 사용합니다.";
  if (nextStatus === "노쇼") return "노쇼: 예약자가 나타나지 않은 경우에만 사용합니다.";
  if (nextStatus === "취소") return "취소: 관리자 또는 취소요청 승인으로 예약을 취소합니다.";
  if (nextStatus === "반려") return "반려: 예약 요청을 승인하지 않습니다.";
  if (nextStatus === "확정") return "확정: 요청 승인, 완료/취소/노쇼 처리 취소, 또는 운항 예정 상태로 복구합니다.";

  return "예약 상태 처리";
}

function displayFilterSummary(showFinal: boolean, statusFilter: string, typeFilter: string, dateFilter: string, keyword: string) {
  const parts = ["현재 이후"];

  if (statusFilter !== "전체") parts.push(`상태 ${statusFilter}`);
  else parts.push("요청/확정 중심");

  if (typeFilter !== "전체") parts.push(typeFilter);
  if (dateFilter) parts.push(`${formatCompactBookingDate(dateFilter)} 선택`);
  if (keyword.trim()) parts.push("검색 적용");

  parts.push(showFinal ? "취소/반려 포함" : "취소/반려 숨김");

  return parts.join(" · ");
}

function bookingTypeBadgeClass(type: unknown) {
  const value = text(type, "");
  if (value.includes("교육")) return "bg-blue-50 text-blue-700 ring-blue-100";
  if (value.includes("체험")) return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value.includes("렌탈")) return "bg-orange-50 text-orange-700 ring-orange-100";
  if (value.includes("정비") || value.includes("점검")) return "bg-violet-50 text-violet-700 ring-violet-100";
  return "bg-slate-50 text-slate-600 ring-slate-100";
}

function normalizeBookingTypeForSave(value: unknown) {
  const raw = text(value, "").replace(/\s/g, "");

  if (raw.includes("렌탈")) return "렌탈비행";
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("정비") || raw.includes("점검")) return "기타";

  return text(value, "기타");
}

function normalizePaymentStatusForSave(value: unknown, bookingType: unknown) {
  if (!text(bookingType, "").includes("체험")) return "";
  return text(value, "미결제");
}

function canonicalAircraftPayload(form: BookingForm, aircraftRows: AircraftRow[]) {
  const currentId = formValue(form.aircraftId);
  const currentName = formValue(form.aircraftName);
  const selected = aircraftRows.find((item) => {
    const keys = [
      formValue(item.aircraftId),
      formValue(item.aircraftName),
      formValue(item.registrationNo),
    ].filter(Boolean);

    return keys.includes(currentId) || keys.includes(currentName);
  });

  if (!selected) {
    return {
      aircraftId: form.aircraftId,
      aircraftName: form.aircraftName,
    };
  }

  const displayName = aircraftDisplay(selected);

  return {
    aircraftId: formValue(selected.aircraftId),
    aircraftName: displayName,
  };
}



function isVisibleOperationalBooking(item: BookingRow, includeFinalStatuses: boolean) {
  if (!normalizeDate(item.bookingDate)) return false;
  if (!includeFinalStatuses && isFinalHiddenStatus(item.status)) return false;
  return true;
}

function isFutureCompletedBooking(item: BookingRow) {
  const bookingDate = normalizeDate(item.bookingDate);
  if (!bookingDate) return false;

  return bookingDate > todayIsoText() && normalizedStatusOf(item) === "완료";
}

function futureCompletedTitle(item: BookingRow) {
  if (!isFutureCompletedBooking(item)) return "";
  return "미래 날짜인데 완료 상태입니다. 시트 status 값을 확인하세요.";
}

function formatDateTime(value: unknown) {
  const raw = text(value, "");

  if (!raw) return "-";

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function todayIsoText() {
  // 관리자 프로그램은 브라우저 로컬 날짜를 기준으로 표시합니다.
  // 운영 기준은 Asia/Seoul이며, 한국에서 접속하는 관리자 화면에서는 KST 날짜와 일치합니다.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTimeText() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function isBookingAfterCurrentTime(bookingDate: string, startTime: string, today: string, nowTime: string) {
  if (!bookingDate) return true;
  if (bookingDate < today) return false;
  if (bookingDate > today) return true;
  if (!startTime) return true;

  return startTime >= nowTime;
}

function buildActionMemo(existingMemo: string, actionLabel?: string, note?: string) {
  const lines = [existingMemo.trim()].filter(Boolean);

  if (actionLabel) {
    const stamp = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    lines.push(`[${stamp}] ${actionLabel}${note?.trim() ? ` - ${note.trim()}` : ""}`);
  }

  return lines.join("\n").trim();
}

function latestActionMemo(memo: unknown) {
  const lines = text(memo, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith("["));

  return lines.length ? lines[lines.length - 1] : "";
}

function compactPersonLabel(form: BookingForm) {
  return text(form.userName, "") || (form.bookingType.includes("교육") ? "교육생 미선택" : form.bookingType.includes("렌탈") ? "기장 미선택" : "예약자 미입력");
}

function compactAircraftLabel(form: BookingForm) {
  return text(form.aircraftName || form.aircraftId, "") || "항공기 미선택";
}


function compactFormSummary(form: BookingForm) {
  return [
    normalizeDate(form.bookingDate) || "날짜 미선택",
    form.startTime && form.endTime ? `${normalizeTime(form.startTime)}~${normalizeTime(form.endTime)}` : "시간 미선택",
    normalizeBookingTypeForSave(form.bookingType),
    compactAircraftLabel(form),
    compactPersonLabel(form),
  ].join(" · ");
}


function bookingDisplayTitle(item: BookingRow) {
  return text(item.courseName || item.userName || item.bookingType, "예약명 미입력");
}

function isEducationBooking(item: BookingRow) {
  return `${text(item.bookingType)} ${text(item.courseName)}`.includes("교육");
}

function isEducationCompletedBooking(item: BookingRow) {
  return isEducationBooking(item) && text(item.status).replace(/\s/g, "") === "완료";
}

function normalizeBookingStatusForDisplay(status: unknown) {
  const value = text(status, "").replace(/\s/g, "");

  if (!value) return "확정";
  if (["confirmed", "confirm", "approved", "approve", "scheduled", "reserved", "예약확정", "승인", "승인완료", "예정"].includes(value.toLowerCase())) return "확정";
  if (["pending", "request", "requested", "requesting", "예약요청", "예약신청", "승인대기", "요청대기"].includes(value.toLowerCase())) return "요청";
  if (["done", "complete", "completed", "finish", "finished", "운항완료", "비행완료", "차감완료"].includes(value.toLowerCase())) return "완료";
  if (["cancelrequest", "cancelrequested", "cancel_requested", "취소신청", "취소대기", "취소요청"].includes(value.toLowerCase())) return "취소요청";
  if (["cancelled", "canceled", "cancel", "예약취소"].includes(value.toLowerCase())) return "취소";

  return text(status, "확정");
}

function normalizedStatusOf(item: BookingRow) {
  return normalizeBookingStatusForDisplay(item.status);
}

function trainingLogHref(item: BookingRow) {
  const bookingId = encodeURIComponent(text(item.bookingId));
  return bookingId ? `/training-logs?bookingId=${bookingId}` : "/training-logs";
}

function aircraftDisplay(item: AircraftRow | BookingRow) {
  return text(item.aircraftName || item.registrationNo || item.aircraftId, "-");
}

function statusActionButtons(status: string) {
  status = normalizeBookingStatusForDisplay(status);

  if (status === "요청") {
    return [
      { label: "승인", nextStatus: "확정", actionLabel: "예약 요청 승인", tone: "primary" },
      { label: "반려", nextStatus: "반려", actionLabel: "예약 요청 반려", tone: "danger" },
      { label: "취소", nextStatus: "취소", actionLabel: "관리자 취소", tone: "danger" },
    ] as const;
  }

  if (status === "취소요청") {
    return [
      { label: "취소", nextStatus: "취소", actionLabel: "취소 요청 승인", tone: "danger" },
      { label: "반려", nextStatus: "확정", actionLabel: "취소 요청 반려", tone: "secondary" },
    ] as const;
  }

  if (status === "확정" || status === "예정") {
    return [
      { label: "완료", nextStatus: "완료", actionLabel: "예약 완료", tone: "primary" },
      { label: "기상", nextStatus: "기상취소", actionLabel: "기상취소", tone: "secondary" },
      { label: "노쇼", nextStatus: "노쇼", actionLabel: "노쇼 처리", tone: "danger" },
      { label: "취소", nextStatus: "취소", actionLabel: "관리자 취소", tone: "danger" },
    ] as const;
  }

  if (status === "완료") {
    return [
      { label: "확정복구", nextStatus: "확정", actionLabel: "완료 처리 취소", tone: "secondary" },
      { label: "취소", nextStatus: "취소", actionLabel: "완료 예약 관리자 취소", tone: "danger" },
    ] as const;
  }

  if (["취소", "기상취소", "노쇼", "반려"].includes(status)) {
    return [
      { label: "확정복구", nextStatus: "확정", actionLabel: `${status} 처리 취소`, tone: "secondary" },
    ] as const;
  }

  return [
    { label: "확정", nextStatus: "확정", actionLabel: "상태 확정 처리", tone: "primary" },
    { label: "취소", nextStatus: "취소", actionLabel: "관리자 취소", tone: "danger" },
  ] as const;
}

function statusActionButtonsForBooking(item: BookingRow) {
  const actions = [...statusActionButtons(normalizedStatusOf(item))];

  if (!isEducationBooking(item)) return actions;

  // 교육비행은 예약관리에서 직접 "완료" 처리하지 않습니다.
  // 실제 완료 여부는 비행기록/교육기록 등록 흐름에서 반영합니다.
  return actions.filter((action) => action.nextStatus !== "완료");
}

function sortRowsByOrder<T extends AnyRow>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aOrder = Number(a.sortOrder || 9999);
    const bOrder = Number(b.sortOrder || 9999);

    if (aOrder !== bOrder) return aOrder - bOrder;

    return text(a.value || a.courseName || a.name, "").localeCompare(
      text(b.value || b.courseName || b.name, ""),
      "ko"
    );
  });
}

function notifyPendingApprovalsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("skynuri:pending-approvals-refresh"));
}

export default function BookingsPage() {
  const alertFocusKeyRef = useRef("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const calendarDragClickBlockRef = useRef(false);
  const calendarBlockDragClickBlockRef = useRef(false);
  const calendarBlockDragFinishingRef = useRef(false);
  const calendarTimelineRef = useRef<HTMLDivElement | null>(null);
  const calendarSectionRef = useRef<HTMLElement | null>(null);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [instructorSchedules, setInstructorSchedules] = useState<InstructorScheduleRow[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [courseCatalog, setCourseCatalog] = useState<CourseRow[]>([]);
  const [rentalPilots, setRentalPilots] = useState<RentalPilotRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [movingBookingId, setMovingBookingId] = useState<string | null>(null);
  const [calendarDragSelection, setCalendarDragSelection] = useState<CalendarDragSelection>(null);
  const [isCalendarDragging, setIsCalendarDragging] = useState(false);
  const [calendarMoveDrag, setCalendarMoveDrag] = useState<CalendarMoveDrag>(null);
  const [calendarResizeDrag, setCalendarResizeDrag] = useState<CalendarResizeDrag>(null);
  const [error, setError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [lastSavedConflictKey, setLastSavedConflictKey] = useState("");

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [dateFilter, setDateFilter] = useState("");
  const [showCancelledBookings, setShowCancelledBookings] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("haneulnuri-booking-filters");
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        typeFilter?: string;
        statusFilter?: string;
        dateFilter?: string;
        showCancelledBookings?: boolean;
      };

      if (parsed.typeFilter) setTypeFilter(parsed.typeFilter);
      if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
      // 예약 캘린더는 화면에 들어올 때 항상 오늘을 기준으로 시작합니다.
      // 이전에 저장된 날짜 필터를 복원하면 일정관리 진입 시 과거 날짜에 머무르는 문제가 생깁니다.
      setDateFilter("");
      updateForm("bookingDate", todayIsoText());
      if (typeof parsed.showCancelledBookings === "boolean") setShowCancelledBookings(parsed.showCancelledBookings);
    } catch {
      // 필터 저장값이 깨진 경우 무시합니다.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "haneulnuri-booking-filters",
        JSON.stringify({ typeFilter, statusFilter, dateFilter, showCancelledBookings })
      );
    } catch {
      // localStorage 사용이 불가능한 환경에서는 무시합니다.
    }
  }, [typeFilter, statusFilter, dateFilter, showCancelledBookings]);
  const [calendarViewMode, setCalendarViewMode] = useState<"day" | "week">("day");
  const [calendarResourceMode, setCalendarResourceMode] = useState<"aircraft" | "instructor">("aircraft");
  const [showAogAircraft, setShowAogAircraft] = useState(false);

  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [editing, setEditing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [requestActionMemo, setRequestActionMemo] = useState("");

  function selectBookingForPanel(item: BookingRow | null) {
    setSelectedBooking(item);
    setRequestActionMemo("");
  }

  function focusBookingInCalendar(item: BookingRow) {
    const bookingDate = normalizeDate(item.bookingDate);

    if (bookingDate) {
      setDateFilter(bookingDate);
      updateForm("bookingDate", bookingDate);
    }

    selectBookingForPanel(item);

    window.setTimeout(() => {
      calendarSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  useEffect(() => {
    if (loading || bookings.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const alertType = text(params.get("alert"));
    if (alertType !== "booking") return;

    const bookingId = text(params.get("bookingId"));
    const statusParam = text(params.get("status"));
    const focusKey = `${alertType}:${bookingId}:${statusParam}:${bookings.length}`;

    if (alertFocusKeyRef.current === focusKey) return;
    alertFocusKeyRef.current = focusKey;

    const normalizedStatus = normalizeBookingStatusForDisplay(statusParam || "요청");
    if (normalizedStatus) setStatusFilter(normalizedStatus);

    const target = bookingId
      ? bookings.find((item) => text(item.bookingId) === bookingId)
      : bookings.find((item) => normalizeBookingStatusForDisplay(item.status) === normalizedStatus);

    if (target) {
      focusBookingInCalendar(target);
      const statusLabel = normalizeBookingStatusForDisplay(target.status);
      setOperationMessage(`${statusLabel} 알림 항목을 열었습니다. 오른쪽 상세 패널에서 처리할 수 있습니다.`);
      window.setTimeout(() => setOperationMessage(""), 4500);
      return;
    }

    setOperationMessage("알림 항목을 불러왔지만 해당 예약을 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.");
    window.setTimeout(() => setOperationMessage(""), 4500);
  }, [bookings, loading]);

  function isPendingBooking(item: BookingRow) {
    return normalizedStatusOf(item) === "요청";
  }

  function calendarBookingCardClass(booking: BookingRow) {
    if (isPendingBooking(booking)) {
      return "pending-request-card border-2 border-slate-400 border-dashed bg-slate-100/95 text-slate-700 opacity-100 ring-2 ring-slate-300/70";
    }

    return calendarTypeClass(booking.bookingType);
  }

  function clearSelectedBooking() {
    setSelectedBooking(null);
    setRequestActionMemo("");
  }

  const getSettingValues = useCallback(
    (key: string, fallback: string[]) => {
      const values = settings
        .filter((item) => formValue(item.key) === key)
        .map((item) => formValue(item.value));

      return uniqueValues(values, fallback);
    },
    [settings]
  );

  const bookingStatuses = useMemo(
    () => getSettingValues("bookingStatus", defaultBookingStatuses),
    [getSettingValues]
  );

  const bookingStatusOptionsForEdit = useMemo(() => {
    const preferred = ["요청", "확정", "예정", "취소", "기상취소", "노쇼", "반려", "취소요청"];
    const normalizedCurrent = normalizeBookingStatusForDisplay(form.status);
    const currentOnly = normalizedCurrent === "완료" ? [normalizedCurrent] : [];

    return uniqueValues([
      ...preferred.filter((item) => bookingStatuses.includes(item)),
      ...currentOnly,
    ].filter(Boolean), preferred);
  }, [bookingStatuses, form.status]);

  const bookingTypes = useMemo(
    () => getSettingValues("bookingType", defaultBookingTypes),
    [getSettingValues]
  );

  const paymentStatuses = useMemo(
    () => getSettingValues("paymentStatus", defaultPaymentStatuses),
    [getSettingValues]
  );

  const activeCourses = useMemo(
    () =>
      sortRowsByOrder(
        courseCatalog.filter((item) => isActiveValue(item.active))
      ) as CourseRow[],
    [courseCatalog]
  );

  const filteredCoursesForForm = useMemo(() => {
    const formType = form.bookingType.trim();

    return activeCourses.filter((item) => {
      const courseType = formValue(item.courseType);
      const courseBookingType = courseTypeToBookingType(courseType, formType);

      if (!courseType || courseType === "전체") return true;
      if (courseBookingType === formType) return true;
      if (formType.includes(courseBookingType) || courseBookingType.includes(formType)) return true;

      return false;
    });
  }, [activeCourses, form.bookingType]);

  const selectedAircraftForRental = useMemo(() => {
    const selectedAircraftId = formValue(form.aircraftId);
    return aircraft.find((item) => formValue(item.aircraftId) === selectedAircraftId);
  }, [aircraft, form.aircraftId]);

  const activeRentalPilots = useMemo(
    () =>
      rentalPilots.filter((item) => {
        const status = formValue(item.status);
        const active = !status || status === "활성" || status === "승인" || status === "승인완료";

        if (!active) return false;

        return rentalPilotCanUseAircraft(item, selectedAircraftForRental);
      }),
    [rentalPilots, selectedAircraftForRental]
  );

  const activeStudents = useMemo(
    () =>
      students.filter((item) => {
        const status = formValue(item.trainingStatus);
        return !status || !["수료", "중단", "정지"].includes(status);
      }),
    [students]
  );

  const isEducationForm = form.bookingType.includes("교육");
  const isRentalForm = isRentalType(form.bookingType);
  const isExperienceForm = form.bookingType.includes("체험");
  const isRideAlongForm = isRideAlongType(form.bookingType);
  const isOtherUseForm = form.bookingType.includes("기타") || form.bookingType.includes("정비");

  const durationOptions = useMemo(() => {
    if (isExperienceForm) {
      const courseDurations = filteredCoursesForForm
        .map((item) => scheduleDurationMinutes(courseDurationMinutes(item), "체험비행"))
        .filter((minutes) => minutes >= MIN_RESERVATION_DURATION_MINUTES);

      return Array.from(new Set([MIN_RESERVATION_DURATION_MINUTES, durationMinutes, ...courseDurations, 45, 60, 75, 90, 105, 120]))
        .filter((minutes) => Number.isFinite(minutes) && minutes >= MIN_RESERVATION_DURATION_MINUTES)
        .sort((a, b) => a - b);
    }

    if (isRentalForm) return [30, 45, 60, 75, 90, 105, 120, 150, 180];
    if (isOtherUseForm) return [30, 45, 60, 90, 120, 150, 180, 240, 300, 360];
    return [60, 90, 120];
  }, [durationMinutes, filteredCoursesForForm, isExperienceForm, isOtherUseForm, isRentalForm]);

  const timeOptions = useMemo(() => {
    const options: string[] = [];

    for (let minutes = CALENDAR_START_MINUTES; minutes < CALENDAR_END_MINUTES; minutes += RESERVATION_SLOT_MINUTES) {
      options.push(minutesToTime(minutes));
    }

    return options;
  }, []);

  function findInstructorForSchedule(instructorId: string, instructorName: string) {
    return instructors.find((item) => {
      if (instructorId && formValue(item.instructorId) === instructorId) return true;
      if (instructorName && formValue(item.name) === instructorName) return true;
      return false;
    });
  }

  function instructorAvailabilityStatus(
    instructorId: string,
    instructorName: string,
    dateText: string,
    startTime: string,
    endTime: string
  ) {
    const instructor = findInstructorForSchedule(instructorId, instructorName);

    if (!instructor) return { blocked: false, label: "" };

    const weekday = weekdayLabel(dateText);
    const weeklyRow = instructorSchedules.find((row) => isWeeklyScheduleRow(row, instructor));
    const weeklyConfig = weeklyConfigFromRow(weeklyRow) || weeklyConfigFromRow(instructor);
    const dayConfig = weeklyConfig?.[weekday];

    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (start < 0 || end < 0) return { blocked: false, label: "" };

    if (dayConfig) {
      const state = formValue(dayConfig.state || "근무");
      const workStart = timeToMinutes(dayConfig.startTime || "09:00");
      const workEnd = timeToMinutes(dayConfig.endTime || "17:00");

      if (state === "휴일") {
        return { blocked: true, label: "휴무" };
      }

      if (workStart >= 0 && workEnd >= 0 && (start < workStart || end > workEnd)) {
        return { blocked: true, label: `${dayConfig.startTime || "09:00"}~${dayConfig.endTime || "17:00"} 근무` };
      }

      if (dayConfig.lunchUnavailable) {
        const lunchStart = timeToMinutes(dayConfig.lunchStartTime || "12:00");
        const lunchEnd = timeToMinutes(dayConfig.lunchEndTime || "13:00");

        if (lunchStart >= 0 && lunchEnd >= 0 && rangesOverlap(startTime, endTime, "12:00", "13:00")) {
          return { blocked: true, label: "점심불가" };
        }
      }
    }

    const dateRows = instructorSchedules.filter((row) => isDateScheduleRow(row, instructor, dateText));

    for (const row of dateRows) {
      const status = formValue(row.status);
      const rowStart = normalizeTime(row.startTime || "00:00");
      const rowEnd = normalizeTime(row.endTime || "23:59");

      if (["휴무", "비활성"].includes(status)) {
        return { blocked: true, label: "휴무" };
      }

      if (status === "외부일정" && rangesOverlap(startTime, endTime, rowStart, rowEnd)) {
        return { blocked: true, label: "외부일정" };
      }

      if (["가능", "부분가능"].includes(status) && (timeToMinutes(startTime) < timeToMinutes(rowStart) || timeToMinutes(endTime) > timeToMinutes(rowEnd))) {
        return { blocked: true, label: `${rowStart}~${rowEnd} 가능` };
      }
    }

    return { blocked: false, label: dayConfig ? `${dayConfig.startTime || "09:00"}~${dayConfig.endTime || "17:00"}` : "" };
  }

  function isInstructorUnavailableForSlot(instructorId: string, instructorName: string, dateText: string, startTime: string) {
    if (!instructorId && !instructorName) return false;

    const endTime = autoFillEndTime(startTime);
    if (!endTime) return false;

    return instructorAvailabilityStatus(instructorId, instructorName, dateText, startTime, endTime).blocked;
  }

  function instructorScheduleLabel(resource: InstructorRow, dateText: string) {
    const status = instructorAvailabilityStatus(
      formValue(resource.instructorId),
      formValue(resource.name),
      dateText,
      "09:00",
      "09:30"
    );

    return status.label || "근무";
  }

  function isStartTimeDisabledForSelection(
    startTime: string,
    aircraftId = formValue(form.aircraftId),
    aircraftName = formValue(form.aircraftName),
    instructorId = formValue(form.instructorId),
    instructorName = formValue(form.instructorName),
  ) {
    if (!form.bookingDate) return false;

    const candidateEnd = autoFillEndTime(startTime);
    if (!candidateEnd) return false;

    const targetDate = normalizeDate(form.bookingDate);

    if (instructorId || instructorName) {
      if (isInstructorUnavailableForSlot(instructorId, instructorName, targetDate, startTime)) {
        return true;
      }
    }

    const candidateStart = bookingResourceStartTime({
      ...form,
      startTime,
      endTime: candidateEnd,
    });

    return bookings.some((booking) => {
      if (form.bookingId && formValue(booking.bookingId) === form.bookingId) return false;
      if (isFinalHiddenStatus(booking.status)) return false;
      if (normalizeDate(booking.bookingDate) !== targetDate) return false;

      const sameAircraft =
        aircraftId &&
        (formValue(booking.aircraftId) === aircraftId ||
          formValue(booking.aircraftName) === aircraftName ||
          formValue(booking.aircraft) === aircraftName);

      const sameInstructor =
        !isRentalForm &&
        instructorId &&
        (formValue(booking.instructorId) === instructorId ||
          formValue(booking.instructorName) === instructorName);

      if (!sameAircraft && !sameInstructor) return false;

      return rangesOverlap(candidateStart, candidateEnd, bookingResourceStartTime(booking), bookingResourceEndTime(booking));
    });
  }

  function isStartTimeDisabled(startTime: string) {
    return isStartTimeDisabledForSelection(startTime);
  }

  const activeAircraft = useMemo(
    () =>
      aircraft
        .filter((item) => isActiveValue(item.active))
        .sort((a, b) => {
          const aOperational = isAircraftOperational(a) ? 0 : 1;
          const bOperational = isAircraftOperational(b) ? 0 : 1;

          if (aOperational !== bOperational) return aOperational - bOperational;

          return aircraftDisplay(a).localeCompare(aircraftDisplay(b), "ko");
        }),
    [aircraft]
  );

  const selectedEducationStudent = useMemo(
    () =>
      students.find((item) => {
        const studentId = formValue(item.studentId);
        const userId = formValue(item.userId);
        return Boolean(
          (studentId && studentId === form.userId) ||
            (userId && userId === form.userId) ||
            (studentId && studentId === formValue(form.rentalPilotId))
        );
      }),
    [students, form.userId, form.rentalPilotId]
  );

  const educationAssignedAircraft = useMemo(
    () =>
      selectedEducationStudent
        ? findAircraftListByAnyIds(
            selectedEducationStudent.assignedAircraftIds ||
              selectedEducationStudent.assignedAircraftId ||
              selectedEducationStudent.aircraftId ||
              selectedEducationStudent.assignedAircraftName ||
              selectedEducationStudent.aircraftName
          )
        : [],
    [selectedEducationStudent, activeAircraft]
  );

  const operationalAircraft = useMemo(
    () => activeAircraft.filter((item) => isAircraftOperational(item)),
    [activeAircraft]
  );

  const aogAircraft = useMemo(
    () => activeAircraft.filter((item) => !isAircraftOperational(item)),
    [activeAircraft]
  );

  const selectedRentalPilot = useMemo(
    () =>
      rentalPilots.find((item) => {
        const pilotId = formValue(item.pilotId || item.userId);
        return pilotId && pilotId === form.userId;
      }),
    [rentalPilots, form.userId]
  );

  const requiredFieldWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (!form.bookingDate) warnings.push("예약일을 선택하세요.");
    if (!form.startTime || !form.endTime) warnings.push("예약 시간을 선택하세요.");
    if (form.startTime && form.endTime && form.startTime >= form.endTime) warnings.push("종료시간은 시작시간보다 늦어야 합니다.");

    if (!form.userName.trim()) {
      warnings.push(isEducationForm ? "교육생을 선택하세요." : isRentalForm ? "렌탈 기장을 선택하세요." : "예약자 이름을 입력하세요.");
    }

    if (isEducationForm && (!form.instructorId || !form.aircraftId)) {
      warnings.push("교육생의 배정 교관/항공기 정보가 필요합니다.");
    }

    if ((isRentalForm || isExperienceForm) && !form.aircraftId) {
      warnings.push("항공기를 선택하세요.");
    }

    if (isExperienceForm && !form.phone.trim()) {
      warnings.push("체험 고객 연락처를 입력하세요.");
    }

    return warnings;
  }, [form, isEducationForm, isRentalForm, isExperienceForm]);

  const conflictWarnings = useMemo<ConflictWarning[]>(() => {
    const warnings: ConflictWarning[] = [];
    const targetDate = normalizeDate(form.bookingDate);
    const startTime = bookingResourceStartTime(form);
    const endTime = bookingResourceEndTime(form);

    if (!targetDate || !startTime || !endTime || startTime >= endTime) return warnings;

    const aircraftKeys = [
      formValue(form.aircraftId),
      formValue(form.aircraftName),
    ].filter(Boolean);

    const instructorKeys = [
      formValue(form.instructorId),
      formValue(form.instructorName),
    ].filter(Boolean);

    bookings.forEach((booking) => {
      if (isPfiConflictBooking(booking)) return;
      if (isPfiConflictBooking(form)) return;
      if (form.bookingId && formValue(booking.bookingId) === form.bookingId) return;
      if (isSameRecentlySavedBooking(form, booking, lastSavedConflictKey)) return;
      if (isFinalHiddenStatus(booking.status)) return;
      if (normalizeDate(booking.bookingDate) !== targetDate) return;

      const existingStart = bookingResourceStartTime(booking);
      const existingEnd = bookingResourceEndTime(booking);

      if (!existingStart || !existingEnd) return;
      if (!rangesOverlap(startTime, endTime, existingStart, existingEnd)) return;

      const bookingAircraftKeys = [
        formValue(booking.aircraftId),
        formValue(booking.aircraftName),
        formValue(booking.aircraft),
        formValue(booking.registrationNo),
      ].filter(Boolean);

      const bookingInstructorKeys = [
        formValue(booking.instructorId),
        formValue(booking.instructorName),
      ].filter(Boolean);

      const sameAircraft = aircraftKeys.length > 0 && aircraftKeys.some((key) => bookingAircraftKeys.includes(key));
      const sameInstructor = instructorKeys.length > 0 && instructorKeys.some((key) => bookingInstructorKeys.includes(key));

      const commonDetail = `${text(booking.userName, "예약자 미상")} · ${bookingTimeLabelForConflict(booking)} · ${normalizedStatusOf(booking)}`;

      if (sameAircraft) {
        warnings.push({
          type: "aircraft",
          bookingId: text(booking.bookingId, ""),
          message: `항공기 일정 중복: ${aircraftDisplay(booking)} / ${commonDetail}`,
        });
      }

      if (sameInstructor) {
        warnings.push({
          type: "instructor",
          bookingId: text(booking.bookingId, ""),
          message: `교관 일정 중복: ${text(booking.instructorName, "미지정")} / ${commonDetail}`,
        });
      }
    });

    const unique = new Map<string, ConflictWarning>();
    warnings.forEach((warning) => {
      unique.set(`${warning.type}-${warning.bookingId}-${warning.message}`, warning);
    });

    return Array.from(unique.values());
  }, [bookings, form, lastSavedConflictKey]);

  const conflictWarningMessages = useMemo(
    () => conflictWarnings.map((warning) => warning.message),
    [conflictWarnings]
  );

  const hasAircraftConflict = conflictWarnings.some((warning) => warning.type === "aircraft");
  const hasInstructorConflict = conflictWarnings.some((warning) => warning.type === "instructor");

  const saveBlockMessages = useMemo(
    () => Array.from(new Set([...requiredFieldWarnings, ...conflictWarningMessages])),
    [requiredFieldWarnings, conflictWarningMessages]
  );

  const blockingSaveMessages = useMemo(
    () => requiredFieldWarnings,
    [requiredFieldWarnings]
  );

  const selectableAircraftForForm = useMemo(() => {
    if (isEducationForm) {
      return selectedEducationStudent ? educationAssignedAircraft : activeAircraft;
    }

    if (!isRentalType(form.bookingType) || !selectedRentalPilot) return activeAircraft;

    return activeAircraft.filter((item) => rentalPilotCanUseAircraft(selectedRentalPilot, item));
  }, [activeAircraft, form.bookingType, selectedRentalPilot, isEducationForm, selectedEducationStudent, educationAssignedAircraft]);

  const allActiveRentalPilots = useMemo(
    () =>
      rentalPilots.filter((item) => {
        const status = formValue(item.status);
        return !status || status === "활성" || status === "승인" || status === "승인완료";
      }),
    [rentalPilots]
  );

  const rentalPilotOptionsForForm = useMemo(() => {
    if (!selectedAircraftForRental) return allActiveRentalPilots;

    return allActiveRentalPilots.filter((item) => rentalPilotCanUseAircraft(item, selectedAircraftForRental));
  }, [allActiveRentalPilots, selectedAircraftForRental]);

  function findAircraftByAnyId(value: unknown) {
    const keys = splitAssignedAircraftIds(value);
    if (keys.length === 0) return undefined;

    return activeAircraft.find((item) => {
      if (!isAircraftOperational(item)) return false;

      const aircraftKeys = [
        formValue(item.aircraftId),
        formValue(item.aircraftName),
        formValue(item.registrationNo),
      ].filter(Boolean);

      return keys.some((key) => aircraftKeys.includes(key));
    });
  }

  function findAircraftListByAnyIds(value: unknown) {
    const keys = splitAssignedAircraftIds(value);
    if (keys.length === 0) return [] as AircraftRow[];

    return activeAircraft.filter((item) => {
      if (!isAircraftOperational(item)) return false;

      const aircraftKeys = [
        formValue(item.aircraftId),
        formValue(item.aircraftName),
        formValue(item.registrationNo),
      ].filter(Boolean);

      return keys.some((key) => aircraftKeys.includes(key));
    });
  }

  function bookingTypeGuideMessage() {
    if (isEducationForm) return "교육생 선택 후 배정된 항공기 중에서 예약하세요.";
    if (isRentalForm) return "렌탈기장과 배정 항공기를 선택하세요. 단독 렌탈은 교관 없이 예약할 수 있습니다.";
    if (isExperienceForm) return "고객 정보와 항공기, 교관을 선택하세요.";
    if (isRideAlongForm) return "동승비행은 담당 교관을 선택하세요.";
    if (isOtherUseForm) return "촬영, 정비, 행사 등 항공기 사용 불가 시간을 예약명/사유로 등록하세요.";
    return "";
  }

  function assignedAircraftText(items: AircraftRow[]) {
    if (items.length === 0) return "";
    return items.map((item) => aircraftDisplay(item)).join(", ");
  }

  function scheduleDurationMinutes(value = durationMinutes, bookingType = form.bookingType) {
    const normalized = Number(value) || (text(bookingType, "").includes("체험") ? MIN_RESERVATION_DURATION_MINUTES : 60);
    return Math.max(MIN_RESERVATION_DURATION_MINUTES, Math.ceil(normalized / RESERVATION_SLOT_MINUTES) * RESERVATION_SLOT_MINUTES);
  }

  function autoFillEndTime(startTime: string, nextDuration = durationMinutes) {
    const scheduleMinutes = scheduleDurationMinutes(nextDuration);
    return startTime && scheduleMinutes > 0 ? addMinutes(startTime, scheduleMinutes) : "";
  }

  function updateStartTime(value: string) {
    setForm((prev) => ({
      ...prev,
      startTime: value,
      endTime: autoFillEndTime(value),
    }));
  }

  function updateDuration(value: string) {
    const nextDuration = scheduleDurationMinutes(Number(value) || 60);
    setDurationMinutes(nextDuration);

    setForm((prev) => ({
      ...prev,
      endTime: prev.startTime ? addMinutes(prev.startTime, nextDuration) : prev.endTime,
    }));
  }

  function resetTypeSpecificFields(nextType: string) {
    const normalizedType = normalizeBookingTypeForSave(nextType);
    const currentStartMinutes = timeToMinutes(form.startTime);
    const currentEndMinutes = timeToMinutes(form.endTime);
    const currentSelectedMinutes =
      currentStartMinutes >= 0 && currentEndMinutes > currentStartMinutes
        ? currentEndMinutes - currentStartMinutes
        : durationMinutes;
    const nextDuration = normalizedType.includes("체험")
      ? MIN_RESERVATION_DURATION_MINUTES
      : scheduleDurationMinutes(currentSelectedMinutes || durationMinutes || 60, normalizedType);

    setDurationMinutes(nextDuration);
    clearSelectedBooking();

    if (normalizedType.includes("체험")) {
      setCalendarDragSelection((prev) =>
        prev
          ? {
              ...prev,
              endIndex: prev.startIndex,
            }
          : prev
      );
    }

    setForm((prev) => {
      const keepAircraftId = prev.aircraftId;
      const keepAircraftName = prev.aircraftName;
      const common: BookingForm = {
        ...prev,
        bookingType: normalizedType,
        courseName: "",
        paymentStatus: normalizedType.includes("체험") ? prev.paymentStatus || paymentStatuses[0] || "미결제" : "",
        endTime: prev.startTime ? addMinutes(prev.startTime, nextDuration) : "",
      };

      if (normalizedType.includes("교육") || normalizedType.includes("렌탈") || normalizedType.includes("체험") || normalizedType.includes("동승")) {
        return {
          ...common,
          userId: "",
          userName: "",
          phone: "",
          instructorId: "",
          instructorName: "",
          aircraftId: keepAircraftId,
          aircraftName: keepAircraftName,
        };
      }

      if (normalizedType.includes("기타") || normalizedType.includes("정비")) {
        return {
          ...common,
          userId: "",
          userName: "",
          phone: "",
          instructorId: "",
          instructorName: "",
          aircraftId: keepAircraftId,
          aircraftName: keepAircraftName,
        };
      }

      return common;
    });
  }

  const loadData = useCallback(async (showLoading = true, forceFresh = false) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch(`/api/bookings?${forceFresh ? "noCache=1&" : ""}_ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        message?: string;
        bookings?: BookingRow[];
        students?: StudentRow[];
        instructors?: InstructorRow[];
        instructorSchedules?: InstructorScheduleRow[];
        aircraft?: AircraftRow[];
        settings?: SettingRow[];
        courseCatalog?: CourseRow[];
        rentalPilots?: RentalPilotRow[];
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "예약 데이터를 불러오지 못했습니다.");
      }

      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setStudents(Array.isArray(data.students) ? data.students : []);
      setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
      setInstructorSchedules(Array.isArray(data.instructorSchedules) ? data.instructorSchedules : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setSettings(Array.isArray(data.settings) ? data.settings : []);
      setCourseCatalog(Array.isArray(data.courseCatalog) ? data.courseCatalog : []);
      setRentalPilots(Array.isArray(data.rentalPilots) ? data.rentalPilots : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "예약 데이터를 불러오지 못했습니다.");
      setBookings([]);
      setStudents([]);
      setInstructors([]);
      setInstructorSchedules([]);
      setAircraft([]);
      setSettings([]);
      setCourseCatalog([]);
      setRentalPilots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (calendarMoveDrag || calendarResizeDrag || isCalendarDragging || saving || movingBookingId) return;
      void loadData(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadData, calendarMoveDrag, calendarResizeDrag, isCalendarDragging, saving, movingBookingId]);

  useEffect(() => {
    function refreshOnFocus() {
      if (calendarMoveDrag || calendarResizeDrag || isCalendarDragging || saving || movingBookingId) return;
      void loadData(false);
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loadData, calendarMoveDrag, calendarResizeDrag, isCalendarDragging, saving, movingBookingId]);


  useEffect(() => {
    if (!calendarMoveDrag && !calendarResizeDrag) return;

    function handleWindowMouseMove(event: MouseEvent) {
      if (event.buttons !== 1) {
        cancelActiveCalendarBlockDrag();
        return;
      }

      updateCalendarMoveDrag(event);
      updateCalendarResizeDrag(event);
    }

    function handleWindowMouseUp(event: MouseEvent) {
      event.preventDefault();
      void finishActiveCalendarBlockDrag(event.clientX);
    }

    function handleWindowPointerUp(event: PointerEvent) {
      void finishActiveCalendarBlockDrag(event.clientX);
    }

    function handleWindowCancel() {
      cancelActiveCalendarBlockDrag();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelActiveCalendarBlockDrag();
      }
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = "none";
    document.body.style.cursor = calendarResizeDrag ? "ew-resize" : "grabbing";

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("blur", handleWindowCancel);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mouseleave", handleWindowCancel);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("blur", handleWindowCancel);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mouseleave", handleWindowCancel);
    };
  }, [calendarMoveDrag, calendarResizeDrag, bookings]);

  const filteredBookings = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const today = todayIsoText();
    const nowTime = currentTimeText();

    return bookings
      .filter((item) => {
        const status = normalizedStatusOf(item);
        const bookingType = text(item.bookingType, "");
        const bookingDate = normalizeDate(item.bookingDate);
        const startTime = normalizeTime(item.startTime);

        if (!isBookingAfterCurrentTime(bookingDate, startTime, today, nowTime)) return false;
        if (!isVisibleOperationalBooking(item, showCancelledBookings)) return false;
        if (statusFilter !== "전체" && status !== statusFilter) return false;
        if (typeFilter !== "전체" && bookingType !== typeFilter) return false;
        if (dateFilter && bookingDate !== dateFilter) return false;

        if (!q) return true;

        const searchText = [
          item.bookingId,
          item.bookingDate,
          item.startTime,
          item.endTime,
          item.bookingType,
          item.courseName,
          item.userId,
          item.userName,
          item.phone,
          item.instructorId,
          item.instructorName,
          item.aircraftId,
          item.aircraftName,
          item.status,
          item.paymentStatus,
          item.memo,
        ]
          .map((value) => text(value, ""))
          .join(" ")
          .toLowerCase();

        return searchText.includes(q);
      })
      .sort((a, b) => {
        const weightDiff = bookingSortWeight(a.status) - bookingSortWeight(b.status);
        if (weightDiff !== 0) return weightDiff;

        const aKey = `${normalizeDate(a.bookingDate)} ${normalizeTime(a.startTime)}`;
        const bKey = `${normalizeDate(b.bookingDate)} ${normalizeTime(b.startTime)}`;

        return aKey.localeCompare(bKey, "ko");
      });
  }, [bookings, keyword, statusFilter, typeFilter, dateFilter, showCancelledBookings]);

  function applyQuickFilter(next: "전체" | "오늘" | "이번주" | "요청" | "확정" | "취소요청") {
    if (next === "전체") {
      setTypeFilter("전체");
      setStatusFilter("전체");
      setDateFilter("");
      setKeyword("");
      setShowCancelledBookings(false);
      return;
    }

    if (next === "오늘") {
      setDateFilter(todayIsoText());
      setStatusFilter("전체");
      return;
    }

    if (next === "이번주") {
      setDateFilter("");
      setStatusFilter("전체");
      setKeyword("");
      return;
    }

    setDateFilter("");
    setStatusFilter(next);
  }

  function resetBookingFilters() {
    setTypeFilter("전체");
    setStatusFilter("전체");
    setDateFilter("");
    setKeyword("");
    setShowCancelledBookings(false);
  }

  function isSelectedBooking(row: BookingRow) {
    const selectedId = text(selectedBooking?.bookingId, "");
    const rowId = text(row.bookingId, "");

    if (selectedId && rowId) return selectedId === rowId;

    return (
      selectedBooking !== null &&
      normalizeDate(selectedBooking.bookingDate) === normalizeDate(row.bookingDate) &&
      normalizeTime(selectedBooking.startTime) === normalizeTime(row.startTime) &&
      normalizeTime(selectedBooking.endTime) === normalizeTime(row.endTime) &&
      text(selectedBooking.userName, "") === text(row.userName, "")
    );
  }

  function isQuickFilterActive(item: "전체" | "오늘" | "내일" | "이번주" | "요청" | "확정" | "취소요청" | "렌탈" | "교육" | "체험") {
    if (item === "전체") {
      return typeFilter === "전체" && statusFilter === "전체" && !dateFilter && !keyword && !showCancelledBookings;
    }

    if (item === "오늘") {
      return dateFilter === todayIsoText() && statusFilter === "전체";
    }

    if (item === "내일") {
      return dateFilter === addDaysToDate(todayIsoText(), 1) && statusFilter === "전체";
    }

    if (item === "이번주") {
      return !dateFilter && statusFilter === "전체" && !keyword;
    }

    if (["렌탈", "교육", "체험"].includes(item)) {
      const targetType = item === "렌탈" ? "렌탈비행" : item === "교육" ? "교육비행" : "체험비행";
      return typeFilter === targetType && statusFilter === "전체" && !dateFilter;
    }

    return statusFilter === item && !dateFilter;
  }

  const todayText = todayIsoText();
  const calendarDate = form.bookingDate || dateFilter || todayText;
  const calendarDates = useMemo(
    () =>
      calendarViewMode === "week"
        ? Array.from({ length: 7 }, (_, index) => addDaysToDate(calendarDate, index))
        : [calendarDate],
    [calendarDate, calendarViewMode]
  );
  const calendarTimeSlots = useMemo(() => {
    const slots: string[] = [];

    for (let minutes = CALENDAR_START_MINUTES; minutes < CALENDAR_END_MINUTES; minutes += RESERVATION_SLOT_MINUTES) {
      slots.push(minutesToTime(minutes));
    }

    return slots;
  }, []);

  const calendarHourHeaders = useMemo(() => Array.from({ length: 14 }, (_, index) => 7 + index), []);
  const calendarBookings = useMemo(
    () =>
      bookings.filter(
        (item) =>
          calendarDates.includes(normalizeDate(item.bookingDate)) &&
          isVisibleOperationalBooking(item, showCancelledBookings)
      ),
    [bookings, calendarDates, showCancelledBookings]
  );
  const pendingRequestBookings = useMemo(
    () =>
      bookings
        .filter((item) => ["요청", "취소요청"].includes(normalizedStatusOf(item)))
        .sort((a, b) => {
          const aKey = `${normalizeDate(a.bookingDate)} ${normalizeTime(a.startTime)}`;
          const bKey = `${normalizeDate(b.bookingDate)} ${normalizeTime(b.startTime)}`;
          return aKey.localeCompare(bKey, "ko");
        }),
    [bookings]
  );

  function updateForm(key: keyof BookingForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }



  function handleRentalPilotChange(value: string) {
    const selectedPilot = findRentalPilot(rentalPilots as Record<string, unknown>[], value);
    const selectedId = formValue(value);
    const selectedName = selectedPilot ? rentalPilotName(selectedPilot) : "";
    const selectedPhone = selectedPilot ? formValue((selectedPilot as Record<string, unknown>).phone) : "";

    setForm((prev) => ({
      ...prev,
      rentalPilotId: selectedId,
      rentalPilotName: selectedName || prev.rentalPilotName,
      userId: selectedId || prev.userId,
      userName: selectedName || prev.userName,
      phone: selectedPhone || prev.phone,
    }));
  }


  function startCreate() {
    setLastSavedConflictKey("");
    setDurationMinutes(60);
    setForm({
      ...emptyForm,
      bookingType: bookingTypes[0] || emptyForm.bookingType,
      status: bookingStatuses.includes("확정") ? "확정" : emptyForm.status,
      paymentStatus: paymentStatuses[0] || emptyForm.paymentStatus,
    });
    setEditing(false);
    clearSelectedBooking();
    setRequestActionMemo("");
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function clearSelectedBookingForNewInput() {
    if (!editing && !selectedBooking) return;

    setEditing(false);
    clearSelectedBooking();
    setRequestActionMemo("");
  }

  function startEdit(row: BookingRow) {
    const nextForm = toForm(row);
    const startParts = nextForm.startTime.split(":");
    const endParts = nextForm.endTime.split(":");
    const startTotal = Number(startParts[0]) * 60 + Number(startParts[1]);
    const endTotal = Number(endParts[0]) * 60 + Number(endParts[1]);
    const currentDuration = endTotal > startTotal ? endTotal - startTotal : 60;
    const matchedCourse = `${text(row.bookingType, "")} ${text(row.courseName, "")}`.includes("체험")
      ? activeCourses.find((item) => {
          const rowCourseName = text(row.courseName, "");
          const itemName = text(item.courseName, "");
          const itemId = text(item.courseId || item.courseName, "");
          return (!!rowCourseName && itemName === rowCourseName) || (!!nextForm.courseId && itemId === nextForm.courseId);
        })
      : null;
    const matchedCourseRawDuration = courseDurationMinutes(matchedCourse);
    const matchedCourseDuration = matchedCourseRawDuration > 0 ? scheduleDurationMinutes(matchedCourseRawDuration, "체험비행") : 0;
    const nextDuration = matchedCourseDuration > 0 ? matchedCourseDuration : currentDuration;

    setDurationMinutes(nextDuration);
    setForm({
      ...nextForm,
      courseId: matchedCourse ? text(matchedCourse.courseId || matchedCourse.courseName, "") : nextForm.courseId,
      endTime: nextForm.startTime && matchedCourseDuration > 0 ? addMinutes(nextForm.startTime, matchedCourseDuration) : nextForm.endTime,
    });
    setEditing(true);
    setSelectedBooking(row);
    setRequestActionMemo("");
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function selectStudent(studentId: string) {
    const selected = students.find((item) => text(item.studentId, "") === studentId);

    if (!selected) return;

    const assignedAircraft = findAircraftByAnyId(
      selected.assignedAircraftId ||
        selected.assignedAircraftIds ||
        selected.aircraftId ||
        selected.assignedAircraftName ||
        selected.aircraftName
    );

    const selectedDuration = Number(selected.defaultDurationMinutes || 0) || durationMinutes || 60;

    setDurationMinutes(selectedDuration);

    setForm((prev) => ({
      ...prev,
      rentalPilotId: text(selected.studentId, ""),
      userId: text(selected.userId || selected.studentId, ""),
      userName: text(selected.name, ""),
      phone: text(selected.phone, ""),
      courseName: prev.courseName || text(selected.course, "교육비행"),
      instructorId: text(selected.assignedInstructorId, prev.instructorId),
      instructorName: text(selected.assignedInstructorName, prev.instructorName),
      aircraftId: assignedAircraft ? text(assignedAircraft.aircraftId, "") : text(selected.assignedAircraftId || selected.aircraftId, prev.aircraftId),
      aircraftName: assignedAircraft
        ? text(assignedAircraft.aircraftName || assignedAircraft.registrationNo || assignedAircraft.aircraftId, "")
        : text(selected.assignedAircraftName || selected.aircraftName, prev.aircraftName),
      endTime: prev.startTime ? addMinutes(prev.startTime, scheduleDurationMinutes(selectedDuration)) : prev.endTime,
    }));
  }

  function selectRentalPilot(pilotId: string) {
    const selected =
      allActiveRentalPilots.find((item) => text(item.pilotId || item.userId, "") === pilotId) ||
      activeRentalPilots.find((item) => text(item.pilotId || item.userId, "") === pilotId);

    if (!selected) return;

    const assignedAircraft = form.aircraftId ? undefined : findAircraftByAnyId(selected.assignedAircraftIds || selected.aircraftIds);

    setForm((prev) => ({
      ...prev,
      userId: text(selected.userId || selected.pilotId, ""),
      userName: text(selected.name, ""),
      phone: text(selected.phone, ""),
      instructorId: "",
      instructorName: "",
      aircraftId: assignedAircraft ? text(assignedAircraft.aircraftId, "") : prev.aircraftId,
      aircraftName: assignedAircraft
        ? text(assignedAircraft.aircraftName || assignedAircraft.registrationNo || assignedAircraft.aircraftId, "")
        : prev.aircraftName,
    }));
  }

  function selectInstructor(instructorId: string) {
    const selected = instructors.find((item) => text(item.instructorId, "") === instructorId);

    setForm((prev) => ({
      ...prev,
      instructorId,
      instructorName: selected ? text(selected.name, "") : "",
    }));
  }

  function selectAircraft(aircraftId: string) {
    const selectedKey = formValue(aircraftId);
    const selected = aircraft.find((item) => {
      const keys = [
        formValue(item.aircraftId),
        formValue(item.aircraftName),
        formValue(item.registrationNo),
      ].filter(Boolean);

      return keys.includes(selectedKey);
    });

    if (selected && !isOtherUseForm && !isAircraftOperational(selected)) {
      alert(`${aircraftDisplay(selected)} 항공기는 현재 ${aircraftStatusLabel(selected)} 상태라 예약할 수 없습니다.`);
      return;
    }

    setForm((prev) => ({
      ...prev,
      aircraftId: selected ? text(selected.aircraftId, selectedKey) : selectedKey,
      aircraftName: selected
        ? text(selected.aircraftName || selected.registrationNo || selected.aircraftId, "")
        : "",
    }));
  }

  function calendarResourceRows() {
    if (calendarResourceMode === "instructor") {
      return instructors.filter((item) => isActiveValue(item.active));
    }

    return showAogAircraft ? [...operationalAircraft, ...aogAircraft] : operationalAircraft;
  }

  function resourceName(resource: AircraftRow | InstructorRow) {
    if (calendarResourceMode === "instructor") {
      return text((resource as InstructorRow).name || (resource as InstructorRow).instructorId, "-");
    }

    return aircraftDisplay(resource as AircraftRow);
  }

  function calendarRowBookings(resource: AircraftRow | InstructorRow, dateText?: string) {
    const resourceKeys =
      calendarResourceMode === "instructor"
        ? [formValue((resource as InstructorRow).instructorId), formValue((resource as InstructorRow).name)].filter(Boolean)
        : [
            formValue((resource as AircraftRow).aircraftId),
            formValue((resource as AircraftRow).aircraftName),
            formValue((resource as AircraftRow).registrationNo),
          ].filter(Boolean);

    return calendarBookings.filter((booking) => {
      if (dateText && normalizeDate(booking.bookingDate) !== dateText) return false;

      if (calendarResourceMode === "instructor") {
        if (!usesInstructorResource(booking)) return false;

        const bookingInstructorKeys = [
          formValue(booking.instructorId),
          formValue(booking.instructorName),
        ].filter(Boolean);

        return bookingInstructorKeys.some((key) => resourceKeys.includes(key));
      }

      const bookingAircraftKeys = [
        formValue(booking.aircraftId),
        formValue(booking.aircraftName),
        formValue(booking.aircraft),
        formValue(booking.registrationNo),
      ].filter(Boolean);

      return bookingAircraftKeys.some((key) => resourceKeys.includes(key)) ||
        resourceKeys.some((key) => bookingAircraftKeys.includes(key));
    });
  }

  function bookingStartForCalendar(booking: BookingRow) {
    return needsPfiBlock(booking) && calendarResourceMode === "aircraft"
      ? addMinutes(normalizeTime(booking.startTime), -PFI_DURATION_MINUTES)
      : normalizeTime(booking.startTime);
  }

  function calendarBlockStyleByTime(startTime: string, endTime: string) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const dayStart = CALENDAR_START_MINUTES;
    const slotMinutes = RESERVATION_SLOT_MINUTES;
    const slotCount = CALENDAR_SLOT_COUNT;

    const rawStartIndex = (start - dayStart) / slotMinutes;
    const rawEndIndex = (end - dayStart) / slotMinutes;

    const startIndex = Math.max(0, Math.min(slotCount, rawStartIndex));
    const endIndex = Math.max(startIndex + 1, Math.min(slotCount, rawEndIndex));

    const left = (startIndex / slotCount) * 100;
    const width = Math.max(3.8, ((endIndex - startIndex) / slotCount) * 100);

    return {
      left: `${left}%`,
      width: `${Math.min(width, 100 - left)}%`,
    };
  }

  function calendarBlockStyle(booking: BookingRow) {
    return calendarBlockStyleByTime(bookingStartForCalendar(booking), normalizeTime(booking.endTime));
  }

  function applyCalendarSlot(resource: AircraftRow | InstructorRow, startTime: string, dateText = calendarDate) {
    clearSelectedBookingForNewInput();
    updateForm("bookingDate", dateText);

    if (calendarResourceMode === "instructor") {
      selectInstructor(text((resource as InstructorRow).instructorId, ""));
    } else {
      selectAircraft(calendarResourceKey(resource));
    }

    updateStartTime(startTime);

    const slotIndex = calendarTimeSlots.indexOf(startTime);
    const resourceKey = calendarResourceKey(resource);

    if (slotIndex >= 0 && resourceKey) {
      setCalendarDragSelection({
        resourceKey,
        date: dateText,
        startIndex: slotIndex,
        endIndex: slotIndex,
        invalid: false,
      });
    }
  }

  function calendarResourceKey(resource: AircraftRow | InstructorRow) {
    return calendarResourceMode === "instructor"
      ? text((resource as InstructorRow).instructorId || (resource as InstructorRow).name, "")
      : text((resource as AircraftRow).aircraftId || (resource as AircraftRow).aircraftName || (resource as AircraftRow).registrationNo, "");
  }

  function dragRange(selection: CalendarDragSelection) {
    if (!selection) return { from: -1, to: -1 };

    return {
      from: Math.min(selection.startIndex, selection.endIndex),
      to: Math.max(selection.startIndex, selection.endIndex),
    };
  }

  function isDragSlotSelected(resource: AircraftRow | InstructorRow, dateText: string, slotIndex: number) {
    if (!calendarDragSelection) return false;
    if (calendarDragSelection.resourceKey !== calendarResourceKey(resource)) return false;
    if (calendarDragSelection.date !== dateText) return false;

    const range = dragRange(calendarDragSelection);
    return slotIndex >= range.from && slotIndex <= range.to;
  }

  function hasConflictInDragRange(resource: AircraftRow | InstructorRow, dateText: string, fromIndex: number, toIndex: number) {
    for (let index = fromIndex; index <= toIndex; index += 1) {
      const slotStart = calendarTimeSlots[index];

      if (!slotStart) continue;

      const disabled =
        calendarResourceMode === "aircraft"
          ? isStartTimeDisabledForSelection(
              slotStart,
              formValue((resource as AircraftRow).aircraftId),
              formValue((resource as AircraftRow).aircraftName || (resource as AircraftRow).registrationNo),
              "",
              ""
            )
          : isStartTimeDisabledForSelection(
              slotStart,
              formValue(form.aircraftId),
              formValue(form.aircraftName),
              formValue((resource as InstructorRow).instructorId),
              formValue((resource as InstructorRow).name)
            );

      if (disabled) return true;
    }

    return false;
  }

  function beginCalendarDrag(resource: AircraftRow | InstructorRow, dateText: string, slotIndex: number) {
    const resourceKey = calendarResourceKey(resource);

    if (!resourceKey) return;

    calendarDragClickBlockRef.current = false;
    setIsCalendarDragging(true);
    setCalendarDragSelection({
      resourceKey,
      date: dateText,
      startIndex: slotIndex,
      endIndex: slotIndex,
      invalid: hasConflictInDragRange(resource, dateText, slotIndex, slotIndex),
    });
  }

  function updateCalendarDrag(resource: AircraftRow | InstructorRow, dateText: string, slotIndex: number) {
    if (!isCalendarDragging || !calendarDragSelection) return;
    if (calendarDragSelection.resourceKey !== calendarResourceKey(resource)) return;
    if (calendarDragSelection.date !== dateText) return;

    const from = Math.min(calendarDragSelection.startIndex, slotIndex);
    const to = Math.max(calendarDragSelection.startIndex, slotIndex);

    setCalendarDragSelection({
      ...calendarDragSelection,
      endIndex: slotIndex,
      invalid: hasConflictInDragRange(resource, dateText, from, to),
    });
  }

  function finishCalendarDrag(resource: AircraftRow | InstructorRow, dateText: string, slotIndex: number) {
    if (!isCalendarDragging || !calendarDragSelection) return;

    calendarDragClickBlockRef.current = true;
    window.setTimeout(() => {
      calendarDragClickBlockRef.current = false;
    }, 0);

    const sameResource = calendarDragSelection.resourceKey === calendarResourceKey(resource);
    const sameDate = calendarDragSelection.date === dateText;

    setIsCalendarDragging(false);

    if (!sameResource || !sameDate) {
      setCalendarDragSelection(null);
      return;
    }

    const from = Math.min(calendarDragSelection.startIndex, slotIndex);
    const to = Math.max(calendarDragSelection.startIndex, slotIndex);
    const invalid = hasConflictInDragRange(resource, dateText, from, to);

    if (invalid) {
      setCalendarDragSelection(null);
      alert("기존 예약과 겹치는 시간대는 선택할 수 없습니다.");
      return;
    }

    const startTime = calendarTimeSlots[from];
    const selectedMinutes = scheduleDurationMinutes(Math.max(MIN_RESERVATION_DURATION_MINUTES, (to - from + 1) * RESERVATION_SLOT_MINUTES));

    if (!startTime) {
      setCalendarDragSelection(null);
      return;
    }

    clearSelectedBookingForNewInput();
    updateForm("bookingDate", dateText);

    if (calendarResourceMode === "instructor") {
      selectInstructor(text((resource as InstructorRow).instructorId, ""));
    } else {
      selectAircraft(calendarResourceKey(resource));
    }

    setDurationMinutes(selectedMinutes);
    setForm((prev) => ({
      ...prev,
      bookingDate: dateText,
      startTime,
      endTime: addMinutes(startTime, selectedMinutes),
    }));

    setCalendarDragSelection({
      resourceKey: calendarResourceKey(resource),
      date: dateText,
      startIndex: from,
      endIndex: to,
      invalid: false,
    });
  }

  function cancelCalendarDrag() {
    if (!isCalendarDragging) return;

    calendarDragClickBlockRef.current = true;
    window.setTimeout(() => {
      calendarDragClickBlockRef.current = false;
    }, 0);

    setIsCalendarDragging(false);
    setCalendarDragSelection(null);
  }

  function calendarMovePreviewTimes(booking: BookingRow) {
    const bookingId = formValue(booking.bookingId);

    if (!calendarMoveDrag || calendarMoveDrag.bookingId !== bookingId) {
      return {
        startTime: normalizeTime(booking.startTime),
        endTime: normalizeTime(booking.endTime),
      };
    }

    return {
      startTime: addMinutes(calendarMoveDrag.originalStartTime, calendarMoveDrag.deltaSteps * RESERVATION_SLOT_MINUTES),
      endTime: addMinutes(calendarMoveDrag.originalEndTime, calendarMoveDrag.deltaSteps * RESERVATION_SLOT_MINUTES),
    };
  }

  function calendarResizePreviewTimes(booking: BookingRow) {
    const bookingId = formValue(booking.bookingId);

    if (!calendarResizeDrag || calendarResizeDrag.bookingId !== bookingId) {
      return calendarMovePreviewTimes(booking);
    }

    const nextEnd = addMinutes(calendarResizeDrag.originalEndTime, calendarResizeDrag.deltaSteps * RESERVATION_SLOT_MINUTES);
    const startMinutes = timeToMinutes(calendarResizeDrag.originalStartTime);
    const endMinutes = timeToMinutes(nextEnd);

    return {
      startTime: calendarResizeDrag.originalStartTime,
      endTime:
        startMinutes >= 0 && endMinutes > startMinutes
          ? nextEnd
          : addMinutes(calendarResizeDrag.originalStartTime, MIN_RESERVATION_DURATION_MINUTES),
    };
  }

  function calendarPreviewTimes(booking: BookingRow) {
    const bookingId = formValue(booking.bookingId);

    if (calendarResizeDrag?.bookingId === bookingId) {
      return calendarResizePreviewTimes(booking);
    }

    return calendarMovePreviewTimes(booking);
  }

  function calendarStepFromDelta(deltaX: number, timelineWidth?: number) {
    const width = timelineWidth || calendarTimelineRef.current?.getBoundingClientRect().width || 0;
    if (!width) return 0;

    const slotWidth = width / CALENDAR_SLOT_COUNT;
    if (!slotWidth) return 0;

    return Math.round(deltaX / slotWidth);
  }

  function calendarStepFromClientX(drag: NonNullable<CalendarMoveDrag | CalendarResizeDrag>, clientX: number, anchorTime: string) {
    const width = drag.timelineWidth || calendarTimelineRef.current?.getBoundingClientRect().width || 0;
    if (!width) return 0;

    const slotWidth = width / CALENDAR_SLOT_COUNT;
    if (!slotWidth) return 0;

    const anchorMinutes = timeToMinutes(anchorTime);
    if (anchorMinutes < 0) return calendarStepFromDelta(clientX - drag.startX, width);

    const rawTargetSlot = Math.round((clientX - drag.timelineLeft - drag.grabOffsetX) / slotWidth);
    const originalSlot = Math.round((anchorMinutes - CALENDAR_START_MINUTES) / RESERVATION_SLOT_MINUTES);

    return rawTargetSlot - originalSlot;
  }

  function calendarMoveStepsFromClientX(drag: NonNullable<CalendarMoveDrag>, clientX: number) {
    const rawSteps = calendarStepFromClientX(drag, clientX, drag.originalStartTime);
    return clampCalendarMoveSteps(drag.originalStartTime, drag.originalEndTime, rawSteps);
  }

  function calendarResizeStepsFromClientX(drag: NonNullable<CalendarResizeDrag>, clientX: number) {
    const rawSteps = calendarStepFromClientX(drag, clientX, drag.originalEndTime);
    return clampCalendarResizeSteps(drag.originalStartTime, drag.originalEndTime, rawSteps);
  }

  function clampCalendarMoveSteps(originalStartTime: string, originalEndTime: string, deltaSteps: number) {
    const startMinutes = timeToMinutes(originalStartTime);
    const endMinutes = timeToMinutes(originalEndTime);

    if (startMinutes < 0 || endMinutes < 0) return 0;

    const minSteps = Math.ceil((CALENDAR_START_MINUTES - startMinutes) / RESERVATION_SLOT_MINUTES);
    const maxSteps = Math.floor((CALENDAR_END_MINUTES - endMinutes) / RESERVATION_SLOT_MINUTES);

    return Math.max(minSteps, Math.min(maxSteps, deltaSteps));
  }

  function clampCalendarResizeSteps(originalStartTime: string, originalEndTime: string, deltaSteps: number) {
    const startMinutes = timeToMinutes(originalStartTime);
    const endMinutes = timeToMinutes(originalEndTime);

    if (startMinutes < 0 || endMinutes < 0) return 0;

    const minSteps = Math.ceil((startMinutes + MIN_RESERVATION_DURATION_MINUTES - endMinutes) / RESERVATION_SLOT_MINUTES);
    const maxSteps = Math.floor((CALENDAR_END_MINUTES - endMinutes) / RESERVATION_SLOT_MINUTES);

    return Math.max(minSteps, Math.min(maxSteps, deltaSteps));
  }

  function calendarTimelineMetricsFromEvent(event: React.MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const timeline = target.closest("[data-calendar-timeline='true']") as HTMLElement | null;
    const rect = timeline?.getBoundingClientRect() || calendarTimelineRef.current?.getBoundingClientRect();

    return {
      left: rect?.left || 0,
      width: rect?.width || 0,
    };
  }

  function calendarTimelineWidthFromEvent(event: React.MouseEvent) {
    return calendarTimelineMetricsFromEvent(event).width;
  }

  function calendarGrabOffsetX(event: React.MouseEvent, timelineLeft: number, timelineWidth: number, time: string) {
    const minutes = timeToMinutes(time);

    if (!timelineWidth || minutes < 0) {
      return event.clientX - timelineLeft;
    }

    const totalMinutes = CALENDAR_END_MINUTES - CALENDAR_START_MINUTES;
    const blockLeftX = ((minutes - CALENDAR_START_MINUTES) / totalMinutes) * timelineWidth;

    return event.clientX - timelineLeft - blockLeftX;
  }

  function sameBookingPerson(a: BookingRow, b: BookingRow) {
    const aUserId = formValue(a.userId);
    const bUserId = formValue(b.userId);
    const aName = formValue(a.userName);
    const bName = formValue(b.userName);
    const aPhone = formValue(a.phone);
    const bPhone = formValue(b.phone);

    if (aUserId && bUserId && aUserId === bUserId) return true;
    if (aPhone && bPhone && aPhone === bPhone) return true;
    if (aName && bName && aName === bName) return true;

    return false;
  }

  function sameBookingAircraft(a: BookingRow, b: BookingRow) {
    const aAircraftId = formValue(a.aircraftId);
    const bAircraftId = formValue(b.aircraftId);
    const aAircraftName = formValue(a.aircraftName);
    const bAircraftName = formValue(b.aircraftName);

    if (aAircraftId && bAircraftId && aAircraftId === bAircraftId) return true;
    if (aAircraftName && bAircraftName && aAircraftName === bAircraftName) return true;

    return false;
  }

  function relatedCalendarBookings(target: BookingRow, startTime: string, endTime: string) {
    const bookingId = formValue(target.bookingId);
    const date = normalizeDate(target.bookingDate);

    return bookings.filter((item) => {
      if (bookingId && formValue(item.bookingId) === bookingId) return false;
      if (isCancelledStatus(item.status)) return false;
      if (normalizeDate(item.bookingDate) !== date) return false;
      if (!sameBookingAircraft(target, item)) return false;

      return rangesOverlap(startTime, endTime, normalizeTime(item.startTime), normalizeTime(item.endTime)) ||
        normalizeTime(item.endTime) === startTime ||
        normalizeTime(item.startTime) === endTime;
    });
  }

  function mergeOrBlockCalendarChange(target: BookingRow, startTime: string, endTime: string) {
    const related = relatedCalendarBookings(target, startTime, endTime);

    if (!related.length) {
      return {
        blocked: false,
        merged: false,
        booking: {
          ...target,
          startTime,
          endTime,
        },
        deleteIds: [] as string[],
      };
    }

    const mergeable = related.every((item) => sameBookingPerson(target, item));

    if (!mergeable) {
      const first = related[0];
      return {
        blocked: true,
        merged: false,
        message: `다른 예약과 시간이 겹칩니다. (${normalizeTime(first.startTime)}~${normalizeTime(first.endTime)} / ${text(first.userName)})`,
        booking: target,
        deleteIds: [] as string[],
      };
    }

    const all = [target, ...related];
    const mergedStart = all
      .map((item) => (formValue(item.bookingId) === formValue(target.bookingId) ? startTime : normalizeTime(item.startTime)))
      .sort()[0];
    const mergedEnd = all
      .map((item) => (formValue(item.bookingId) === formValue(target.bookingId) ? endTime : normalizeTime(item.endTime)))
      .sort()
      .at(-1) || endTime;

    return {
      blocked: false,
      merged: true,
      booking: {
        ...target,
        startTime: mergedStart,
        endTime: mergedEnd,
        memo: [formValue(target.memo), related.length ? "같은 예약자 연속 비행 병합" : ""].filter(Boolean).join(" / "),
      },
      deleteIds: related.map((item) => formValue(item.bookingId)).filter(Boolean),
    };
  }

  async function deleteMergedBookings(deleteIds: string[]) {
    if (!deleteIds.length) return;

    const targets = bookings.filter((item) => deleteIds.includes(formValue(item.bookingId)));

    await Promise.all(
      targets.map(async (booking) => {
        const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateBooking",
            data: {
              ...booking,
              status: "취소",
              memo: [formValue(booking.memo), "같은 예약자 연속 비행 병합으로 취소 처리"]
                .filter(Boolean)
                .join(" / "),
            },
          }),
        });

        const rawText = await response.text();
        let data: { ok?: boolean; success?: boolean; message?: string } = {};

        try {
          data = rawText.trim() ? JSON.parse(rawText) : {};
        } catch {
          data = {};
        }

        if (!response.ok || (!data.ok && !data.success)) {
          throw new Error(data.message || "병합된 기존 예약 취소 처리에 실패했습니다.");
        }
      })
    );
  }

  function applyMergedBookingState(bookingId: string, mergedBooking: BookingRow, deleteIds: string[]) {
    setBookings((prev) =>
      prev
        .filter((item) => !deleteIds.includes(formValue(item.bookingId)))
        .map((item) =>
          formValue(item.bookingId) === bookingId
            ? {
                ...item,
                ...mergedBooking,
              }
            : item
        )
    );
  }


  async function rollbackBookingsView(message?: string) {
    if (message) {
      setError(message);
    }

    setOperationMessage("저장 실패로 최신 예약 정보를 다시 불러오는 중입니다...");

    try {
      await loadData(true, true);
    } finally {
      setOperationMessage("");
      setMovingBookingId(null);
    }
  }


  async function finishActiveCalendarBlockDrag(clientX?: number) {
    if (calendarBlockDragFinishingRef.current) return;

    const resizeSnapshot = calendarResizeDrag
      ? {
          ...calendarResizeDrag,
          deltaSteps: typeof clientX === "number" ? calendarResizeStepsFromClientX(calendarResizeDrag, clientX) : calendarResizeDrag.deltaSteps,
        }
      : null;
    const moveSnapshot = calendarMoveDrag
      ? {
          ...calendarMoveDrag,
          deltaSteps: typeof clientX === "number" ? calendarMoveStepsFromClientX(calendarMoveDrag, clientX) : calendarMoveDrag.deltaSteps,
        }
      : null;
    const activeDrag = resizeSnapshot || moveSnapshot;

    if (!activeDrag) return;

    calendarBlockDragFinishingRef.current = true;

    const activeBooking = bookings.find((item) => formValue(item.bookingId) === activeDrag.bookingId);

    if (!activeBooking) {
      setCalendarMoveDrag(null);
      setCalendarResizeDrag(null);
      calendarBlockDragFinishingRef.current = false;
      return;
    }

    try {
      if (resizeSnapshot?.bookingId === activeDrag.bookingId) {
        await finishCalendarResizeDrag(activeBooking, resizeSnapshot);
        return;
      }

      if (moveSnapshot?.bookingId === activeDrag.bookingId) {
        await finishCalendarMoveDrag(activeBooking, moveSnapshot);
      }
    } finally {
      calendarBlockDragFinishingRef.current = false;
    }
  }

  function cancelActiveCalendarBlockDrag() {
    if (!calendarMoveDrag && !calendarResizeDrag) return;

    setCalendarMoveDrag(null);
    setCalendarResizeDrag(null);
    calendarBlockDragFinishingRef.current = false;
  }

  function beginCalendarMoveDrag(event: React.MouseEvent, booking: BookingRow) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    calendarBlockDragClickBlockRef.current = false;
    calendarBlockDragFinishingRef.current = false;
    setCalendarResizeDrag(null);

    const bookingId = formValue(booking.bookingId);

    if (!bookingId) return;

    const originalStartTime = normalizeTime(booking.startTime);
    const originalEndTime = normalizeTime(booking.endTime);
    const timelineMetrics = calendarTimelineMetricsFromEvent(event);

    setCalendarMoveDrag({
      bookingId,
      startX: event.clientX,
      timelineLeft: timelineMetrics.left,
      timelineWidth: timelineMetrics.width,
      grabOffsetX: calendarGrabOffsetX(event, timelineMetrics.left, timelineMetrics.width, originalStartTime),
      deltaSteps: 0,
      originalStartTime,
      originalEndTime,
    });
  }

  function updateCalendarMoveDrag(event: React.MouseEvent | MouseEvent) {
    if (!calendarMoveDrag) return;

    const deltaSteps = calendarMoveStepsFromClientX(calendarMoveDrag, event.clientX);

    if (deltaSteps === calendarMoveDrag.deltaSteps) return;

    setCalendarMoveDrag({
      ...calendarMoveDrag,
      deltaSteps,
    });
  }

  async function finishCalendarMoveDrag(booking: BookingRow, dragSnapshot = calendarMoveDrag) {
    if (!dragSnapshot || dragSnapshot.bookingId !== formValue(booking.bookingId)) return;

    const { deltaSteps, originalStartTime, originalEndTime } = dragSnapshot;

    if (deltaSteps) {
      calendarBlockDragClickBlockRef.current = true;
      window.setTimeout(() => {
        calendarBlockDragClickBlockRef.current = false;
      }, 0);
    }

    setCalendarMoveDrag(null);
    setCalendarMoveDrag(null);
    setCalendarResizeDrag(null);

    if (!deltaSteps) return;

    const bookingId = formValue(booking.bookingId);
    const newStart = addMinutes(originalStartTime, deltaSteps * RESERVATION_SLOT_MINUTES);
    const newEnd = addMinutes(originalEndTime, deltaSteps * RESERVATION_SLOT_MINUTES);

    const ok = window.confirm(calendarChangeConfirmMessage("예약 시간 이동", booking, originalStartTime, originalEndTime, newStart, newEnd));
    if (!ok) return;

    const mergeResult = mergeOrBlockCalendarChange(booking, newStart, newEnd);

    if (mergeResult.blocked) {
      alert(mergeResult.message || "다른 예약과 시간이 겹칩니다.");
      return;
    }

    const updatedBooking = {
      ...booking,
      startTime: newStart,
      endTime: newEnd,
      memo: buildActionMemo(
        text(booking.memo, ""),
        "예약 시간 이동",
        changeMemoText("시간", originalStartTime, originalEndTime, newStart, newEnd)
      ),
    };

    try {
      setMovingBookingId(bookingId);
      setOperationMessage("");
      applyMergedBookingState(bookingId, updatedBooking, []);

      const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateBooking",
          data: {
            ...updatedBooking,
            allowConflict: true,
          },
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        success?: boolean;
        message?: string;
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "예약 시간 이동에 실패했습니다.");
      }

    } catch (err) {
      await loadData(false, true);
      alert(err instanceof Error ? err.message : "예약 시간 이동에 실패했습니다.");
    } finally {
      setMovingBookingId(null);
      setOperationMessage("");
    }
  }

  function beginCalendarResizeDrag(event: React.MouseEvent, booking: BookingRow) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    calendarBlockDragClickBlockRef.current = false;
    calendarBlockDragFinishingRef.current = false;
    setCalendarMoveDrag(null);

    const bookingId = formValue(booking.bookingId);

    if (!bookingId) return;

    const originalStartTime = normalizeTime(booking.startTime);
    const originalEndTime = normalizeTime(booking.endTime);
    const timelineMetrics = calendarTimelineMetricsFromEvent(event);

    setCalendarResizeDrag({
      bookingId,
      startX: event.clientX,
      timelineLeft: timelineMetrics.left,
      timelineWidth: timelineMetrics.width,
      grabOffsetX: calendarGrabOffsetX(event, timelineMetrics.left, timelineMetrics.width, originalEndTime),
      deltaSteps: 0,
      originalStartTime,
      originalEndTime,
    });
  }

  function updateCalendarResizeDrag(event: React.MouseEvent | MouseEvent) {
    if (!calendarResizeDrag) return;

    const deltaSteps = calendarResizeStepsFromClientX(calendarResizeDrag, event.clientX);

    if (deltaSteps === calendarResizeDrag.deltaSteps) return;

    setCalendarResizeDrag({
      ...calendarResizeDrag,
      deltaSteps,
    });
  }

  async function finishCalendarResizeDrag(booking: BookingRow, dragSnapshot = calendarResizeDrag) {
    if (!dragSnapshot || dragSnapshot.bookingId !== formValue(booking.bookingId)) return;

    const { deltaSteps, originalStartTime, originalEndTime } = dragSnapshot;

    if (deltaSteps) {
      calendarBlockDragClickBlockRef.current = true;
      window.setTimeout(() => {
        calendarBlockDragClickBlockRef.current = false;
      }, 0);
    }

    setCalendarResizeDrag(null);

    if (!deltaSteps) return;

    const bookingId = formValue(booking.bookingId);
    const newEndCandidate = addMinutes(originalEndTime, deltaSteps * RESERVATION_SLOT_MINUTES);
    const startMinutes = timeToMinutes(originalStartTime);
    const endMinutes = timeToMinutes(newEndCandidate);
    const newEnd = startMinutes >= 0 && endMinutes > startMinutes ? newEndCandidate : addMinutes(originalStartTime, MIN_RESERVATION_DURATION_MINUTES);

    const ok = window.confirm(calendarChangeConfirmMessage("예약 종료시간 조절", booking, originalStartTime, originalEndTime, originalStartTime, newEnd));
    if (!ok) return;

    const mergeResult = mergeOrBlockCalendarChange(booking, originalStartTime, newEnd);

    if (mergeResult.blocked) {
      alert(mergeResult.message || "다른 예약과 시간이 겹칩니다.");
      return;
    }

    const updatedBooking = {
      ...booking,
      startTime: originalStartTime,
      endTime: newEnd,
      memo: buildActionMemo(
        text(booking.memo, ""),
        "예약 종료시간 조절",
        changeMemoText("시간", originalStartTime, originalEndTime, originalStartTime, newEnd)
      ),
    };

    try {
      setMovingBookingId(bookingId);
      setOperationMessage("");
      applyMergedBookingState(bookingId, updatedBooking, []);

      const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateBooking",
          data: {
            ...updatedBooking,
            allowConflict: true,
          },
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        success?: boolean;
        message?: string;
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "예약 시간 변경에 실패했습니다.");
      }

    } catch (err) {
      await loadData(false, true);
      alert(err instanceof Error ? err.message : "예약 시간 변경에 실패했습니다.");
    } finally {
      setMovingBookingId(null);
    }
  }

  async function moveCalendarBooking(booking: BookingRow, direction: -1 | 1) {
    const bookingId = formValue(booking.bookingId);

    if (!bookingId) {
      alert("bookingId가 없습니다.");
      return;
    }

    try {
      setMovingBookingId(bookingId);

      const oldStart = normalizeTime(booking.startTime);
      const oldEnd = normalizeTime(booking.endTime);
      const newStart = addMinutes(oldStart, direction * RESERVATION_SLOT_MINUTES);
      const newEnd = addMinutes(oldEnd, direction * RESERVATION_SLOT_MINUTES);

      setBookings((prev) =>
        prev.map((item) =>
          formValue(item.bookingId) === bookingId
            ? {
                ...item,
                startTime: newStart,
                endTime: newEnd,
              }
            : item
        )
      );

      const response = await fetch("/api/bookings/move-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          direction,
          booking,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        success?: boolean;
        message?: string;
        booking?: BookingRow;
        startTime?: string;
        endTime?: string;
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "예약 시간 이동에 실패했습니다.");
      }

      setBookings((prev) =>
        prev.map((item) =>
          formValue(item.bookingId) === bookingId
            ? {
                ...item,
                ...(data.booking || {}),
                startTime: normalizeTime(data.startTime || data.booking?.startTime || newStart),
                endTime: normalizeTime(data.endTime || data.booking?.endTime || newEnd),
              }
            : item
        )
      );
    } catch (err) {
      setBookings((prev) =>
        prev.map((item) => (formValue(item.bookingId) === bookingId ? booking : item))
      );
      alert(err instanceof Error ? err.message : "예약 시간 이동에 실패했습니다.");
    } finally {
      setMovingBookingId(null);
    }
  }

  function selectCourse(courseId: string) {
    const selected = activeCourses.find((item) => text(item.courseId || item.courseName, "") === courseId);

    if (!selected) return;

    const rawDuration = courseDurationMinutes(selected);
    const nextBookingType = courseTypeToBookingType(selected.courseType, form.bookingType);
    const duration = rawDuration > 0 ? scheduleDurationMinutes(rawDuration, nextBookingType) : 0;

    if (duration > 0) {
      setDurationMinutes(duration);
    }

    setForm((prev) => ({
      ...prev,
      courseId: text(selected.courseId || selected.courseName, ""),
      courseName: text(selected.courseName, ""),
      bookingType: courseTypeToBookingType(selected.courseType, prev.bookingType),
      endTime: prev.startTime && duration > 0 ? addMinutes(prev.startTime, duration) : prev.endTime,
    }));
  }

  function selectedCourseOptionValue() {
    const currentCourseId = text(form.courseId, "");
    const currentCourseName = text(form.courseName, "");

    const matched = activeCourses.find((item) => {
      const itemId = text(item.courseId || item.courseName, "");
      const itemName = text(item.courseName, "");
      return itemId === currentCourseId || itemId === currentCourseName || itemName === currentCourseName;
    });

    return matched ? text(matched.courseId || matched.courseName, "") : "";
  }

  async function saveBooking() {
    try {
      if (blockingSaveMessages.length > 0) {
        alert(`저장 전 확인이 필요합니다.\n- ${blockingSaveMessages.join("\n- ")}`);
        return;
      }

      if (conflictWarningMessages.length > 0) {
        const ok = window.confirm(`예약 일정 중복 가능성이 있습니다.\n- ${conflictWarningMessages.join("\n- ")}\n\n그래도 저장할까요?`);
        if (!ok) return;
      }

      if (!form.bookingDate) {
        alert("예약일이 비어 있습니다. 캘린더에서 날짜를 선택하거나 예약일을 입력하세요.");
        return;
      }

      if (!form.startTime || !form.endTime) {
        alert("예약 시간이 비어 있습니다. 캘린더에서 시간대를 드래그하거나 시작시간을 선택하세요.");
        return;
      }

      if (form.startTime >= form.endTime) {
        alert("예약 종료시간은 시작시간보다 늦어야 합니다. 시간대를 다시 선택하세요.");
        return;
      }

      if (!form.userName.trim()) {
        alert(isEducationForm ? "교육생을 선택하세요." : isRentalForm ? "렌탈 기장을 선택하세요." : isOtherUseForm ? "예약명 또는 사용 불가 사유를 입력하세요." : "예약자 이름을 입력하세요.");
        return;
      }

      if (isEducationForm && (!form.instructorId || !form.aircraftId)) {
        alert("교육생의 배정 교관/항공기 정보가 없습니다. 교육생관리에서 배정 정보를 먼저 확인하세요.");
        return;
      }

      const selectedAircraftForSave = aircraft.find((item) => text(item.aircraftId, "") === form.aircraftId);

      if (isEducationForm && selectedEducationStudent && educationAssignedAircraft.length === 0) {
        alert("이 교육생에게 배정된 항공기가 없습니다. 교육생관리에서 배정 항공기를 먼저 확인하세요.");
        return;
      }

      if (isEducationForm && selectedEducationStudent && selectedAircraftForSave && educationAssignedAircraft.length > 0) {
        const allowed = educationAssignedAircraft.some((item) => formValue(item.aircraftId) === formValue(selectedAircraftForSave.aircraftId));
        if (!allowed) {
          alert("선택한 항공기는 이 교육생에게 배정된 항공기가 아닙니다.");
          return;
        }
      }

      if (selectedAircraftForSave && !isAircraftOperational(selectedAircraftForSave) && !isOtherUseForm) {
        alert(`${aircraftDisplay(selectedAircraftForSave)} 항공기는 현재 ${aircraftStatusLabel(selectedAircraftForSave)} 상태라 예약할 수 없습니다.`);
        return;
      }

      if (isOtherUseForm && !form.aircraftId) {
        alert("기타 예약은 사용 제한할 항공기를 선택해야 합니다.");
        return;
      }

      if (isRentalForm && !form.aircraftId) {
        alert("렌탈비행은 항공기를 선택해야 합니다.");
        return;
      }

      if (isRentalForm && selectedRentalPilot && selectedAircraftForSave && !rentalPilotCanUseAircraft(selectedRentalPilot, selectedAircraftForSave)) {
        alert("선택한 렌탈기장에게 배정되지 않은 항공기입니다.");
        return;
      }

      if (isRentalForm && !form.instructorId) {
        alert("렌탈비행은 감독을 선택해야 저장할 수 있습니다.");
        return;
      }

      if (form.instructorId) {
        const unavailable = instructorAvailabilityStatus(
          form.instructorId,
          form.instructorName,
          form.bookingDate,
          form.startTime,
          form.endTime
        );

        if (unavailable.blocked) {
          alert(`담당 교관/감독 예약 불가 시간입니다. (${unavailable.label})`);
          return;
        }
      }

      setSaving(true);
      setOperationMessage(editing ? "예약 수정 내용을 저장하는 중입니다..." : "신규 예약을 저장하는 중입니다...");

      const normalizedStartTime = normalizeTime(form.startTime);
      const normalizedBookingType = normalizeBookingTypeForSave(form.bookingType);
      const aircraftPayload = canonicalAircraftPayload(form, aircraft);
      const payload: BookingForm & { allowConflict?: boolean } = {
        ...form,
        ...aircraftPayload,
        bookingDate: normalizeDate(form.bookingDate),
        startTime: normalizedStartTime,
        endTime: normalizeTime(form.endTime) || addMinutes(normalizedStartTime, scheduleDurationMinutes(durationMinutes, normalizedBookingType)),
        durationMinutes: scheduleDurationMinutes(durationMinutes, normalizedBookingType),
        bookingType: normalizedBookingType,
        courseName: isOtherUseForm ? text(form.courseName || form.userName, "") : form.courseName,
        status: editing ? normalizeBookingStatusForDisplay(form.status) : "확정",
        paymentStatus: normalizePaymentStatusForSave(form.paymentStatus, normalizedBookingType),
        instructorId: form.instructorId,
        instructorName: form.instructorName,
        ...(conflictWarningMessages.length > 0 ? { allowConflict: true } : {}),
      };

      const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing ? "updateBooking" : "addBooking",
          data: payload,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: { ok?: boolean; success?: boolean; message?: string };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "예약 저장에 실패했습니다.");
      }

      const savedDate = payload.bookingDate;
      const savedType = payload.bookingType;
      setLastSavedConflictKey(bookingConflictIdentityKey(payload));
      await loadData(true, true);
      setDateFilter(savedDate);
      setDurationMinutes(savedType.includes("렌탈") || savedType.includes("체험") ? durationMinutes : 60);
      setForm({
        ...emptyForm,
        bookingDate: savedDate,
        bookingType: savedType,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: bookingStatuses.includes("확정") ? "확정" : emptyForm.status,
        paymentStatus: savedType.includes("체험") ? paymentStatuses[0] || "미결제" : "",
      });
      setEditing(false);
      clearSelectedBooking();
      alert(editing ? "예약이 수정되었습니다. 저장한 시간을 유지합니다." : "예약이 등록되었습니다. 저장한 시간을 유지합니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "예약 저장에 실패했습니다.");
    } finally {
      setSaving(false);
      setOperationMessage("");
    }
  }

  async function changeBookingStatus(booking: BookingRow, nextStatus: string, actionLabel?: string, note?: string) {
    const bookingId = text(booking.bookingId, "");

    if (!bookingId) {
      alert("bookingId가 없습니다.");
      return;
    }

    if (["취소", "기상취소", "노쇼", "반려"].includes(nextStatus)) {
      const caution = nextStatus === "노쇼"
        ? "\n노쇼 처리는 운영 기록에 남습니다. 교육생 노쇼 차감은 비행기록에서 차감 기록으로 저장하세요."
        : "\n취소·반려·노쇼·기상취소는 기본 보기에서 숨김 처리될 수 있습니다. 완료 예약은 일정표에 남습니다.";

      const ok = window.confirm(`${text(booking.userName, "예약자")} / ${bookingDisplayTitle(booking)}\n${nextStatus} 처리할까요?${caution}`);
      if (!ok) return;
    }

    try {
      setSaving(true);
      setOperationMessage("예약 상태 변경을 저장하는 중입니다...");

      const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateBooking",
          data: {
            ...toForm(booking),
            ...canonicalAircraftPayload(toForm(booking), aircraft),
            bookingId,
            bookingType: normalizeBookingTypeForSave(booking.bookingType),
            status: normalizeBookingStatusForDisplay(nextStatus),
            memo: buildActionMemo(
              text(booking.memo, ""),
              actionLabel,
              [
                note,
                nextStatus === "노쇼" && text(booking.bookingType, "").includes("교육")
                  ? "교육생 노쇼: 비행기록에서 차감 여부 확인 필요"
                  : "",
              ].filter(Boolean).join(" / ")
            ),
          },
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let result: { ok?: boolean; success?: boolean; message?: string };

      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!result.ok && !result.success)) {
        throw new Error(result.message || "예약 상태 변경에 실패했습니다.");
      }

      await loadData(true, true);
      notifyPendingApprovalsChanged();
      if (selectedBooking && text(selectedBooking.bookingId, "") === bookingId) {
        setSelectedBooking((prev) =>
          prev
            ? {
                ...prev,
                status: normalizeBookingStatusForDisplay(nextStatus),
                memo: buildActionMemo(text(prev.memo, ""), actionLabel || `상태 변경: ${normalizedStatusOf(prev)} → ${normalizeBookingStatusForDisplay(nextStatus)}`, note),
              }
            : prev
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "예약 상태 변경에 실패했습니다.");
    } finally {
      setSaving(false);
      setOperationMessage("");
    }
  }

  async function cancelSelectedBooking() {
    if (!selectedBooking) {
      alert("취소할 예약을 먼저 선택하세요.");
      return;
    }

    const bookingId = text(selectedBooking.bookingId || form.bookingId, "");

    if (!bookingId) {
      alert("bookingId가 없습니다.");
      return;
    }

    const ok = window.confirm("선택한 예약을 취소 처리할까요?\n취소된 예약은 캘린더 겹침 검사에서 제외됩니다.");

    if (!ok) return;

    try {
      setSaving(true);

      const payload: BookingForm = {
        ...form,
        bookingId,
        status: "취소",
        memo: buildActionMemo(text(form.memo, ""), "관리자 예약취소"),
      };

      const response = await fetch(`/api/bookings?noCache=1&_ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateBooking",
          data: payload,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let result: { ok?: boolean; success?: boolean; message?: string };

      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!result.ok && !result.success)) {
        throw new Error(result.message || "예약 취소에 실패했습니다.");
      }

      setBookings((prev) =>
        prev.map((item) =>
          text(item.bookingId, "") === bookingId
            ? {
                ...item,
                status: "취소",
                memo: payload.memo,
              }
            : item
        )
      );
      notifyPendingApprovalsChanged();

      setForm({ ...emptyForm });
      setDurationMinutes(60);
      setEditing(false);
      clearSelectedBooking();
      alert("예약이 취소 처리되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "예약 취소에 실패했습니다.");
    } finally {
      setSaving(false);
      setOperationMessage("");
    }
  }


  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#eef4fb_0%,#f7fbff_42%,#eef4fb_100%)]">
      <div className="flex w-full flex-col gap-4 p-5 xl:p-6">
        <section className="min-w-0 rounded-[22px] border border-[#d9e6f5] bg-white/95 px-5 py-4 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#7c93b2]">Booking Control</p>
              <h1 className="mt-0.5 text-[24px] font-bold tracking-[-0.04em] text-[#071a35]">예약관리</h1>
              <p className="mt-1.5 text-[13px] font-medium text-[#61758f]">
                예약 신규 등록, 승인 요청, 취소 요청, 일정 변경을 한 화면에서 관리합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div onClickCapture={() => void loadData(false, true)}>
                <TopAlertBell />
              </div>
              <button
                type="button"
                onClick={startCreate}
                disabled={saving || Boolean(movingBookingId)}
                className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-3.5 text-[13px] font-medium text-[#233a5a] shadow-sm transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-50"
              >
                신규 예약
              </button>
              <button
                type="button"
                onClick={() => void loadData(true, true)}
                className="inline-flex h-9 items-center rounded-xl bg-[#071a35] px-3.5 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(7,26,53,0.18)] transition hover:bg-[#102544] disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={loading}
              >
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>
          </div>
        </section>

        <section ref={calendarSectionRef} className="min-w-0 rounded-[24px] border border-[#d9e6f5] bg-white/95 p-3 shadow-[0_12px_34px_rgba(20,46,80,0.065)]">
          <div className="mb-2 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="shrink-0 text-[15px] font-semibold tracking-[-0.02em] text-[#10213f]">예약 캘린더</h2>
</div>
              <p className="mt-0.5 text-[13px] font-normal text-[#6d7f96]">
                대시보드와 같은 형태로 PFI와 예약을 함께 보면서 15분 단위로 예약을 지정합니다.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[13px] font-medium text-blue-700">
                  {calendarViewMode === "week" ? `${koreanDateLabel(calendarDate)}부터 7일` : koreanDateLabel(calendarDate)}
                </span>
                {selectedBooking ? (
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[13px] font-medium text-[#516982]">
                    선택 중: {text(selectedBooking.userName, "-")} · {formatBookingSummaryTimeRange(selectedBooking.startTime, selectedBooking.endTime)}
                  </span>
                ) : null}
                {calendarMoveDrag ? (
                  <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[13px] font-medium text-amber-700 ring-1 ring-amber-100">
                    이동 중: {calendarMoveDrag.deltaSteps > 0 ? "+" : ""}{calendarMoveDrag.deltaSteps * RESERVATION_SLOT_MINUTES}분
                  </span>
                ) : null}
                {calendarResizeDrag ? (
                  <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-0.5 text-[13px] font-medium text-violet-700 ring-1 ring-violet-100">
                    종료 조절: {calendarResizeDrag.deltaSteps > 0 ? "+" : ""}{calendarResizeDrag.deltaSteps * RESERVATION_SLOT_MINUTES}분
                  </span>
                ) : null}
              </div>
            </div>

            <div className="w-full rounded-[20px] border border-[#dfe8f4] bg-white/90 p-3 shadow-[0_8px_22px_rgba(15,40,80,0.035)] xl:w-[620px]">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_120px_minmax(170px,1fr)_auto] sm:items-end">
                <Field label="보기">
                  <select
                    value={calendarViewMode}
                    onChange={(event) => setCalendarViewMode(event.target.value as "day" | "week")}
                    className="input-base mt-1 h-10 rounded-xl bg-white px-3 text-[13px] font-semibold text-[#173052]"
                  >
                    <option value="day">일간</option>
                    <option value="week">주간</option>
                  </select>
                </Field>

                <Field label="기준">
                  <select
                    value={calendarResourceMode}
                    onChange={(event) => setCalendarResourceMode(event.target.value as "aircraft" | "instructor")}
                    className="input-base mt-1 h-10 rounded-xl bg-white px-3 text-[13px] font-semibold text-[#173052]"
                  >
                    <option value="aircraft">항공기별</option>
                    <option value="instructor">교관별</option>
                  </select>
                </Field>

                <Field label="캘린더 날짜">
                  <input
                    type="date"
                    value={calendarDate}
                    onChange={(event) => {
                      updateForm("bookingDate", event.target.value);
                      setDateFilter(event.target.value);
                    }}
                    className="input-base mt-1 h-10 rounded-xl bg-white px-3 text-[13px] font-semibold text-[#173052]"
                  />
                </Field>

                <div className="grid grid-cols-3 gap-1.5 sm:pt-[22px]">
                  <button
                    type="button"
                    onClick={() => {
                      const nextDate = addDaysToDate(calendarDate, calendarViewMode === "week" ? -7 : -1);
                      updateForm("bookingDate", nextDate);
                      setDateFilter(nextDate);
                    }}
                    className="inline-flex h-10 min-w-[56px] items-center justify-center rounded-xl border border-[#d5e0ee] bg-white px-3 text-[13px] font-semibold text-[#28486d] shadow-sm transition hover:border-[#bcd3f2] hover:bg-[#f7faff]"
                  >
                    이전
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateForm("bookingDate", todayText);
                      setDateFilter(todayText);
                    }}
                    className="inline-flex h-10 min-w-[56px] items-center justify-center rounded-xl border border-[#b9d1ff] bg-[#eef5ff] px-3 text-[13px] font-semibold text-[#1264f4] shadow-sm transition hover:bg-[#e2efff]"
                  >
                    오늘
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextDate = addDaysToDate(calendarDate, calendarViewMode === "week" ? 7 : 1);
                      updateForm("bookingDate", nextDate);
                      setDateFilter(nextDate);
                    }}
                    className="inline-flex h-10 min-w-[56px] items-center justify-center rounded-xl border border-[#d5e0ee] bg-white px-3 text-[13px] font-semibold text-[#28486d] shadow-sm transition hover:border-[#bcd3f2] hover:bg-[#f7faff]"
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>
          </div>

          {calendarResourceMode === "aircraft" && aogAircraft.length > 0 ? (
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#e1eaf6] bg-[#f8fbff] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#566b85]">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">운항 가능 {operationalAircraft.length}대</span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-100">AOG {aogAircraft.length}대</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAogAircraft((prev) => !prev)}
                className="inline-flex h-9 items-center rounded-xl border border-[#cfd9e6] bg-white px-3 text-[13px] font-medium text-[#334e68] shadow-sm hover:bg-[#f3f7fb]"
              >
                {showAogAircraft ? "AOG 접기" : "AOG 펼치기"}
              </button>
            </div>
          ) : null}

          {calendarViewMode === "day" ? (
            <div className="max-h-[720px] overflow-auto">
              <div className="min-w-[1280px]">
                <div className="grid grid-cols-[140px_1fr] border-b border-[#dce7f3] pb-2 text-[13px] font-semibold text-[#314965]">
                  <div className="pl-1">{calendarResourceMode === "instructor" ? "교관" : "항공기"}</div>
                  <div className="relative min-w-[980px] h-8">
                    {calendarHourHeaders.map((hour, index) => (
                      <div
                        key={hour}
                        className={`absolute top-0 text-center ${index === 0 ? "translate-x-0" : index === calendarHourHeaders.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                        style={{ left: `${(index / 13) * 100}%`}}
                      >
                        {String(hour).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-[#edf2f8]">
                  {calendarResourceRows().map((resource, resourceIndex) => {
                    const rowBookings = calendarRowBookings(resource, calendarDate);

                    return (
                      <div key={`${resourceName(resource)}-${resourceIndex}`} className="grid grid-cols-[140px_1fr]">
                        <div className={`flex min-h-[86px] items-center gap-2 rounded-l-2xl bg-[#fbfdff] px-2 pr-3 text-[14px] font-semibold ${calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? "text-slate-500" : "text-[#102544]"}`}>
                          <span className={calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? "text-slate-400" : "text-[#1f6fff]"}>{calendarResourceMode === "instructor" ? "👤" : "✈"}</span>
                          <div>
                            <div>{resourceName(resource)}</div>
                            {calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? (
                              <div className="mt-1 text-[13px] font-semibold text-slate-500">{aircraftStatusLabel(resource as AircraftRow)}</div>
                            ) : null}
                            {calendarResourceMode === "instructor" ? (
                              <div className="mt-1 text-[13px] font-medium text-[#7b8fa8]">{instructorScheduleLabel(resource as InstructorRow, calendarDate)}</div>
                            ) : null}
                          </div>
                        </div>

                        <div
                          ref={calendarTimelineRef}
                          data-calendar-timeline="true"
                          className="relative min-w-[980px] min-h-[86px] border-l border-[#dce7f3]"
                          onMouseMove={(event) => {
                            if ((calendarMoveDrag || calendarResizeDrag) && event.buttons !== 1) {
                              cancelActiveCalendarBlockDrag();
                              return;
                            }

                            updateCalendarMoveDrag(event);
                            updateCalendarResizeDrag(event);
                          }}
                          onMouseLeave={() => {
                            cancelCalendarDrag();
                          }}
                        >
                          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${CALENDAR_SLOT_COUNT}, minmax(0, 1fr))` }}>
                            {calendarTimeSlots.map((slotStart, slotIndex) => {
                              const aircraftUnavailable = calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow);
                              const disabled =
                                aircraftUnavailable ||
                                (calendarResourceMode === "aircraft"
                                  ? isStartTimeDisabledForSelection(
                                      slotStart,
                                      formValue((resource as AircraftRow).aircraftId),
                                      formValue((resource as AircraftRow).aircraftName || (resource as AircraftRow).registrationNo),
                                      "",
                                      ""
                                    )
                                  : isStartTimeDisabledForSelection(
                                      slotStart,
                                      formValue(form.aircraftId),
                                      formValue(form.aircraftName),
                                      formValue((resource as InstructorRow).instructorId),
                                      formValue((resource as InstructorRow).name)
                                    ));
                              const selected = isDragSlotSelected(resource, calendarDate, slotIndex);
                              const invalidSelection = selected && !!calendarDragSelection?.invalid;

                              return (
                                <button
                                  key={`${resourceName(resource)}-${slotStart}`}
                                  type="button"
                                  disabled={disabled}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    if (disabled) return;
                                    beginCalendarDrag(resource, calendarDate, slotIndex);
                                  }}
                                  onMouseEnter={() => updateCalendarDrag(resource, calendarDate, slotIndex)}
                                  onMouseUp={() => finishCalendarDrag(resource, calendarDate, slotIndex)}
                                  onClick={() => {
                                    if (isCalendarDragging || calendarDragClickBlockRef.current) return;
                                    applyCalendarSlot(resource, slotStart, calendarDate);
                                  }}
                                  className={`border-r border-dashed transition ${
                                    slotIndex % 2 === 1 ? "border-[#b9cce4]" : "border-[#edf3fa]"
                                  } ${
                                    disabled
                                      ? "cursor-not-allowed bg-white"
                                      : selected
                                        ? invalidSelection
                                          ? "cursor-pointer bg-rose-100"
                                          : "cursor-pointer bg-blue-200/90 shadow-inner"
                                        : "cursor-pointer bg-white hover:bg-blue-50/80"
                                  }`}
                                  title={disabled ? `${slotStart} 예약불가` : `${slotStart}부터 15분 선택`}
                                />
                              );
                            })}
                          </div>

                          {rowBookings.map((booking, index) => {
                            const bookingId = text(booking.bookingId, "booking");
                            const previewTimes = calendarPreviewTimes(booking);
                            const pfiStart = addMinutes(previewTimes.startTime, -PFI_DURATION_MINUTES);
                            const pfiEnd = previewTimes.startTime;
                            const showPfi = needsPfiBlock(booking) && calendarResourceMode === "aircraft";

                            return (
                              <div key={`${bookingId}-${index}`}>
                                {showPfi ? (
                                  <div
                                    className="absolute top-3 z-10 flex h-[56px] items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-2 text-[13px] font-medium text-sky-800 shadow-sm"
                                    style={calendarBlockStyleByTime(pfiStart, pfiEnd)}
                                    title={`PFI ${pfiStart}~${pfiEnd}\n${bookingTooltip(booking)}`}
                                  >
                                    PFI
                                  </div>
                                ) : null}

                                <div
                                  className={`group absolute top-3 z-20 h-[56px] min-w-0 overflow-hidden rounded-xl border px-1.5 py-1 text-left shadow-[0_8px_18px_rgba(20,46,80,0.08)] ring-1 ring-white/70 transition hover:z-30 hover:shadow-[0_12px_24px_rgba(20,46,80,0.14)] ${
                                    calendarMoveDrag?.bookingId === bookingId || calendarResizeDrag?.bookingId === bookingId ? "scale-[1.02] opacity-90" : "hover:scale-[1.02]"
                                  } ${calendarBookingCardClass(booking)} ${isUnpaidExperience(booking) ? "ring-2 ring-amber-200" : ""} ${isSelectedBooking(booking) ? "ring-2 ring-blue-500 shadow-[0_0_0_4px_rgba(37,99,235,0.16),0_12px_24px_rgba(37,99,235,0.22)]" : ""}`}
                                  style={calendarBlockStyleByTime(previewTimes.startTime, previewTimes.endTime)}
                                  title={bookingTooltip(booking)}
                                  onMouseDown={(event) => beginCalendarMoveDrag(event, booking)}
                                  onMouseUp={(event) => {
                                    event.stopPropagation();
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();

                                      if (calendarMoveDrag?.bookingId === bookingId || calendarResizeDrag?.bookingId === bookingId || calendarBlockDragClickBlockRef.current) {
                                        return;
                                      }

                                      selectBookingForPanel(booking);
                                    }}
                                    onDoubleClick={(event) => {
                                      if (calendarMoveDrag?.bookingId === bookingId || calendarResizeDrag?.bookingId === bookingId || calendarBlockDragClickBlockRef.current) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        return;
                                      }

                                      startEdit(booking);
                                    }}
                                    className="block h-full w-full cursor-grab overflow-hidden text-left active:cursor-grabbing"
                                  >
                                    <div className="flex h-full flex-col justify-start overflow-hidden">
                                      <div className={`${isShortCalendarBlock(booking) ? "text-[11px]" : "text-[12px]"} truncate font-semibold leading-[1.05] opacity-85`}>
                                        {isPendingBooking(booking) ? <span className="mr-1 rounded bg-white/75 px-1 py-0 text-[10px] text-slate-600 ring-1 ring-slate-300">요청</span> : null}
                                        {compactBookingTypeLabel(booking.bookingType)}
                                      </div>
                                      <div className={`${isShortCalendarBlock(booking) ? "text-[12px]" : "text-[13px]"} truncate font-bold leading-[1.08] text-current`}>
                                        {calendarPersonLabel(booking)}
                                      </div>
                                      {calendarInstructorLabel(booking) ? (
                                        <div className={`${isShortCalendarBlock(booking) ? "text-[11px]" : "text-[12px]"} truncate font-medium leading-[1.08] opacity-80`}>
                                          {calendarInstructorLabel(booking)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    onMouseDown={(event) => beginCalendarResizeDrag(event, booking)}
                                    onMouseUp={(event) => {
                                      event.stopPropagation();
                                    }}
                                    className="absolute right-0 bottom-1 top-1 hidden w-3 cursor-ew-resize rounded-full bg-white/85 shadow-sm ring-1 ring-[#9fb4cf] transition hover:bg-[#eaf3ff] group-hover:block"
                                    title="종료시간 15분 단위 조절"
                                  />

                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-[720px] overflow-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[140px_repeat(7,minmax(120px,1fr))] border-b border-[#dce7f3] pb-2 text-[13px] font-medium text-[#425a78]">
                  <div>{calendarResourceMode === "instructor" ? "교관" : "항공기"}</div>
                  {calendarDates.map((date) => (
                    <div key={date} className="text-center">
                      <div>{shortDateLabel(date)}</div>
                      <div className="mt-0.5 text-[#8aa0ba]">{weekdayLabel(date)}</div>
                    </div>
                  ))}
                </div>

                <div className="divide-y divide-[#edf2f8]">
                  {calendarResourceRows().map((resource, resourceIndex) => (
                    <div key={`${resourceName(resource)}-${resourceIndex}`} className="grid grid-cols-[140px_repeat(7,minmax(120px,1fr))]">
                      <div className={`flex min-h-[104px] items-center gap-2 pr-3 text-sm font-semibold ${calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? "text-slate-500" : "text-[#102544]"}`}>
                        <span className={calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? "text-slate-400" : "text-[#1f6fff]"}>{calendarResourceMode === "instructor" ? "👤" : "✈"}</span>
                        <div>
                          <div>{resourceName(resource)}</div>
                          {calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? (
                            <div className="mt-1 text-[13px] font-semibold text-slate-500">{aircraftStatusLabel(resource as AircraftRow)}</div>
                          ) : null}
                        </div>
                      </div>

                      {calendarDates.map((date) => {
                        const dayBookings = calendarRowBookings(resource, date);

                        return (
                          <div key={`${resourceName(resource)}-${date}`} className="min-h-[104px] border-l border-[#edf2f8] p-2">
                            {dayBookings.length === 0 ? (
                              <button
                                type="button"
                                disabled={calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow)}
                                onClick={() => applyCalendarSlot(resource, "09:00", date)}
                                className="h-full min-h-[74px] w-full rounded-2xl border border-dashed border-[#d8e3f2] bg-[#fbfdff] text-xs font-bold text-[#9aacc3] hover:border-[#8fb8ff] hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                              >
                                {calendarResourceMode === "aircraft" && !isAircraftOperational(resource as AircraftRow) ? "예약 불가" : "빈 일정"}
                              </button>
                            ) : (
                              <div className="space-y-2">
                                {dayBookings.map((booking, index) => (
                                  <button
                                    key={`${text(booking.bookingId, "booking")}-${index}`}
                                    type="button"
                                    onClick={() => startEdit(booking)}
                                    title={bookingTooltip(booking)} className={`w-full rounded-xl border px-2 py-1.5 text-left shadow-sm ${calendarTypeClass(booking.bookingType)}`}
                                  >
                                    <div className="truncate text-[12px] font-semibold leading-tight opacity-80">{compactBookingTypeLabel(booking.bookingType)}</div>
                                    <div className="mt-0.5 truncate text-[13px] font-semibold leading-tight">{calendarPersonLabel(booking)}</div>
                                    {calendarInstructorLabel(booking) ? (
                                      <div className="mt-0.5 truncate text-[12px] font-semibold leading-tight opacity-75">{calendarInstructorLabel(booking)}</div>
                                    ) : null}
                                    <div className="mt-0.5 text-[12px] font-semibold leading-tight opacity-70">
                                      {normalizeTime(booking.startTime)}~{normalizeTime(booking.endTime)}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-bold text-[#61758f]">
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">빈 칸 드래그: 시간 선택</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">블록 클릭: 선택</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">블록 더블클릭: 상세수정</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">블록 드래그: 이동</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">오른쪽 끝 드래그: 종료시간 조절</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">PFI: 교육/렌탈 시작 30분 전</span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[13px] font-medium">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 ring-1 ring-blue-100">교육비행</span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700 ring-1 ring-orange-100">렌탈비행</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">체험비행</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-100">기타/사용제한</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-100">PFI</span>
          </div>
        </section>

        <section className="grid gap-2 xl:grid-cols-[minmax(330px,0.75fr)_minmax(0,1.25fr)]">
          <div className="min-w-0 overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 shadow-[0_18px_50px_rgba(20,46,80,0.07)]">
            <div className="flex items-center justify-between border-b border-[#edf2f7] px-3 py-2">
              <div>
                <h2 className="text-[15px] font-semibold text-[#10213f]">처리 대기 요청</h2>
                <p className="mt-0.5 text-[13px] font-normal text-[#61758f]">승인 대기와 취소 요청을 확인하고, 선택한 예약 패널에서도 상태 처리할 수 있습니다.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[13px] font-medium text-blue-700">{pendingRequestBookings.length}건</span>
            </div>

            {pendingRequestBookings.length === 0 ? (
              <div className="mx-5 my-3 rounded-xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] px-3 py-3 text-center"><p className="text-[13px] font-medium text-[#60738d]">처리 대기 요청이 없습니다.</p><p className="mt-1 text-[13px] font-normal text-[#8ba0b8]">앱 예약 요청과 취소 요청이 들어오면 이 영역에 표시됩니다.</p></div>
            ) : (
              <div className="divide-y divide-[#edf2f8]">
                {pendingRequestBookings.slice(0, 6).map((item, index) => {
                  const actions = statusActionButtonsForBooking(item);
                  return (
                    <div key={`${text(item.bookingId, "request")}-${index}`} title={bookingTooltip(item)} onClick={() => focusBookingInCalendar(item)} className={`pending-request-list-card flex cursor-pointer flex-col gap-2 border-l-4 px-3 py-2 transition hover:bg-blue-50/60 md:flex-row md:items-center md:justify-between ${pendingRequestToneClass(item.status)}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span title={statusBadgeTitle(normalizedStatusOf(item))} className={`inline-flex rounded-full px-1.5 py-0.5 text-[13px] font-semibold ring-1 ${statusBadgeClass(normalizedStatusOf(item))}`}>
                            {normalizedStatusOf(item)}
                          </span>
                          {isFutureCompletedBooking(item) ? (
                            <span title={futureCompletedTitle(item)} className="rounded-full bg-rose-50 px-2 py-0.5 text-[13px] font-semibold text-rose-700 ring-1 ring-rose-200">미래완료</span>
                          ) : null}
                          <span className="text-[13px] font-medium text-[#163255]">{normalizeDate(item.bookingDate)} {normalizeTime(item.startTime)}~{normalizeTime(item.endTime)}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">{pendingRequestSummary(item)}</p>
                        <p className="mt-0.5 truncate text-[13px] font-normal text-[#6d7f96]">{formatPhone(item.phone) || "-"} · 담당 {text(item.instructorName, "-")}</p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); focusBookingInCalendar(item); }}
                          className="inline-flex h-7 items-center rounded-md bg-blue-50 px-1.5 text-[13px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                          선택
                        </button>
                        {actions.map((action) => (
                          <button
                            key={`${text(item.bookingId, "")}-${action.nextStatus}`}
                            type="button"
                            onClick={(event) => { event.stopPropagation(); void changeBookingStatus(item, action.nextStatus, action.actionLabel); }}
                            disabled={saving}
                            title={actionButtonTitle(action.nextStatus)}
                            className={`inline-flex h-7 items-center rounded-lg px-1.5 text-[13px] font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${action.tone === "primary" ? "bg-blue-600 text-white hover:bg-blue-700" : action.tone === "danger" ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "bg-slate-100 text-[#405875] hover:bg-slate-200"}`}
                          >
                            {action.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          title="수정: 예약 수정 폼으로 이동합니다."
                          className="inline-flex h-7 items-center rounded-lg border border-[#d3ddeb] bg-white px-1.5 text-[13px] font-medium leading-none text-[#28486d] transition hover:bg-[#f7faff]">
                          상세
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-[24px] border border-[#d9e6f5] bg-white/95 p-3 shadow-[0_10px_28px_rgba(20,46,80,0.07)]">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-[#10213f]">선택한 예약</h2>
                <p className="mt-0.5 text-[13px] font-normal text-[#61758f]">캘린더나 목록에서 선택한 예약을 확인하고 상태를 처리합니다. 선택된 예약은 캘린더와 목록에서 함께 강조됩니다.</p>
              </div>
              {selectedBooking ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span title={statusBadgeTitle(normalizedStatusOf(selectedBooking))} className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ${statusBadgeClass(normalizedStatusOf(selectedBooking))}`}>
                    {normalizedStatusOf(selectedBooking)}
                  </span>
                  <button
                    type="button"
                    onClick={clearSelectedBooking}
                    className="inline-flex h-7 items-center rounded-md border border-[#d3ddeb] bg-white px-1.5 text-[13px] font-medium text-[#405875] hover:bg-[#f7faff]"
                  >
                    선택 해제
                  </button>
                </div>
              ) : null}
            </div>

            {!selectedBooking ? (
              <div className="rounded-xl border border-dashed border-[#d7e1ed] bg-[#f8fbff] px-3 py-2.5 text-center text-[13px] font-medium text-[#7c8da4]">
                예약을 선택하면 상세 정보가 표시됩니다.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="min-w-0 rounded-[16px] border border-blue-100 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_100%)] p-3 shadow-[0_8px_20px_rgba(37,99,235,0.06)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ${bookingTypeBadgeClass(selectedBooking.bookingType)}`}>
                      {text(selectedBooking.bookingType)}
                    </span>
                    <span title={statusBadgeTitle(normalizedStatusOf(selectedBooking))} className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ${statusBadgeClass(normalizedStatusOf(selectedBooking))}`}>
                      {normalizedStatusOf(selectedBooking)}
                    </span>
                    {isFutureCompletedBooking(selectedBooking) ? (
                      <span title={futureCompletedTitle(selectedBooking)} className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[13px] font-semibold text-rose-700 ring-1 ring-rose-200">
                        미래완료
                      </span>
                    ) : null}
                    <span className="text-[13px] font-medium text-[#7b8da5]">예약ID {text(selectedBooking.bookingId, "-")}</span>
                  </div>

                  <p className="mt-3 text-[14px] font-semibold tracking-[-0.02em] text-[#10213f]">
                    {text(selectedBooking.userName)} · {bookingDisplayTitle(selectedBooking)}
                  </p>

                  {latestActionMemo(selectedBooking.memo) ? (
                    <div className="mt-2 rounded-xl border border-[#e1eaf6] bg-[#f8fbff] px-3 py-2 text-[13px] font-medium text-[#536b87]">
                      최근 처리 이력: {latestActionMemo(selectedBooking.memo)}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-[13px] font-medium text-[#405875]">
                    <div className="rounded-lg bg-white px-2 py-1.5">
                      <p className="text-[13px] font-semibold text-[#7b8da5]">일정</p>
                      <p className="mt-0.5 truncate font-medium text-[#102544]">{formatBookingSummaryDate(selectedBooking.bookingDate)} {formatBookingSummaryTimeRange(selectedBooking.startTime, selectedBooking.endTime)}</p>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-1.5">
                      <p className="text-[13px] font-semibold text-[#7b8da5]">항공기</p>
                      <p className="mt-0.5 truncate font-medium text-[#102544]">{aircraftDisplay(selectedBooking)}</p>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-1.5">
                      <p className="text-[13px] font-semibold text-[#7b8da5]">담당</p>
                      <p className="mt-0.5 truncate font-medium text-[#102544]">{text(selectedBooking.instructorName, "-")}</p>
                    </div>
                    <div className="rounded-lg bg-white px-2 py-1.5">
                      <p className="text-[13px] font-semibold text-[#7b8da5]">전화번호</p>
                      <p className="mt-0.5 truncate font-medium text-[#102544]">{text(selectedBooking.phone, "-")}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-end gap-1.5 rounded-[16px] border border-[#e1eaf6] bg-[#f8fbff] p-2.5">
                  <div className="min-w-0 flex-1">
                    <label className="text-[13px] font-medium text-[#60738d]">처리 메모</label>
                    <input
                      value={requestActionMemo}
                      onChange={(event) => setRequestActionMemo(event.target.value)}
                      placeholder="예: 교관 확인 후 승인 / 고객 요청에 따라 취소 승인 / 기상 악화로 취소"
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#d4deeb] bg-white px-3 text-[13px] text-[#203756] outline-none transition focus:border-[#1f6fff] focus:ring-4 focus:ring-[#dbeafe]"
                    />
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pb-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(selectedBooking)}
                      title="수정: 예약 수정 폼으로 이동합니다."
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d3ddeb] bg-white px-2.5 text-[13px] font-medium text-[#28486d] transition hover:bg-[#f7faff]"
                    >
                      상세
                    </button>
                    {statusActionButtonsForBooking(selectedBooking).map((action) => (
                      <button
                        key={`panel-${action.nextStatus}`}
                        type="button"
                        disabled={saving}
                        onClick={() => void changeBookingStatus(selectedBooking, action.nextStatus, action.actionLabel, requestActionMemo)}
                        title={actionButtonTitle(action.nextStatus)}
                        className={`inline-flex h-7 items-center rounded-md px-1.5 text-[13px] font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${action.tone === "primary" ? "bg-blue-600 text-white hover:bg-blue-700" : action.tone === "danger" ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "bg-slate-100 text-[#405875] hover:bg-slate-200"}`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>


        <section ref={formRef} className="min-w-0 rounded-[24px] border border-[#d9e6f5] bg-white/95 p-2.5 shadow-[0_12px_34px_rgba(20,46,80,0.065)]">
          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#10213f]">{editing ? "예약 상세 수정" : "예약 신규 등록"}</h2>
                <span className={`rounded-full px-1.5 py-0.5 text-[13px] font-medium ${editing ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100" : "bg-blue-50 text-blue-700 ring-1 ring-blue-100"}`}>
                  {editing ? "수정 모드" : "신규 등록"}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] font-normal text-[#61758f]">필수 항목을 선택하면 대상자 정보와 코스 기준 점유 시간이 자동으로 정리됩니다.</p>
              <div className="mt-1.5 rounded-xl border border-[#e1eaf6] bg-[#f8fbff] px-3 py-1.5 text-[13px] font-medium text-[#536b87]">
                입력 요약: {compactFormSummary(form)}
              </div>
            </div>
            <div className="flex flex-nowrap items-center justify-end gap-2 lg:max-w-[520px]">
              {bookingTypeGuideMessage() ? (
                <span
                  title={bookingTypeGuideMessage()}
                  className="inline-flex h-8 max-w-[360px] items-center truncate rounded-xl border border-blue-100 bg-blue-50/70 px-3 text-[13px] font-medium text-blue-800"
                >
                  {bookingTypeGuideMessage()}
                </span>
              ) : null}
              <button
                type="button"
                onClick={startCreate}
                disabled={saving || Boolean(movingBookingId)}
                className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-2 text-[13px] font-medium text-[#28486d] hover:bg-[#f7faff]"
              >
                입력 초기화
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <FormGroup title="예약 정보" description="유형·대상자·자원·시간 순서로 입력합니다." columns="xl:grid-cols-8">
              <Field label="예약 유형" required>
                <select value={form.bookingType} onChange={(event) => resetTypeSpecificFields(event.target.value)} className="input-base compact-input">
                  {bookingTypes
                    .filter((item) => ["교육비행", "렌탈비행", "체험비행", "기타"].includes(item))
                    .map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>

              <Field label="예약일" required>
                <input type="date" value={form.bookingDate} onChange={(event) => updateForm("bookingDate", event.target.value)} className="input-base compact-input" />
              </Field>

              {isEducationForm ? (
                <Field label="교육생" required>
                  <select value={text(activeStudents.find((item) => text(item.userId, "") === form.userId)?.studentId, form.userId)} onChange={(event) => selectStudent(event.target.value)} className="input-base compact-input">
                    <option value="">교육생 선택</option>
                    {activeStudents.map((item, index) => {
                      const studentId = text(item.studentId, "");
                      return <option key={`${studentId}-${index}`} value={studentId}>{text(item.name)} / {studentId}</option>;
                    })}
                  </select>
                </Field>
              ) : null}

              {isRentalForm ? (
                <Field label="렌탈 기장" required>
                  <select value={form.rentalPilotId || form.userId || ""} onChange={(event) => handleRentalPilotChange(event.target.value)} className="input-base compact-input">
                    <option value="">렌탈 기장 선택</option>
                    {rentalPilotOptionsForForm.map((item, index) => {
                      const pilotId = text(item.pilotId || item.userId, "");
                      return <option key={`${pilotId}-${index}`} value={pilotId}>{text(item.name, "")} / {pilotId}</option>;
                    })}
                  </select>
                </Field>
              ) : null}

              {isExperienceForm ? (
                <Field label="코스/대상자">
                  <select value={selectedCourseOptionValue()} onChange={(event) => selectCourse(event.target.value)} className="input-base compact-input">
                    <option value="">코스 선택</option>
                    {filteredCoursesForForm.map((item, index) => {
                      const courseId = text(item.courseId || item.courseName, "");
                      const rawDuration = courseDurationMinutes(item);
                      const scheduledDuration = rawDuration > 0 ? scheduleDurationMinutes(rawDuration, "체험비행") : 0;
                      const displayDuration = rawDuration > 0
                        ? scheduledDuration > rawDuration
                          ? `${rawDuration}분 코스 · 예약점유 ${scheduledDuration}분`
                          : `${rawDuration}분 코스`
                        : "";
                      const label = [item.courseName, displayDuration]
                        .map((value) => text(value, ""))
                        .filter(Boolean)
                        .join(" / ");
                      return <option key={`${courseId}-${index}`} value={courseId}>{label}</option>;
                    })}
                  </select>
                </Field>
              ) : null}

              {!isRentalForm && !isOtherUseForm ? (
                <Field label="담당 교관" required={isExperienceForm || isRideAlongForm} auto={isEducationForm && !!form.instructorId}>
                  <select value={form.instructorId} onChange={(event) => selectInstructor(event.target.value)} className="input-base compact-input" disabled={isEducationForm && !!form.instructorId}>
                    <option value="">{isEducationForm ? "자동 배정" : "교관 선택"}</option>
                    {instructors.filter((item) => isActiveValue(item.active)).map((item, index) => {
                      const instructorId = text(item.instructorId, "");
                      return <option key={`${instructorId}-${index}`} value={instructorId}>{text(item.name)} / {instructorId}</option>;
                    })}
                  </select>
                </Field>
              ) : isRentalForm ? (
                <Field label="감독">
                  <select value={form.instructorId} onChange={(event) => selectInstructor(event.target.value)} className="input-base compact-input">
                    <option value="">감독 없음</option>
                    {instructors.filter((item) => isActiveValue(item.active)).map((item, index) => {
                      const instructorId = text(item.instructorId, "");
                      return <option key={`${instructorId}-${index}`} value={instructorId}>{text(item.name)} / {instructorId}</option>;
                    })}
                  </select>
                </Field>
              ) : null}

              <Field label="항공기" required={isRentalForm || isExperienceForm || isEducationForm || isOtherUseForm} auto={isEducationForm && educationAssignedAircraft.length === 1 && !!form.aircraftId}>
                <select value={form.aircraftId} onChange={(event) => selectAircraft(event.target.value)} className="input-base compact-input" disabled={isEducationForm && educationAssignedAircraft.length <= 1 && !!form.aircraftId}>
                  <option value="">{isEducationForm ? "배정 항공기 선택" : "항공기 선택"}</option>
                  {selectableAircraftForForm.map((item, index) => {
                    const aircraftId = text(item.aircraftId, "");
                    const disabled = !isOtherUseForm && !isAircraftOperational(item);
                    const statusNote = !isAircraftOperational(item) ? ` · ${aircraftStatusLabel(item)}` : "";
                    return (
                      <option key={`${aircraftId}-${index}`} value={aircraftId} disabled={disabled}>
                        {aircraftDisplay(item)} / {aircraftId}{statusNote}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="시작시간" required>
                <select value={form.startTime} onChange={(event) => updateStartTime(event.target.value)} className="input-base compact-input">
                  <option value="">시작시간</option>
                  {timeOptions.map((item) => {
                    const disabled = isStartTimeDisabled(item);
                    return (
                      <option key={item} value={item} disabled={disabled}>
                        {disabled ? `${item} · 예약불가` : item}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="점유시간" required>
                <select value={String(durationMinutes)} onChange={(event) => updateDuration(event.target.value)} className="input-base compact-input">
                  {durationOptions.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="종료시간" auto>
                <input value={form.endTime || "자동"} disabled className="input-disabled compact-input" />
              </Field>
            </FormGroup>

            {(isEducationForm && form.userId) ? (
              <div className="grid gap-2 rounded-[14px] border border-blue-100 bg-blue-50/70 px-3 py-2 text-[13px] text-[#28486d] md:grid-cols-3">
                <div>
                  <span className="text-[#6b7f99]">연락처</span>
                  <p className="mt-0.5 font-medium text-[#0f315f]">{form.phone || "-"}</p>
                </div>
                <div>
                  <span className="text-[#6b7f99]">배정 교관</span>
                  <p className="mt-0.5 font-medium text-[#0f315f]">{form.instructorName || "미배정"}{form.instructorId ? ` / ${form.instructorId}` : ""}</p>
                </div>
                <div>
                  <span className="text-[#6b7f99]">배정 항공기</span>
                  <p className="mt-0.5 font-medium text-[#0f315f]">{assignedAircraftText(educationAssignedAircraft) || form.aircraftName || form.aircraftId || "미배정"}</p>
                </div>
              </div>
            ) : null}

            {isRentalForm && selectedRentalPilot ? (
              <div className={`rounded-[14px] border px-3 py-2 text-[13px] font-medium ${selectableAircraftForForm.length === 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-orange-100 bg-orange-50 text-orange-800"}`}>
                배정 항공기 {selectableAircraftForForm.length}대{selectableAircraftForForm.length > 0 ? `: ${assignedAircraftText(selectableAircraftForForm)}` : "가 없습니다."}
              </div>
            ) : null}

            {conflictWarnings.length > 0 ? (
              <div className={`rounded-[14px] border px-3 py-2 text-[13px] font-medium ${hasAircraftConflict ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <div className="font-semibold">
                  {hasAircraftConflict ? "일정 중복 확인" : "교관 일정 중복 확인"}
                  <span className="ml-1 font-normal">저장 전 한 번 더 확인합니다.</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {conflictWarnings.slice(0, 3).map((warning) => (
                    <p key={`${warning.type}-${warning.bookingId}-${warning.message}`}>- {warning.message}</p>
                  ))}
                  {conflictWarnings.length > 3 ? <p>- 외 {conflictWarnings.length - 3}건</p> : null}
                </div>
              </div>
            ) : null}

            <div className="min-w-0 rounded-[14px] border border-[#e1eaf6] bg-[#fbfdff] p-2">
              <div className="grid gap-1.5 text-[13px] font-medium text-[#36506d] md:grid-cols-4 xl:grid-cols-8">
                <div className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[13px] font-semibold text-[#8292a8]">{isRentalForm ? "기장명" : isEducationForm ? "교육생명" : isOtherUseForm ? "예약명/사유" : "예약자명"}</p>
                  {isExperienceForm || isOtherUseForm ? (
                    <input
                      value={form.userName}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateForm("userName", value);
                        if (isOtherUseForm) updateForm("courseName", value);
                      }}
                      placeholder={isOtherUseForm ? "예: 방송국 촬영, 정비, 행사, 임시 사용 제한" : "체험 고객명"}
                      className="mt-1 h-9 w-full rounded-lg border border-[#d4deeb] bg-white px-2 text-[13px] outline-none focus:border-[#1f6fff]"
                    />
                  ) : (
                    <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">{form.userName || "자동 입력"}</p>
                  )}
                </div>

                <div className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[13px] font-semibold text-[#8292a8]">연락처</p>
                  {isExperienceForm ? (
                    <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="01000000000" className="mt-1 h-9 w-full rounded-lg border border-[#d4deeb] bg-white px-2 text-[13px] outline-none focus:border-[#1f6fff]" />
                  ) : isOtherUseForm ? (
                    <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="담당자 연락처 선택" className="mt-1 h-9 w-full rounded-lg border border-[#d4deeb] bg-white px-2 text-[13px] outline-none focus:border-[#1f6fff]" />
                  ) : (
                    <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">{form.phone || "자동 입력"}</p>
                  )}
                </div>

                <div className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[13px] font-semibold text-[#8292a8]">예약 상태</p>
                  {editing ? (
                    <select value={form.status} onChange={(event) => updateForm("status", event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#d4deeb] bg-white px-2 text-[13px] outline-none focus:border-[#1f6fff]">
                      {bookingStatusOptionsForEdit.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  ) : (
                    <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">확정</p>
                  )}
                </div>

                <div className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[13px] font-semibold text-[#8292a8]">예약 ID</p>
                  <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">{form.bookingId || "자동 생성"}</p>
                </div>

                <div className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[13px] font-semibold text-[#8292a8]">{isOtherUseForm ? "사용 제한 사유" : "코스/과정"}</p>
                  <p className="mt-1 truncate text-[13px] font-medium text-[#102544]">{form.courseName || "-"}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <input
                  value={form.memo}
                  onChange={(event) => updateForm("memo", event.target.value)}
                  placeholder="예약 관련 메모"
                  className="h-9 w-full rounded-lg border border-[#d4deeb] bg-white px-2 text-[13px] text-[#203756] outline-none transition focus:border-[#1f6fff] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div className="flex items-end justify-end gap-2">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => void cancelSelectedBooking()}
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-2 text-[13px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    예약취소
                  </button>
                ) : null}
                <button type="button" onClick={startCreate} className="inline-flex h-9 items-center rounded-lg border border-[#d3ddeb] bg-white px-2 text-[13px] font-medium text-[#28486d] hover:bg-[#f7faff]">초기화</button>
                <button
                  type="button"
                  onClick={() => void saveBooking()}
                  disabled={saving}
                  className={`inline-flex h-9 items-center rounded-lg px-2 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(7,26,53,0.16)] disabled:cursor-not-allowed disabled:bg-slate-400 ${conflictWarnings.length > 0 ? "bg-rose-600 hover:bg-rose-700" : "bg-[#102544] hover:bg-[#17355e]"}`}
                >
                  {saving ? "저장 중" : editing ? "수정 저장" : "예약 등록"}
                </button>
              </div>
            </div>
</div>
        </section>

        <section className="min-w-0 rounded-[24px] border border-[#d9e6f5] bg-white/95 p-2.5 shadow-[0_10px_28px_rgba(20,46,80,0.06)]">
          <div className="mb-2 flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#10213f]">예약 목록 필터</h2>
              <p className="hidden text-[#61758f]">
                유형, 상태, 날짜, 검색어를 조합해 예약 목록을 빠르게 좁힙니다. 완료 예약은 하루 일과 확인을 위해 목록/캘린더에 계속 표시하고, 취소·기상취소·노쇼·반려만 기본 숨김 처리합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={resetBookingFilters}
              className="inline-flex h-9 items-center rounded-lg border border-[#d3ddeb] bg-white px-2 text-[13px] font-medium text-[#405875] shadow-sm hover:bg-[#f7faff]"
            >
              필터 초기화
            </button>
          </div>

          <div className="mb-2 rounded-xl border border-[#e1eaf6] bg-[#f8fbff] px-3 py-2 text-[13px] font-medium text-[#536b87]">
            현재 표시: {displayFilterSummary(showCancelledBookings, statusFilter, typeFilter, dateFilter, keyword)}
          </div>

          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-[160px_160px_160px_minmax(0,1fr)_130px]">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="filter-base">
              <option value="전체">전체 유형</option>
              {bookingTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-base">
              <option value="전체">전체 상태</option>
              {bookingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="filter-base" />
            <div className="relative">
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="예약자, 교관, 항공기, 예약명, 전화번호 검색" className="filter-base pr-14" />
              {keyword ? (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-[#60738d] hover:bg-slate-200"
                >
                  지움
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setShowCancelledBookings((prev) => !prev)}
              className={`h-8 rounded-lg border px-2 text-[13px] font-medium transition ${
                showCancelledBookings
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-[#d3ddeb] bg-white text-[#6b7f99] hover:bg-[#f7faff]"
              }`}
            >
              {showCancelledBookings ? "취소/반려 포함" : "취소/반려 숨김"}
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(["전체", "오늘", "이번주", "요청", "확정", "취소요청"] as const).map((item) => {
              const active = isQuickFilterActive(item);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => applyQuickFilter(item)}
                  className={`rounded-full border px-2 py-0.5 text-[13px] font-medium shadow-sm transition ${
                    active
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-[#d7e1ed] bg-white text-[#516982] hover:bg-[#f4f8fc]"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[13px] font-medium text-[#61758f]">
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">유형 {typeFilter}</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">상태 {statusFilter}</span>
            <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">날짜 {dateFilter || "전체"}</span>
            {keyword ? <span className="rounded-full bg-[#f3f7fb] px-2 py-0.5">검색 {keyword}</span> : null}
          </div>
        </section>

        {error && (
          <section className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[20px] border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={() => void loadData(true, true)} className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
              다시 시도
            </button>
          </section>
        )}

        <section className="min-w-0 overflow-hidden rounded-[26px] border border-[#d9e6f5] bg-white/95 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
          <div className="flex flex-col gap-3 border-b border-[#edf2f7] px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#10213f]">예약 목록</h2>
              <p className="mt-0.5 text-[13px] font-normal text-[#61758f]">오늘 이후 예약을 상태 우선순위와 시간순으로 표시합니다. 목록을 클릭하면 선택 예약 패널에 표시됩니다.</p>
            </div>
            <p className="rounded-full bg-blue-50 px-3 py-1 text-[13px] font-medium text-blue-700">표시 {filteredBookings.length}건</p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-medium text-[#6d7f96]">예약 데이터를 불러오는 중입니다.</div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-12 text-center text-sm font-medium text-[#6d7f96]">표시할 예약이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] min-w-[1160px] border-separate border-spacing-0 text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#f6f9fd] text-[13px] font-semibold text-[#6f8097] shadow-[0_1px_0_#edf2f7]">
                  <tr>
                    <th className="px-2.5 py-2">일정</th>
                    <th className="px-2.5 py-2">예약정보</th>
                    <th className="px-2.5 py-2">예약자</th>
                    <th className="px-2.5 py-2">교관/기장</th>
                    <th className="px-2.5 py-2">항공기</th>
                    <th className="px-2.5 py-2">상태</th>
                    <th className="px-2.5 py-2">선택</th>
                    <th className="px-2.5 py-2 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef3f8]">
                  {filteredBookings.map((item, index) => {
                    const bookingId = text(item.bookingId, "");
                    const status = normalizedStatusOf(item);
                    return (
                      <tr
                        key={`${bookingId || "booking"}-${index}`}
                        title={bookingTooltip(item)}
                        className={`cursor-pointer transition hover:bg-[#f8fbff] ${
                          isFinalHiddenStatus(status) ? "opacity-55" : ""
                        } ${
                          selectedBooking && text(selectedBooking.bookingId, "") === bookingId
                            ? "bg-blue-50/80 shadow-[inset_5px_0_0_#2563eb,0_0_0_1px_rgba(37,99,235,0.16)]"
                            : ""
                        }`}
                        onClick={() => {
                          selectBookingForPanel(item);
                        }}
                      >
                        <td className="px-2 py-1.5 align-top">
                          <div className="inline-flex rounded-lg bg-blue-50 px-2 py-0.5 text-[13px] font-medium text-blue-700">
                            {formatCompactBookingDate(item.bookingDate)}
                          </div>
                          <div className="mt-1.5 text-[13px] font-medium text-[#102544]">{normalizeTime(item.startTime) || "-"}~{normalizeTime(item.endTime) || "-"}</div>
                          <div className="mt-0.5 max-w-[95px] truncate text-[13px] font-medium text-[#8ca0b7]">{bookingId || "-"}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-[#102544]">{bookingDisplayTitle(item)}</span>
                            {selectedBooking && text(selectedBooking.bookingId, "") === bookingId ? (
                              <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[13px] font-semibold text-white">선택됨</span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-[#8ca0b7]">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[13px] font-semibold ring-1 ${bookingTypeBadgeClass(item.bookingType)}`}>{text(item.bookingType)}</span>
                            {isUnpaidExperience(item) ? <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[13px] font-semibold text-amber-700 ring-1 ring-amber-200">미결제</span> : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="font-semibold text-[#102544]">{text(item.userName)}</div>
                          <div className="mt-1 text-[13px] font-semibold text-[#8ca0b7]">{formatPhone(item.phone)}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="font-semibold text-[#23415f]">{text(item.instructorName, "-")}</div>
                          <div className="mt-1 text-[13px] font-semibold text-[#8ca0b7]">{text(item.instructorId, "-")}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="font-semibold text-[#23415f]">{aircraftDisplay(item)}</div>
                          <div className="mt-1 text-[13px] font-semibold text-[#8ca0b7]">{text(item.aircraftId, "-")}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(status)}`}>{status || "-"}</span>
                          <div className="mt-2 text-xs font-medium text-[#8ca0b7]">수정 {formatDateTime(item.updatedAt)}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectBookingForPanel(item);
                            }}
                            title="선택: 오른쪽 선택한 예약 패널에서 상태를 처리합니다."
                            className={`inline-flex h-7 items-center rounded-lg px-2 text-[13px] font-medium leading-none transition ${
                              selectedBooking && text(selectedBooking.bookingId, "") === bookingId
                                ? "bg-blue-600 text-white"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            선택
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-right align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            {isEducationCompletedBooking(item) ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  window.location.href = trainingLogHref(item);
                                }}
                                className="inline-flex h-7 items-center rounded-lg bg-[#102544] px-1.5 text-[13px] font-medium leading-none text-white hover:bg-[#17355e]"
                              >
                                교육일지
                              </button>
                            ) : null}
                            <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(item); }} title="상세: 예약 수정 폼으로 이동합니다." className="inline-flex h-7 items-center rounded-lg border border-[#d3ddeb] bg-white px-1.5 text-[13px] font-medium leading-none text-[#28486d] transition hover:bg-[#f7faff]">
                            상세
                          </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .input-base {
          margin-top: 0.4rem;
          height: 2.25rem;
          width: 100%;
          border-radius: 0.8rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0 0.75rem;
          font-size: 0.74rem;
          font-weight: 650;
          color: rgb(32 55 86);
          outline: none;
          transition: all 0.15s ease;
        }
        .input-base:focus {
          border-color: rgb(31 111 255);
          box-shadow: 0 0 0 4px rgba(191, 219, 254, 0.65);
        }
        .input-disabled {
          margin-top: 0.4rem;
          height: 2.25rem;
          width: 100%;
          border-radius: 0.8rem;
          border: 1px solid rgb(229 236 244);
          background: rgb(248 251 255);
          padding: 0 0.75rem;
          font-size: 0.74rem;
          color: rgb(113 128 150);
          outline: none;
        }
        .filter-base {
          height: 2.25rem;
          border-radius: 0.8rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0 0.75rem;
          font-size: 0.74rem;
          font-weight: 650;
          color: rgb(51 78 110);
          outline: none;
        }
        .filter-base:focus {
          border-color: rgb(31 111 255);
          box-shadow: 0 0 0 4px rgba(191, 219, 254, 0.65);
        }
      
        .compact-input {
          height: 2.15rem !important;
          border-radius: 0.75rem !important;
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
          font-size: 12px !important;
        }

        @keyframes pending-request-soft-shake {
          0%, 74%, 100% {
            translate: 0 0;
          }
          79% {
            translate: -2px 0;
          }
          84% {
            translate: 2px 0;
          }
          89% {
            translate: -1px 0;
          }
          94% {
            translate: 1px 0;
          }
        }

        @keyframes pending-request-soft-ring {
          0%, 100% {
            opacity: 0.36;
            box-shadow: 0 0 0 0 rgba(100, 116, 139, 0.18);
          }
          50% {
            opacity: 0.8;
            box-shadow: 0 0 0 5px rgba(100, 116, 139, 0.18);
          }
        }

        @keyframes pending-request-soft-blink {
          0%, 100% {
            opacity: 0.9;
          }
          50% {
            opacity: 1;
          }
        }

        .pending-request-card {
          position: absolute;
          border-style: dashed !important;
          border-color: rgb(100 116 139) !important;
          box-shadow: 0 8px 18px rgba(20, 46, 80, 0.12), 0 0 0 2px rgba(148, 163, 184, 0.34) !important;
          animation:
            pending-request-soft-shake 2.8s ease-in-out infinite,
            pending-request-soft-blink 2.8s ease-in-out infinite;
        }

        .pending-request-card::after {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: -4px;
          border-radius: 1rem;
          border: 1px dashed rgba(100, 116, 139, 0.7);
          animation: pending-request-soft-ring 2.8s ease-in-out infinite;
        }

        .pending-request-card:hover,
        .pending-request-card:hover::after {
          animation-play-state: paused;
        }

        .pending-request-list-card {
          animation: pending-request-soft-blink 2.8s ease-in-out infinite;
        }

        .pending-request-list-card:hover {
          animation-play-state: paused;
        }

`}</style>
    </div>
  );
}

function Field({ label, children, required = false, auto = false }: { label: string; children: ReactNode; required?: boolean; auto?: boolean }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[13px] font-semibold text-[#60738d]">
        <span>{label}</span>
        {required ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="필수 입력" /> : null}
        {auto ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-500">자동</span> : null}
      </label>
      {children}
    </div>
  );
}

function FormGroup({ title, description, children, columns = "xl:grid-cols-4" }: { title: string; description?: string; children: ReactNode; columns?: string }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-[#e1eaf6] bg-[#fbfdff] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[#10213f]">{title}</h3>
        {description ? <p className="text-[13px] font-medium text-[#7b8da5]">{description}</p> : null}
      </div>
      <div className={`grid gap-2 md:grid-cols-2 ${columns}`}>
        {children}
      </div>
    </div>
  );
}
