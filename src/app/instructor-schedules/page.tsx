"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type Row = Record<string, string | number | boolean | null | undefined>;

type ApiResult = {
  ok?: boolean;
  message?: string;
  instructorSchedules?: Row[];
  instructors?: Row[];
  bookings?: Row[];
  settings?: Row[];
};

type DayState = "근무" | "휴일";

type DayConfig = {
  state: DayState;
  startTime: string;
  endTime: string;
  lunchUnavailable: boolean;
  lunchStartTime: string;
  lunchEndTime: string;
};

type WeeklyTimeConfig = Record<string, DayConfig>;

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const displayWeekdays = ["월", "화", "수", "목", "금", "토", "일"];
const defaultStatuses = ["가능", "부분가능", "휴무", "외부일정", "비활성"];
const hourOptions = Array.from({ length: 14 }, (_, index) => `${String(index + 7).padStart(2, "0")}:00`);

const defaultDayConfig: DayConfig = {
  state: "근무",
  startTime: "09:00",
  endTime: "17:00",
  lunchUnavailable: false,
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
};

const emptyScheduleForm = {
  scheduleId: "",
  instructorId: "",
  instructorName: "",
  scheduleDate: ymd(new Date()),
  startTime: "09:00",
  endTime: "17:00",
  status: "가능",
  memo: "",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromYmd(dateText: string) {
  return new Date(`${dateText}T00:00:00`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStartMonday(dateText: string) {
  const date = dateFromYmd(dateText);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return ymd(date);
}

function weekdayOf(dateText: string) {
  return weekdays[dateFromYmd(dateText).getDay()] || "";
}

function formatShortDate(dateText: string) {
  const date = dateFromYmd(dateText);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function splitDays(value: unknown) {
  return text(value)
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinDays(days: string[]) {
  return displayWeekdays.filter((day) => days.includes(day)).join(",");
}

function isNonBlocking(status: unknown) {
  return ["취소", "기상취소", "노쇼", "반려"].includes(text(status));
}

function isInactiveInstructor(row: Row) {
  const active = text(row.active).toUpperCase();
  const status = text(row.status);
  return active === "N" || status === "비활성" || status === "퇴사";
}

function getInstructorName(row?: Row) {
  return text(row?.name || row?.instructorName);
}

function settingValues(settings: Row[], key: string, fallback: string[]) {
  const seen = new Set<string>();
  const values = settings
    .filter((row) => text(row.key) === key)
    .map((row) => text(row.value))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });

  return values.length ? values : fallback;
}

function getBookingTime(row: Row) {
  const start = text(row.startTime);
  const end = text(row.endTime);
  if (!start && !end) return "-";
  return `${start || "-"}~${end || "-"}`;
}

function bookingTitle(row: Row) {
  return text(row.bookingType || row.courseName || row.userName || "예약");
}

function availableTimeLabel(config: DayConfig) {
  if (config.state === "휴일") return "매주 휴일";

  const start = config.startTime || "09:00";
  const end = config.endTime || "17:00";

  if (!config.lunchUnavailable) return `${start}~${end}`;

  const lunchStart = "12:00";
  const lunchEnd = "13:00";

  if (start < lunchStart && end > lunchEnd) {
    return `${start}~${lunchStart} / ${lunchEnd}~${end}`;
  }

  if (start >= lunchStart && start < lunchEnd && end > lunchEnd) {
    return `${lunchEnd}~${end}`;
  }

  if (start < lunchStart && end > lunchStart && end <= lunchEnd) {
    return `${start}~${lunchStart}`;
  }

  if (start >= lunchStart && end <= lunchEnd) {
    return "점심시간 배정 불가";
  }

  return `${start}~${end}`;
}

function createDefaultWeeklyConfig(holidayDays: string[] = []): WeeklyTimeConfig {
  return displayWeekdays.reduce((acc, day) => {
    acc[day] = {
      ...defaultDayConfig,
      state: holidayDays.includes(day) ? "휴일" : "근무",
    };
    return acc;
  }, {} as WeeklyTimeConfig);
}

function safeParseWeeklyConfig(row?: Row): WeeklyTimeConfig {
  const holidayDays = splitDays(row?.weeklyOffDays);
  const fallback = createDefaultWeeklyConfig(holidayDays);
  const raw = text(row?.weeklyAvailableTimes);

  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<WeeklyTimeConfig>;
    const normalized = createDefaultWeeklyConfig(holidayDays);

    displayWeekdays.forEach((day) => {
      const item = parsed?.[day];
      normalized[day] = {
        ...normalized[day],
        ...(item || {}),
        state: item?.state === "휴일" || holidayDays.includes(day) ? "휴일" : "근무",
        startTime: text(item?.startTime) || normalized[day].startTime,
        endTime: text(item?.endTime) || normalized[day].endTime,
        lunchUnavailable: Boolean(item?.lunchUnavailable),
        lunchStartTime: text(item?.lunchStartTime) || normalized[day].lunchStartTime,
        lunchEndTime: text(item?.lunchEndTime) || normalized[day].lunchEndTime,
      };
    });

    return normalized;
  } catch {
    return fallback;
  }
}

function getDayStatus(weeklyConfig: DayConfig, schedules: Row[]) {
  const holiday = schedules.find((item) => ["휴무", "비활성"].includes(text(item.status)));
  if (holiday) {
    return {
      label: "휴일",
      sub: text(holiday.memo) || "예외 휴일",
      holiday: true,
      tone: "holiday",
      config: weeklyConfig,
    };
  }

  const external = schedules.find((item) => text(item.status) === "외부일정");
  if (external) {
    return {
      label: "외부",
      sub: text(external.memo) || `${text(external.startTime || "09:00")}~${text(external.endTime || "17:00")}`,
      holiday: true,
      tone: "external",
      config: weeklyConfig,
    };
  }

  const partial = schedules.find((item) => text(item.status) === "부분가능");
  if (partial) {
    return {
      label: "부분",
      sub: availableTimeLabel({
        ...weeklyConfig,
        startTime: text(partial.startTime || weeklyConfig.startTime),
        endTime: text(partial.endTime || weeklyConfig.endTime),
      }),
      holiday: false,
      tone: "partial",
      config: weeklyConfig,
    };
  }

  const available = schedules.find((item) => text(item.status) === "가능");
  if (available) {
    return {
      label: "근무",
      sub: availableTimeLabel({
        ...weeklyConfig,
        startTime: text(available.startTime || weeklyConfig.startTime),
        endTime: text(available.endTime || weeklyConfig.endTime),
      }),
      holiday: false,
      tone: "work",
      config: weeklyConfig,
    };
  }

  if (weeklyConfig.state === "휴일") {
    return {
      label: "휴일",
      sub: "매주 휴일",
      holiday: true,
      tone: "holiday",
      config: weeklyConfig,
    };
  }

  return {
    label: "근무",
    sub: availableTimeLabel(weeklyConfig),
    holiday: false,
    tone: "work",
    config: weeklyConfig,
  };
}

function dayCellClass(tone: string) {
  if (tone === "holiday") return "border-slate-200 bg-slate-50";
  if (tone === "external") return "border-amber-200 bg-amber-50/60";
  if (tone === "partial") return "border-blue-200 bg-blue-50/60";
  return "border-blue-100 bg-white";
}

function dayBadgeClass(tone: string) {
  if (tone === "holiday") return "border-slate-200 bg-slate-100 text-slate-600";
  if (tone === "external") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "partial") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function countHolidayDays(config: WeeklyTimeConfig) {
  return displayWeekdays.filter((day) => config[day]?.state === "휴일").length;
}

export default function InstructorSchedulesPage() {
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [weeklyInstructorId, setWeeklyInstructorId] = useState("");
  const [weeklyConfig, setWeeklyConfig] = useState<WeeklyTimeConfig>(createDefaultWeeklyConfig());
  const [baseDate, setBaseDate] = useState(ymd(new Date()));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/instructor-schedules", { cache: "no-store" });
      const data = (await response.json()) as ApiResult;

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "교관 스케줄 데이터를 불러오지 못했습니다.");
      }

      const nextInstructors = Array.isArray(data.instructors) ? data.instructors : [];
      setSchedules(Array.isArray(data.instructorSchedules) ? data.instructorSchedules : []);
      setInstructors(nextInstructors);
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setSettings(Array.isArray(data.settings) ? data.settings : []);

      if (!weeklyInstructorId && nextInstructors.length) {
        const first = nextInstructors.find((row) => !isInactiveInstructor(row)) || nextInstructors[0];
        setWeeklyInstructorId(text(first.instructorId));
        setWeeklyConfig(safeParseWeeklyConfig(first));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "교관 스케줄 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const statusOptions = useMemo(
    () => settingValues(settings, "instructorScheduleStatus", defaultStatuses),
    [settings],
  );

  const activeInstructors = useMemo(
    () => instructors.filter((row) => !isInactiveInstructor(row)),
    [instructors],
  );

  const weekStart = useMemo(() => weekStartMonday(baseDate), [baseDate]);

  const weekDates = useMemo(() => {
    const start = dateFromYmd(weekStart);
    return Array.from({ length: 7 }, (_, index) => ymd(addDays(start, index)));
  }, [weekStart]);

  const selectedWeeklyInstructor = useMemo(
    () => instructors.find((row) => text(row.instructorId) === weeklyInstructorId),
    [instructors, weeklyInstructorId],
  );

  const tableRows = useMemo(() => {
    return activeInstructors.map((instructor) => {
      const instructorId = text(instructor.instructorId);
      const name = getInstructorName(instructor);
      const instructorWeeklyConfig = safeParseWeeklyConfig(instructor);

      const cells = weekDates.map((date) => {
        const weekday = weekdayOf(date);
        const dayConfig = instructorWeeklyConfig[weekday] || defaultDayConfig;

        const daySchedules = schedules.filter((schedule) => {
          const sameInstructor =
            (instructorId && text(schedule.instructorId) === instructorId) ||
            name === text(schedule.instructorName);
          return sameInstructor && text(schedule.scheduleDate || schedule.date).substring(0, 10) === date;
        });

        const dayBookings = bookings.filter((booking) => {
          if (isNonBlocking(booking.status)) return false;
          const sameInstructor =
            (instructorId && text(booking.instructorId) === instructorId) ||
            name === text(booking.instructorName);
          return sameInstructor && text(booking.bookingDate || booking.date).substring(0, 10) === date;
        });

        const status = getDayStatus(dayConfig, daySchedules);

        return {
          date,
          weekday,
          schedules: daySchedules,
          bookings: dayBookings,
          status,
        };
      });

      return {
        instructorId,
        name,
        status: text(instructor.status),
        weeklyConfig: instructorWeeklyConfig,
        holidayDays: displayWeekdays.filter((day) => instructorWeeklyConfig[day]?.state === "휴일"),
        cells,
      };
    });
  }, [activeInstructors, schedules, bookings, weekDates]);

  const weeklySummary = useMemo(() => {
    const totalCells = tableRows.length * 7;
    const holiday = tableRows.reduce(
      (sum, row) => sum + row.cells.filter((cell) => cell.status.holiday).length,
      0,
    );
    const bookingCount = tableRows.reduce(
      (sum, row) => sum + row.cells.reduce((daySum, cell) => daySum + cell.bookings.length, 0),
      0,
    );
    const lunchBlocked = tableRows.reduce(
      (sum, row) => sum + row.cells.filter((cell) => cell.status.config.lunchUnavailable).length,
      0,
    );

    return {
      totalCells,
      work: totalCells - holiday,
      holiday,
      bookingCount,
      lunchBlocked,
    };
  }, [tableRows]);

  function previousWeek() {
    setBaseDate((current) => ymd(addDays(dateFromYmd(current), -7)));
  }

  function nextWeek() {
    setBaseDate((current) => ymd(addDays(dateFromYmd(current), 7)));
  }

  function selectScheduleInstructor(instructorId: string) {
    const selected = activeInstructors.find((row) => text(row.instructorId) === instructorId);
    setScheduleForm((prev) => ({
      ...prev,
      instructorId,
      instructorName: selected ? getInstructorName(selected) : "",
    }));
  }

  function selectWeeklyInstructor(instructorId: string) {
    const selected = instructors.find((row) => text(row.instructorId) === instructorId);
    setWeeklyInstructorId(instructorId);
    setWeeklyConfig(safeParseWeeklyConfig(selected));
  }

  function updateDayConfig(day: string, patch: Partial<DayConfig>) {
    setWeeklyConfig((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || defaultDayConfig),
        ...patch,
      },
    }));
  }

  async function saveWeeklyConfig() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!weeklyInstructorId) throw new Error("교관을 선택하세요.");

      const selected = instructors.find((row) => text(row.instructorId) === weeklyInstructorId);
      const normalizedWeeklyConfig = displayWeekdays.reduce((acc, day) => {
        const item = weeklyConfig[day] || defaultDayConfig;
        acc[day] = {
          ...item,
          lunchStartTime: item.lunchUnavailable ? "12:00" : item.lunchStartTime,
          lunchEndTime: item.lunchUnavailable ? "13:00" : item.lunchEndTime,
        };
        return acc;
      }, {} as WeeklyTimeConfig);

      const holidayDays = displayWeekdays.filter((day) => normalizedWeeklyConfig[day]?.state === "휴일");

      const response = await fetch("/api/instructor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "updateWeeklyOffDays",
          data: {
            ...selected,
            instructorId: weeklyInstructorId,
            name: getInstructorName(selected),
            weeklyOffDays: joinDays(holidayDays),
            weeklyAvailableTimes: JSON.stringify(normalizedWeeklyConfig),
          },
        }),
      });

      const data = (await response.json()) as ApiResult;
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "요일별 가능시간 설정을 저장하지 못했습니다.");
      }

      setMessage("요일별 휴일/가능시간 설정을 저장했습니다.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "요일별 가능시간 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!scheduleForm.instructorId) throw new Error("교관을 선택하세요.");

      const selected = instructors.find((row) => text(row.instructorId) === scheduleForm.instructorId);
      const config = safeParseWeeklyConfig(selected);
      const dayConfig = config[weekdayOf(scheduleForm.scheduleDate)];

      if (dayConfig?.state === "휴일" && scheduleForm.status !== "휴무") {
        throw new Error("해당 날짜는 매주 휴일입니다. 가능 스케줄로 저장할 수 없습니다.");
      }

      const response = await fetch("/api/instructor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: scheduleForm.scheduleId ? "update" : "add", data: scheduleForm }),
      });

      const data = (await response.json()) as ApiResult;
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "예외 스케줄을 저장하지 못했습니다.");
      }

      setMessage("예외 스케줄을 저장했습니다.");
      setScheduleForm(emptyScheduleForm);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "예외 스케줄을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer title="교관 스케줄 관리" description="교관별 매주 휴일, 요일별 가능 시간대, 점심시간 배정 불가 여부를 관리합니다.">
      <div className="grid gap-3 xl:grid-cols-5 md:grid-cols-2">
        <SummaryCard title="교관" value={`${activeInstructors.length}명`} tone="blue" />
        <SummaryCard title="주간 근무" value={`${weeklySummary.work}칸`} tone="blue" />
        <SummaryCard title="주간 휴일" value={`${weeklySummary.holiday}칸`} tone="slate" />
        <SummaryCard title="점심 불가" value={`${weeklySummary.lunchBlocked}칸`} tone="slate" />
        <SummaryCard title="주간 예약" value={`${weeklySummary.bookingCount}건`} tone="amber" />
      </div>

      <ContentCard className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-black text-[#10213f]">요일별 휴일·가능 시간 설정</h2>
            <p className="mt-1 text-[12px] font-bold text-[#6f8199]">
              교관마다 요일별 근무시간을 지정하고, 점심시간 배정 불가 여부를 체크합니다. 체크 시 12:00~13:00은 자동으로 비행 배정 불가 처리됩니다.
            </p>
          </div>
          <span className="ui-badge border-blue-200 bg-blue-50 text-blue-700">
            {selectedWeeklyInstructor ? getInstructorName(selectedWeeklyInstructor) : "교관 선택 필요"}
          </span>
        </div>

        <div className="grid gap-3">
          <label className="ui-label max-w-[420px]">
            <span>교관</span>
            <select
              value={weeklyInstructorId}
              onChange={(event) => selectWeeklyInstructor(event.target.value)}
              className="ui-input"
            >
              <option value="">교관 선택</option>
              {activeInstructors.map((row, index) => {
                const instructorId = text(row.instructorId);
                return (
                  <option key={`${instructorId}-${index}`} value={instructorId}>
                    {getInstructorName(row)} / {instructorId}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="grid gap-2 xl:grid-cols-7 md:grid-cols-2">
            {displayWeekdays.map((day) => {
              const item = weeklyConfig[day] || defaultDayConfig;
              const isHoliday = item.state === "휴일";
              return (
                <div
                  key={day}
                  className={`rounded-2xl border p-2.5 ${
                    isHoliday ? "border-slate-200 bg-slate-50" : "border-blue-100 bg-blue-50/40"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[16px] font-black text-[#10213f]">{day}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                      isHoliday
                        ? "border-slate-200 bg-white text-slate-600"
                        : "border-blue-200 bg-white text-blue-700"
                    }`}>
                      {item.state}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateDayConfig(day, { state: "근무" })}
                      className={`rounded-xl px-2 py-1.5 text-[12px] font-bold ${
                        !isHoliday ? "bg-[#1264f4] text-white" : "border border-blue-200 bg-white text-blue-700"
                      }`}
                    >
                      근무
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDayConfig(day, { state: "휴일" })}
                      className={`rounded-xl px-2 py-1.5 text-[12px] font-bold ${
                        isHoliday ? "bg-slate-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      휴일
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-bold text-[#536985]">
                      시작
                      <select
                        value={item.startTime}
                        disabled={isHoliday}
                        onChange={(event) => updateDayConfig(day, { startTime: event.target.value })}
                        className="mt-1 h-8 w-full rounded-lg border border-[#dbe5f1] bg-white px-2 text-[12px] font-bold text-[#243b63] disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {hourOptions.map((hour) => (
                          <option key={`${day}-start-${hour}`} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-bold text-[#536985]">
                      종료
                      <select
                        value={item.endTime}
                        disabled={isHoliday}
                        onChange={(event) => updateDayConfig(day, { endTime: event.target.value })}
                        className="mt-1 h-8 w-full rounded-lg border border-[#dbe5f1] bg-white px-2 text-[12px] font-bold text-[#243b63] disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {hourOptions.map((hour) => (
                          <option key={`${day}-end-${hour}`} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className={`mt-2 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${
                    item.lunchUnavailable && !isHoliday
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-[#dbe5f1] bg-white text-[#536985]"
                  }`}>
                    <input
                      type="checkbox"
                      checked={item.lunchUnavailable}
                      disabled={isHoliday}
                      onChange={(event) =>
                        updateDayConfig(day, {
                          lunchUnavailable: event.target.checked,
                          lunchStartTime: "12:00",
                          lunchEndTime: "13:00",
                        })
                      }
                    />
                    점심시간 불가
                  </label>

                  {item.lunchUnavailable && !isHoliday ? (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-white px-2 py-1.5 text-center text-[11px] font-bold text-amber-700">
                      12:00~13:00 비행 배정 불가
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveWeeklyConfig}
              disabled={saving || !weeklyInstructorId}
              className="ui-btn ui-btn-primary h-[38px] w-[220px] disabled:opacity-50"
            >
              설정 저장
            </button>
          </div>
        </div>
      </ContentCard>

      <ContentCard className="p-4">
        <div className="mb-3">
          <h2 className="text-[16px] font-black text-[#10213f]">날짜별 예외 스케줄</h2>
          <p className="mt-1 text-[12px] font-bold text-[#6f8199]">
            특정 날짜만 가능/부분가능/휴무/외부일정으로 지정합니다.
          </p>
        </div>

        <form onSubmit={saveSchedule} className="grid gap-3 xl:grid-cols-6 md:grid-cols-2">
          <label className="ui-label xl:col-span-2">
            <span>교관</span>
            <select
              value={scheduleForm.instructorId}
              onChange={(event) => selectScheduleInstructor(event.target.value)}
              className="ui-input"
            >
              <option value="">교관 선택</option>
              {activeInstructors.map((row, index) => {
                const instructorId = text(row.instructorId);
                return (
                  <option key={`${instructorId}-${index}`} value={instructorId}>
                    {getInstructorName(row)} / {instructorId}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="ui-label">
            <span>날짜</span>
            <input
              type="date"
              value={scheduleForm.scheduleDate}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, scheduleDate: event.target.value }))}
              className="ui-input"
            />
          </label>

          <label className="ui-label">
            <span>시작</span>
            <select
              value={scheduleForm.startTime}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, startTime: event.target.value }))}
              className="ui-input"
            >
              {hourOptions.map((hour) => (
                <option key={`exception-start-${hour}`} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            <span>종료</span>
            <select
              value={scheduleForm.endTime}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, endTime: event.target.value }))}
              className="ui-input"
            >
              {hourOptions.map((hour) => (
                <option key={`exception-end-${hour}`} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            <span>상태</span>
            <select
              value={scheduleForm.status}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, status: event.target.value }))}
              className="ui-input"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label xl:col-span-5">
            <span>메모</span>
            <input
              value={scheduleForm.memo}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, memo: event.target.value }))}
              className="ui-input"
              placeholder="예: 오후 외부일정"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="ui-btn ui-btn-outline h-[44px] w-full disabled:opacity-50"
            >
              예외 저장
            </button>
          </div>
        </form>
      </ContentCard>

      {message ? (
        <ContentCard className="border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-700">
          {message}
        </ContentCard>
      ) : null}

      {error ? (
        <ContentCard className="border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
          {error}
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-black text-[#10213f]">주간 교관 근무표</h2>
            <p className="mt-1 text-[12px] font-bold text-[#6f8199]">
              요일별 가능시간과 점심시간 불가 여부를 함께 표시합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={previousWeek} className="ui-btn ui-btn-outline h-[38px]">
              이전 주
            </button>
            <input
              type="date"
              value={baseDate}
              onChange={(event) => setBaseDate(event.target.value)}
              className="ui-input h-[38px] w-[160px]"
            />
            <button type="button" onClick={() => setBaseDate(ymd(new Date()))} className="ui-btn ui-btn-outline h-[38px]">
              이번 주
            </button>
            <button type="button" onClick={nextWeek} className="ui-btn ui-btn-outline h-[38px]">
              다음 주
            </button>
          </div>
        </div>

        <div className="overflow-x-auto px-5 pb-5">
          <table className="ui-table min-w-[1180px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead>
              <tr>
                <th className="w-[160px] py-2.5">교관</th>
                {weekDates.map((date) => (
                  <th key={date} className="py-2.5 text-center">
                    <div>{formatShortDate(date)}</div>
                    <div className="mt-0.5 text-[11px] font-bold text-[#7b8fa8]">{weekdayOf(date)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center text-[#6f8199]">
                    불러오는 중입니다.
                  </td>
                </tr>
              ) : null}

              {!loading && tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[#6f8199]">
                    표시할 교관이 없습니다.
                  </td>
                </tr>
              ) : null}

              {!loading &&
                tableRows.map((row) => (
                  <tr key={row.instructorId || row.name}>
                    <td className="py-2.5">
                      <div className="font-black text-[#10213f]">{row.name || "-"}</div>
                      <div className="mt-0.5 text-xs font-bold text-[#6f8199]">{row.instructorId || "-"}</div>
                      <div className="mt-1 text-[11px] font-bold text-[#9aa9bd]">
                        휴일: {row.holidayDays.length ? row.holidayDays.join(", ") : "없음"}
                      </div>
                    </td>

                    {row.cells.map((cell) => (
                      <td key={`${row.instructorId}-${cell.date}`} className="p-1.5 align-top">
                        <div className={`min-h-[64px] rounded-xl border px-2 py-1.5 ${dayCellClass(cell.status.tone)}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${dayBadgeClass(cell.status.tone)}`}>
                              {cell.status.label}
                            </span>
                            {cell.bookings.length > 0 ? (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#1264f4]">
                                {cell.bookings.length}건
                              </span>
                            ) : null}
                          </div>

                          <div className={`mt-1 truncate text-[11px] font-bold ${cell.status.config.lunchUnavailable && !cell.status.holiday ? "text-amber-700" : "text-[#64748b]"}`}>
                            {cell.status.sub}
                          </div>

                          {cell.status.config.lunchUnavailable && !cell.status.holiday ? (
                            <div className="mt-1 truncate text-[11px] font-bold text-amber-700">
                              점심불가 12:00~13:00
                            </div>
                          ) : null}

                          {cell.bookings.length > 0 ? (
                            <div className="mt-1 truncate text-[11px] font-bold text-[#314965]">
                              {getBookingTime(cell.bookings[0])} · {bookingTitle(cell.bookings[0])}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "blue" | "slate" | "amber";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-600",
  }[tone];

  return (
    <ContentCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </div>
        <div>
          <div className="text-[12px] font-black text-[#36506d]">{title}</div>
          <div className="mt-1 text-[22px] font-black leading-none text-[#10213f]">{value}</div>
        </div>
      </div>
    </ContentCard>
  );
}
