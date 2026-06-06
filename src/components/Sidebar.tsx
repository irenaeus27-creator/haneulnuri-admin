"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendingApprovals } from "@/components/TopAlertBell";

type MenuItem = {
  label: string;
  href: string;
  icon: IconName;
};

type AircraftWarningLevel = "none" | "soon" | "urgent" | "overdue";

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

type IconName =
  | "dashboard"
  | "calendar"
  | "message"
  | "students"
  | "document"
  | "aircraft"
  | "chart"
  | "wrench"
  | "instructor"
  | "schedule"
  | "pilot"
  | "course"
  | "coupon"
  | "image"
  | "settings"
  | "users"
  | "bell"
  | "logs";

const menuGroups: MenuGroup[] = [
  {
    title: "운영 관리",
    items: [
      { label: "대시보드", href: "/", icon: "dashboard" },
      { label: "예약관리", href: "/bookings", icon: "calendar" },
    ],
  },
  {
    title: "교육 운영",
    items: [
      { label: "교육생관리", href: "/students", icon: "students" },
      { label: "비행기록", href: "/training-logs", icon: "document" },
    ],
  },
  {
    title: "운항 자원",
    items: [
      { label: "항공기관리", href: "/aircraft", icon: "aircraft" },
      { label: "항공기 정비관리", href: "/aircraft-maintenance", icon: "wrench" },
      { label: "교관관리", href: "/instructors", icon: "instructor" },
      { label: "렌탈기장관리", href: "/rental-pilots", icon: "pilot" },
    ],
  },
  {
    title: "기준 정보",
    items: [
      { label: "코스관리", href: "/course-catalog", icon: "course" },
      { label: "문서/서약서관리", href: "/document-agreements", icon: "document" },
      { label: "파일/사진 URL", href: "/file-assets", icon: "image" },
  { label: "시스템 점검", href: "/system-health", icon: "settings" },
      { label: "설정관리", href: "/settings", icon: "settings" },
    ],
  },
  {
    title: "시스템",
    items: [
      { label: "회원관리", href: "/users", icon: "users" },
      { label: "로그관리", href: "/logs", icon: "logs" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarIcon({ name, active = false }: { name: IconName; active?: boolean }) {
  const common = {
    className: `h-[20px] w-[20px] ${active ? "text-blue-700" : "text-[#7086a7]"}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }

  if (name === "calendar" || name === "schedule") {
    return (
      <svg {...common}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg {...common}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  if (name === "students" || name === "users" || name === "instructor" || name === "pilot") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "document") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    );
  }

  if (name === "aircraft") {
    return (
      <svg {...common}>
        <path d="M10.5 21 13 14l7.5-7.5a2.1 2.1 0 0 0-3-3L10 11 3 13.5l5.2 2.3z" />
        <path d="M7.5 16.5 4 20" />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </svg>
    );
  }

  if (name === "wrench") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3z" />
      </svg>
    );
  }

  if (name === "course") {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      </svg>
    );
  }

  if (name === "coupon") {
    return (
      <svg {...common}>
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 1 0 0-4z" />
        <path d="M9 9h.01" />
        <path d="M15 15h.01" />
        <path d="m15 9-6 6" />
      </svg>
    );
  }

  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5L5 20" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.36.33.75.4 1.16.07.38.24.74.5 1.04.32.36.75.57 1.2.6H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.1.4c-.3.26-.66.43-1.04.5-.41.07-.8.2-1.16.4z" />
      </svg>
    );
  }

  if (name === "bell") {
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateDiffDays(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const dateText = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const today = new Date(`${todayText()}T00:00:00`);
  const due = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function aircraftWarningLevel(rows: Array<Record<string, unknown>>): AircraftWarningLevel {
  let level: AircraftWarningLevel = "none";
  rows.forEach((row) => {
    const activeRaw = text(row.active).toLowerCase();
    const active = row.active === true || activeRaw === "" || activeRaw === "y" || activeRaw === "yes" || activeRaw === "true" || activeRaw === "사용" || activeRaw === "활성";
    if (!active) return;
    const days = dateDiffDays(row.nextInspectionDate || row.next_inspection_date);
    if (days === null || days > 30) return;
    if (days < 0) {
      level = "overdue";
      return;
    }
    if (days <= 7 && level !== "overdue") {
      level = "urgent";
      return;
    }
    if (level === "none") level = "soon";
  });
  return level;
}

function aircraftWarningClass(level: AircraftWarningLevel) {
  if (level === "overdue") return "bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]";
  if (level === "urgent") return "bg-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,0.16)]";
  if (level === "soon") return "bg-amber-300 shadow-[0_0_0_3px_rgba(252,211,77,0.16)]";
  return "";
}

function isSystemNormal() {
  return true;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { pendingBookingCount, pendingUserCount } = usePendingApprovals();
  const systemNormal = isSystemNormal();
  const [aircraftWarning, setAircraftWarning] = useState<AircraftWarningLevel>("none");

  useEffect(() => {
    let alive = true;
    async function loadAircraftWarning() {
      try {
        const response = await fetch("/api/aircraft", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const rows = Array.isArray(data.aircraft) ? data.aircraft : [];
        if (alive) setAircraftWarning(aircraftWarningLevel(rows));
      } catch {
        if (alive) setAircraftWarning("none");
      }
    }
    void loadAircraftWarning();
    return () => {
      alive = false;
    };
  }, []);

  function itemBadge(href: string) {
    if (href === "/bookings" && pendingBookingCount > 0) return pendingBookingCount;
    if (href === "/users" && pendingUserCount > 0) return pendingUserCount;
    return 0;
  }

  return (
    <aside className="flex min-h-screen w-[270px] shrink-0 flex-col border-r border-blue-100/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_45%,#ffffff_100%)] shadow-[8px_0_30px_rgba(15,23,42,0.04)]">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_100%)] text-blue-600 shadow-[0_12px_24px_rgba(37,99,235,0.12)]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12 21 4l-6.5 16-3.2-6.7z" />
              <path d="m11.3 13.3 4.2-4.2" />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-bold tracking-[0.28em] text-blue-400">SKYNURI</p>
            <h1 className="mt-0.5 whitespace-nowrap text-[19px] font-bold tracking-[-0.04em] text-slate-950">하늘누리 비행교육원</h1>
            <p className="mt-0.5 text-[12px] font-medium text-slate-400">운영 관리 시스템</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
        {menuGroups.map((group) => (
          <div key={group.title} className="border-t border-blue-100/80 pt-3 first:border-t-0 first:pt-0">
            <p className="mb-1.5 px-3 text-[13px] font-black tracking-[0.12em] text-blue-300">
              {group.title}
            </p>

            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const badge = itemBadge(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`group flex items-center justify-between rounded-2xl px-3 py-1.5 text-[14px] font-semibold transition ${
                      active
                        ? "bg-[linear-gradient(135deg,#eaf3ff_0%,#dbeafe_100%)] text-blue-700 shadow-[0_12px_28px_rgba(37,99,235,0.12)] ring-1 ring-blue-100"
                        : "text-slate-800 hover:bg-blue-50/80 hover:text-blue-700"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition ${
                        active ? "bg-white/70 text-blue-700" : "bg-transparent text-[#7086a7] group-hover:bg-white group-hover:text-blue-600"
                      }`}>
                        <SidebarIcon name={item.icon} active={active} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>

                    <span className="ml-2 flex shrink-0 items-center gap-1.5">
                      {item.href === "/aircraft" && aircraftWarning !== "none" ? (
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${aircraftWarningClass(aircraftWarning)}`}
                          title="다음 점검 예정일 확인 필요"
                          aria-label="다음 점검 예정일 확인 필요"
                        />
                      ) : null}
                      {badge > 0 ? (
                        <span className={`min-w-[24px] rounded-full px-2 py-0.5 text-center text-[12px] font-black ${
                          active ? "bg-blue-600 text-white" : "bg-rose-100 text-rose-700"
                        }`}>
                          {badge}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3 pt-2">
        <div className="rounded-3xl border border-blue-100 bg-white/90 p-2.5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <ellipse cx="12" cy="5" rx="7" ry="3" />
                <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
                <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
              </svg>
              <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold text-slate-800">
                DB 연결 <span className={systemNormal ? "text-emerald-600" : "text-rose-600"}>{systemNormal ? "정상" : "확인 필요"}</span>
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-slate-400">
                API 연결 {systemNormal ? "정상" : "확인 필요"}
              </p>
            </div>

            <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${
              systemNormal ? "border-emerald-200 bg-emerald-50 text-emerald-500" : "border-rose-200 bg-rose-50 text-rose-500"
            }`}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {systemNormal ? <path d="m5 12 4 4L19 6" /> : <path d="M12 8v5m0 4h.01" />}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
