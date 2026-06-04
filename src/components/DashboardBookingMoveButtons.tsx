"use client";

import { useState } from "react";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

type BookingPayload = Record<string, unknown>;

const SCHEDULE_START_MIN = 7 * 60;
const SCHEDULE_END_MIN = 20 * 60;
const SCHEDULE_TOTAL_MIN = SCHEDULE_END_MIN - SCHEDULE_START_MIN;

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
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

function minutesToTime(minutes: number) {
  const safe = Math.max(0, minutes);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function blockStyle(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const displayStart = Math.max(start, SCHEDULE_START_MIN);
  const displayEnd = Math.min(end, SCHEDULE_END_MIN);
  const left = ((displayStart - SCHEDULE_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;
  const width = Math.max(((displayEnd - displayStart) / SCHEDULE_TOTAL_MIN) * 100, 1.5);

  return {
    left: `${left}%`,
    width: `${Math.min(width, 100 - left)}%`,
  };
}

function updateScheduleBlock(bookingId: string, startTime: string, endTime: string, requiresPfi: boolean) {
  const bookingBlock = document.querySelector<HTMLElement>(`[data-dashboard-booking-id="${CSS.escape(bookingId)}"]`);

  if (bookingBlock) {
    const style = blockStyle(startTime, endTime);
    bookingBlock.style.left = style.left;
    bookingBlock.style.width = style.width;
    bookingBlock.dataset.startTime = startTime;
    bookingBlock.dataset.endTime = endTime;
  }

  const pfiBlock = document.querySelector<HTMLElement>(`[data-dashboard-pfi-for="${CSS.escape(bookingId)}"]`);

  if (pfiBlock) {
    if (!requiresPfi) {
      pfiBlock.remove();
      return;
    }

    const pfiStart = minutesToTime(Math.max(0, timeToMinutes(startTime) - 30));
    const style = blockStyle(pfiStart, startTime);
    pfiBlock.style.left = style.left;
    pfiBlock.style.width = style.width;
    pfiBlock.dataset.startTime = pfiStart;
    pfiBlock.dataset.endTime = startTime;
  }
}

export default function DashboardBookingMoveButtons({
  booking,
  bookingId,
  startTime,
  endTime,
  requiresPfi,
}: {
  booking: BookingPayload;
  bookingId: string;
  startTime: string;
  endTime: string;
  requiresPfi: boolean;
}) {
  const [movingDirection, setMovingDirection] = useState<number | null>(null);
  const [currentStart, setCurrentStart] = useState(startTime);
  const [currentEnd, setCurrentEnd] = useState(endTime);
  const [message, setMessage] = useState("");

  async function move(direction: number) {
    if (movingDirection !== null) return;

    const previousStart = currentStart;
    const previousEnd = currentEnd;
    const nextStart = minutesToTime(timeToMinutes(currentStart) + direction * 30);
    const nextEnd = minutesToTime(timeToMinutes(currentEnd) + direction * 30);

    if (timeToMinutes(nextStart) < SCHEDULE_START_MIN || timeToMinutes(nextEnd) > SCHEDULE_END_MIN) {
      setMessage("운항시간 밖으로 이동할 수 없습니다.");
      return;
    }

    setMovingDirection(direction);
    setMessage("저장 중...");
    setCurrentStart(nextStart);
    setCurrentEnd(nextEnd);
    updateScheduleBlock(bookingId, nextStart, nextEnd, requiresPfi);

    try {
      const response = await fetch("/api/bookings/move-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          direction,
          oldStart: previousStart,
          oldEnd: previousEnd,
          booking: {
            ...booking,
            bookingId,
            startTime: previousStart,
            endTime: previousEnd,
          },
        }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false || result.ok === false) {
        throw new Error(text(result.message, "예약 시간을 이동하지 못했습니다."));
      }

      const confirmedStart = normalizeTime(result.startTime || nextStart);
      const confirmedEnd = normalizeTime(result.endTime || nextEnd);

      setCurrentStart(confirmedStart);
      setCurrentEnd(confirmedEnd);
      updateScheduleBlock(bookingId, confirmedStart, confirmedEnd, requiresPfi);
      setMessage(result.notificationStatus === "queued" ? "이동 완료, 알림 예약" : "이동 완료");
    } catch (error) {
      setCurrentStart(previousStart);
      setCurrentEnd(previousEnd);
      updateScheduleBlock(bookingId, previousStart, previousEnd, requiresPfi);
      setMessage(error instanceof Error ? error.message : "예약 시간을 이동하지 못했습니다.");
    } finally {
      setMovingDirection(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={movingDirection !== null}
          onClick={() => move(-1)}
          className="h-7 w-full rounded-lg bg-[#eef4fb] text-[11px] font-black text-[#274464] hover:bg-[#e2ecf8] disabled:cursor-wait disabled:opacity-60"
        >
          {movingDirection === -1 ? "..." : "-30"}
        </button>
        <button
          type="button"
          disabled={movingDirection !== null}
          onClick={() => move(1)}
          className="h-7 w-full rounded-lg bg-[#eef4fb] text-[11px] font-black text-[#274464] hover:bg-[#e2ecf8] disabled:cursor-wait disabled:opacity-60"
        >
          {movingDirection === 1 ? "..." : "+30"}
        </button>
      </div>
      {message ? <p className="mt-1.5 text-center text-[9px] font-bold text-[#8a9ab0]">{message}</p> : null}
    </div>
  );
}
