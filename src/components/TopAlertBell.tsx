"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

type BookingRow = {
  bookingId?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  bookingType?: string;
  courseName?: string;
  userName?: string;
  status?: string;
  [key: string]: unknown;
};

type UserRow = {
  userId?: string;
  name?: string;
  role?: string;
  status?: string;
  requestedAt?: string;
  [key: string]: unknown;
};

type ApprovalItem = {
  id: string;
  type: "booking" | "user";
  href: string;
  title: string;
  description: string;
  badge: string;
};

type PendingState = {
  bookings: BookingRow[];
  users: UserRow[];
  pendingBookingCount: number;
  pendingUserCount: number;
};

const EMPTY_PENDING_STATE: PendingState = {
  bookings: [],
  users: [],
  pendingBookingCount: 0,
  pendingUserCount: 0,
};

let cachedPendingState: PendingState | null = null;
let cachedAt = 0;
let pendingPromise: Promise<PendingState> | null = null;

const PENDING_CACHE_MS = 10000;

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const v = String(value).trim();
  return v || fallback;
}

function isBookingPending(status: unknown) {
  const v = text(status).replace(/\s/g, "");
  return v === "요청" || v === "취소요청";
}

function isUserPending(status: unknown) {
  const v = text(status).replace(/\s/g, "").toLowerCase();
  return ["대기", "요청", "pending", "승인대기"].includes(v);
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatBookingDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value);
  return valueText === "-" ? "" : valueText;
}

function roleLabel(role: unknown) {
  const v = text(role);
  const map: Record<string, string> = {
    rental: "렌탈",
    student: "교육",
    user: "일반",
    admin: "관리자",
    instructor: "교관",
  };
  return map[v] || v || "회원";
}

function normalizePendingPayload(payload: Record<string, unknown>): PendingState {
  const rawBookings = Array.isArray(payload.bookings) ? (payload.bookings as BookingRow[]) : [];
  const rawUsers = Array.isArray(payload.users) ? (payload.users as UserRow[]) : [];

  const pendingBookings = rawBookings.filter((item) => isBookingPending(item.status));
  const pendingUsers = rawUsers.filter((item) => isUserPending(item.status));

  return {
    bookings: pendingBookings,
    users: pendingUsers,
    pendingBookingCount: Number(payload.pendingBookingCount ?? pendingBookings.length) || pendingBookings.length,
    pendingUserCount: Number(payload.pendingUserCount ?? pendingUsers.length) || pendingUsers.length,
  };
}

async function fetchPendingApprovals(force = false): Promise<PendingState> {
  const now = Date.now();

  if (!force && cachedPendingState && now - cachedAt < PENDING_CACHE_MS) {
    return cachedPendingState;
  }

  if (pendingPromise) {
    return pendingPromise;
  }

  pendingPromise = fetch("/api/pending-approvals", { cache: "no-store" })
    .then(async (response) => {
      const responseText = await response.text();
      const payload = responseText.trim() ? JSON.parse(responseText) : {};

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "승인 대기 알림 조회에 실패했습니다.");
      }

      const normalized = normalizePendingPayload(payload);
      cachedPendingState = normalized;
      cachedAt = Date.now();

      return normalized;
    })
    .catch(() => {
      cachedPendingState = EMPTY_PENDING_STATE;
      cachedAt = Date.now();
      return EMPTY_PENDING_STATE;
    })
    .finally(() => {
      pendingPromise = null;
    });

  return pendingPromise;
}

export function usePendingApprovals() {
  const [pendingState, setPendingState] = useState<PendingState>(() => cachedPendingState || EMPTY_PENDING_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load(force = false) {
      const nextState = await fetchPendingApprovals(force);
      if (!cancelled) setPendingState(nextState);
    }

    void load();

    const timer = window.setInterval(() => {
      void load(true);
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const pendingBookings = pendingState.bookings;
  const pendingUsers = pendingState.users;

  const items = useMemo<ApprovalItem[]>(() => {
    const bookingItems = pendingBookings.slice(0, 4).map((item, index): ApprovalItem => {
      const status = text(item.status);
      const name = text(item.userName, "예약자 미입력");
      const label = text(item.courseName) || text(item.bookingType) || "예약";
      const date = normalizeDate(item.bookingDate);
      const start = normalizeTime(item.startTime);
      return {
        id: `booking-${text(item.bookingId, String(index))}`,
        type: "booking",
        href: "/bookings",
        title: `${status === "취소요청" ? "취소 요청" : "예약 요청"} · ${name}`,
        description: [label, date && start ? `${date} ${start}` : date].filter(Boolean).join(" / "),
        badge: status === "취소요청" ? "취소" : "승인",
      };
    });

    const userItems = pendingUsers.slice(0, 4).map((item, index): ApprovalItem => ({
      id: `user-${text(item.userId, String(index))}`,
      type: "user",
      href: "/users",
      title: `회원 승인 대기 · ${text(item.name, "이름 미입력")}`,
      description: [roleLabel(item.role), text(item.requestedAt)].filter(Boolean).join(" / "),
      badge: "회원",
    }));

    return [...bookingItems, ...userItems];
  }, [pendingBookings, pendingUsers]);

  return {
    pendingBookingCount: pendingState.pendingBookingCount,
    pendingUserCount: pendingState.pendingUserCount,
    totalCount: pendingState.pendingBookingCount + pendingState.pendingUserCount,
    items,
  };
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5" />
      <path d="M10 17a2 2 0 004 0" />
    </svg>
  );
}

export default function TopAlertBell({ className = "" }: { className?: string }) {
  const { totalCount, pendingBookingCount, pendingUserCount, items } = usePendingApprovals();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d8e2ef] bg-white text-[#385273] shadow-sm transition hover:bg-[#f7faff]"
        aria-label="승인 대기 알림"
      >
        <BellIcon />
        {totalCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-[#ff4d5e] px-1.5 py-0.5 text-[11px] font-black leading-none text-white">
            {totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-[360px] rounded-[22px] border border-[#d8e2ef] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[#102544]">승인 대기 알림</p>
              <p className="mt-1 text-xs font-medium text-[#6d7f96]">예약 요청과 회원 승인 대기를 간단히 확인합니다.</p>
            </div>
            <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-xs font-black text-[#34527a]">
              총 {totalCount}건
            </span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <Link href="/bookings" prefetch={false} className="rounded-2xl border border-[#e5edf7] bg-[#fbfdff] px-3 py-2 text-left hover:bg-[#f4f8fd]">
              <p className="text-xs font-bold text-[#6d7f96]">예약 승인</p>
              <p className="mt-1 text-xl font-black text-[#102544]">{pendingBookingCount}</p>
            </Link>
            <Link href="/users" prefetch={false} className="rounded-2xl border border-[#e5edf7] bg-[#fbfdff] px-3 py-2 text-left hover:bg-[#f4f8fd]">
              <p className="text-xs font-bold text-[#6d7f96]">회원 승인</p>
              <p className="mt-1 text-xl font-black text-[#102544]">{pendingUserCount}</p>
            </Link>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d8e2ef] bg-[#fafcff] px-4 py-6 text-center text-sm font-medium text-[#7d8ca1]">
                현재 확인할 승인 대기 항목이 없습니다.
              </div>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-[#e8eef7] bg-white px-3 py-3 hover:bg-[#f8fbff]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#102544]">{item.title}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[#71829a]">{item.description || "상세 내용 없음"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff5e8] px-2.5 py-1 text-[11px] font-black text-[#d97706]">
                    {item.badge}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
