"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { useCurrentAuth } from "@/components/AuthContext";

type Row = Record<string, unknown>;

type InstructorForm = {
  instructorId: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  password: string;
  licenseNo: string;
  photoUrl: string;
  status: string;
  memo: string;
  active: string;
};

type ScheduleForm = {
  scheduleId: string;
  instructorId: string;
  instructorName: string;
  startTime: string;
  endTime: string;
  offDays: string[];
  lunchUnavailable: string;
  status: string;
  memo: string;
};

type MonthlyStats = {
  instructorId: string;
  educationCount: number;
  educationMinutes: number;
  experienceCount: number;
  experienceMinutes: number;
  rideCount: number;
  rideMinutes: number;
  rentalCount?: number;
  rentalMinutes?: number;
  otherCount: number;
  otherMinutes: number;
  totalCount: number;
  totalMinutes: number;
  studentCount: number;
  recentLogDate: string;
};

type MonthlyFlightDetail = {
  id: string;
  bookingId: string;
  instructorId: string;
  flightDate: string;
  startTime: string;
  endTime: string;
  flightType: string;
  targetName: string;
  aircraftName: string;
  courseName: string;
  content: string;
  actualMinutes: number;
  settlementMinutes: number;
  status: string;
};

const emptyInstructorForm: InstructorForm = {
  instructorId: "",
  userId: "",
  name: "",
  phone: "",
  email: "",
  password: "",
  licenseNo: "",
  photoUrl: "",
  status: "근무중",
  memo: "",
  active: "Y",
};

const emptyScheduleForm: ScheduleForm = {
  scheduleId: "",
  instructorId: "",
  instructorName: "",
  startTime: "07:00",
  endTime: "20:00",
  offDays: [],
  lunchUnavailable: "Y",
  status: "기본",
  memo: "",
};

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const SCHEDULE_HOURS = Array.from({ length: 18 }, (_, index) => `${String(index + 6).padStart(2, "0")}:00`);

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
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

function currentMonthText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function hours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function badgeClass(value: unknown) {
  const status = text(value).replace(/\s/g, "");
  if (["근무중", "활동", "활동중", "사용", "승인", "완료"].includes(status))
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["휴무", "외부일정", "대기"].includes(status))
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (["비활성", "퇴사", "중단"].includes(status))
    return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function defaultStats(instructorId: string): MonthlyStats {
  return {
    instructorId,
    educationCount: 0,
    educationMinutes: 0,
    experienceCount: 0,
    experienceMinutes: 0,
    rideCount: 0,
    rideMinutes: 0,
    rentalCount: 0,
    rentalMinutes: 0,
    otherCount: 0,
    otherMinutes: 0,
    totalCount: 0,
    totalMinutes: 0,
    studentCount: 0,
    recentLogDate: "",
  };
}

function stripWeeklyConfigMemo(value: unknown) {
  const raw = text(value);
  const marker = "WEEKLY_CONFIG:";
  if (!raw.includes(marker)) return raw;
  return raw.slice(0, raw.indexOf(marker)).trim();
}

function parseWeeklyScheduleText(value: unknown) {
  const raw = text(value);
  const result = {
    offDays: [] as string[],
    startTime: "07:00",
    endTime: "20:00",
    lunchUnavailable: "Y",
  };

  if (!raw) return result;

  if (!raw.startsWith("WEEKLY_CONFIG:")) {
    result.offDays = raw
      .split(/[,.\/\s]+/)
      .map((item) => item.trim())
      .filter((item) => WEEKDAYS.includes(item));
    return result;
  }

  try {
    const payload = JSON.parse(raw.replace(/^WEEKLY_CONFIG:/, ""));
    const weeklyOffDays = text(payload.weeklyOffDays);
    result.offDays = weeklyOffDays
      .split(/[,.\/\s]+/)
      .map((item) => item.trim())
      .filter((item) => WEEKDAYS.includes(item));

    const timesRaw = payload.weeklyAvailableTimes;
    const weeklyTimes =
      typeof timesRaw === "string"
        ? JSON.parse(timesRaw || "{}")
        : timesRaw || {};
    const firstWorkDay =
      WEEKDAYS.map((day) => weeklyTimes?.[day]).find(
        (item) => item && text(item.state) !== "휴일",
      ) || WEEKDAYS.map((day) => weeklyTimes?.[day]).find(Boolean);

    if (firstWorkDay) {
      result.startTime = text(firstWorkDay.startTime, result.startTime).slice(
        0,
        5,
      );
      result.endTime = text(firstWorkDay.endTime, result.endTime).slice(0, 5);
      result.lunchUnavailable = firstWorkDay.lunchUnavailable ? "Y" : "N";
    }
  } catch {
    result.offDays = [];
  }

  return result;
}

function scheduleSummary(schedule?: Row) {
  const parsed = parseWeeklyScheduleText(
    schedule?.dayOfWeek || schedule?.day_of_week || schedule?.memo,
  );
  const startTime = text(
    schedule?.startTime || schedule?.start_time,
    parsed.startTime,
  ).slice(0, 5);
  const endTime = text(
    schedule?.endTime || schedule?.end_time,
    parsed.endTime,
  ).slice(0, 5);
  const offDays =
    parsed.offDays.length > 0 ? parsed.offDays.join(",") : "휴무 없음";
  return { startTime, endTime, offDays };
}

function scheduleFromRow(instructor: Row, schedule?: Row): ScheduleForm {
  const parsed = parseWeeklyScheduleText(
    schedule?.dayOfWeek || schedule?.day_of_week || schedule?.memo,
  );

  return {
    scheduleId: text(schedule?.scheduleId || schedule?.schedule_id),
    instructorId: text(instructor.instructorId || instructor.instructor_id),
    instructorName: text(instructor.name),
    startTime: text(
      schedule?.startTime || schedule?.start_time,
      parsed.startTime,
    ).slice(0, 5),
    endTime: text(
      schedule?.endTime || schedule?.end_time,
      parsed.endTime,
    ).slice(0, 5),
    offDays: parsed.offDays,
    lunchUnavailable: text(
      schedule?.lunchUnavailable || schedule?.lunch_unavailable,
      parsed.lunchUnavailable,
    ),
    status: text(schedule?.status, "기본"),
    memo: stripWeeklyConfigMemo(schedule?.memo),
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function InstructorsPage() {
  const currentAuth = useCurrentAuth();
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<
    Record<string, MonthlyStats>
  >({});
  const [monthlyFlightDetails, setMonthlyFlightDetails] = useState<
    Record<string, MonthlyFlightDetail[]>
  >({});
  const [form, setForm] = useState<InstructorForm>(emptyInstructorForm);
  const [scheduleForm, setScheduleForm] =
    useState<ScheduleForm>(emptyScheduleForm);
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("전체");
  const [settlementMonth, setSettlementMonth] = useState(currentMonthText());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [drawerMode, setDrawerMode] = useState<"none" | "instructorCreate" | "instructorEdit" | "schedule">("none");

  const isEdit = drawerMode === "instructorEdit" || Boolean(form.instructorId);

  async function load() {
    setLoading(true);
    const data = await fetchJson(
      `/api/instructors?month=${encodeURIComponent(settlementMonth)}`,
    );
    const rows = Array.isArray(data.instructors) ? data.instructors : [];
    setInstructors(rows);
    setSchedules(
      Array.isArray(data.instructorSchedules) ? data.instructorSchedules : [],
    );
    setMonthlyStats((data.monthlyStats || {}) as Record<string, MonthlyStats>);
    setMonthlyFlightDetails((data.monthlyFlightDetails || {}) as Record<string, MonthlyFlightDetail[]>);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [settlementMonth]);

  const selectedInstructor = useMemo(
    () =>
      instructors.find(
        (row) => text(row.instructorId || row.instructor_id) === selectedId,
      ) || null,
    [instructors, selectedId],
  );

  const selectedFlightDetails = useMemo(
    () => monthlyFlightDetails[selectedId] || [],
    [monthlyFlightDetails, selectedId],
  );

  const latestScheduleByInstructor = useMemo(() => {
    const map: Record<string, Row> = {};
    schedules.forEach((row) => {
      const instructorId = text(row.instructorId || row.instructor_id);
      if (!instructorId || map[instructorId]) return;
      map[instructorId] = row;
    });
    return map;
  }, [schedules]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return instructors.filter((row) => {
      if (status !== "전체" && text(row.status) !== status) return false;
      if (!q) return true;
      return [
        row.instructorId,
        row.name,
        row.phone,
        row.email,
        row.licenseNo,
        row.license_no,
        row.status,
      ]
        .map((value) => text(value).toLowerCase())
        .join(" ")
        .includes(q);
    });
  }, [instructors, keyword, status]);

  const statuses = useMemo(
    () => [
      "전체",
      ...Array.from(
        new Set(instructors.map((row) => text(row.status)).filter(Boolean)),
      ),
    ],
    [instructors],
  );

  function openInstructorCreate() {
    setForm(emptyInstructorForm);
    setScheduleForm(emptyScheduleForm);
    setDrawerMode("instructorCreate");
  }

  function openInstructorEdit(row: Row) {
    selectInstructor(row);
    setDrawerMode("instructorEdit");
  }

  function selectInstructor(row: Row) {
    const instructorId = text(row.instructorId || row.instructor_id);
    setSelectedId(instructorId);
    setForm({
      instructorId,
      userId: text(row.userId || row.user_id),
      name: text(row.name),
      phone: formatPhone(row.phone),
      email: text(row.email),
      password: "",
      licenseNo: text(row.licenseNo || row.license_no),
      photoUrl: text(row.photoUrl || row.photo_url),
      status: text(row.status, "근무중"),
      memo: text(row.memo),
      active: isActive(row.active) ? "Y" : "N",
    });
    setScheduleForm(
      scheduleFromRow(row, latestScheduleByInstructor[instructorId]),
    );
  }

  async function submitInstructor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      alert("교관명을 입력하세요.");
      return;
    }
    if (!form.email.trim()) {
      alert("교관 로그인 계정 생성을 위해 이메일을 입력하세요.");
      return;
    }
    if (drawerMode === "instructorCreate" && form.password.trim().length < 6) {
      alert("신규 교관은 6자 이상의 임시 비밀번호가 필요합니다.");
      return;
    }
    setSaving(true);
    try {
      const action = drawerMode === "instructorEdit" ? "updateInstructor" : "addInstructor";
      const response = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: form }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false)
        throw new Error(result.message || "저장에 실패했습니다.");
      setForm(emptyInstructorForm);
      setScheduleForm(emptyScheduleForm);
      setSelectedId("");
      setDrawerMode("none");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    if (!scheduleForm.instructorId) {
      alert("스케줄을 저장할 교관을 먼저 선택하세요.");
      return;
    }
    setSaving(true);
    try {
      const action = scheduleForm.scheduleId
        ? "updateInstructorSchedule"
        : "addInstructorSchedule";
      const response = await fetch("/api/instructor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data: {
            scheduleId: scheduleForm.scheduleId || `WEEKLY-${scheduleForm.instructorId}`,
            instructorId: scheduleForm.instructorId,
            instructorName: scheduleForm.instructorName,
            scheduleDate: null,
            dayOfWeek: scheduleForm.offDays.join(","),
            startTime: scheduleForm.startTime,
            endTime: scheduleForm.endTime,
            isDayOff: scheduleForm.offDays.length > 0 ? "Y" : "N",
            lunchUnavailable: scheduleForm.lunchUnavailable,
            status: scheduleForm.status || "기본",
            memo: stripWeeklyConfigMemo(scheduleForm.memo),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false)
        throw new Error(result.message || "스케줄 저장에 실패했습니다.");
      const saved = (result.data || result.instructorSchedules || {}) as Row;
      const savedScheduleId = text(
        saved.scheduleId || saved.schedule_id || scheduleForm.scheduleId,
      );
      if (savedScheduleId)
        setScheduleForm((current) => ({
          ...current,
          scheduleId: savedScheduleId,
        }));
      await load();
      setDrawerMode("none");
      alert("스케줄을 저장했습니다.");
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "스케줄 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row: Row) {
    if (!confirm(`${text(row.name, "선택한 교관")} 교관을 비활성화할까요?`))
      return;
    await fetch("/api/instructors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateInstructor",
        data: { ...row, active: "N", status: "비활성" },
      }),
    });
    await load();
  }

  function openDeleteInstructor(row?: Row) {
    const targetId = text(row?.instructorId || row?.instructor_id || form.instructorId);
    if (!targetId) {
      alert("삭제할 교관 ID를 찾지 못했습니다.");
      return;
    }

    setDeleteTarget(row || (form as unknown as Row));
    setDeletePassword("");
  }

  async function confirmDeleteInstructor() {
    const target = deleteTarget;
    const instructorId = text(target?.instructorId || target?.instructor_id || form.instructorId);
    const instructorName = text(target?.name || form.name, "선택한 교관");
    const adminEmail = text(currentAuth.profile?.email);

    if (!instructorId) {
      alert("삭제할 교관 ID를 찾지 못했습니다.");
      return;
    }

    if (!adminEmail) {
      alert("현재 로그인한 관리자 이메일을 확인하지 못했습니다. 다시 로그인한 뒤 시도하세요.");
      return;
    }

    if (!deletePassword.trim()) {
      alert("관리자 비밀번호를 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteInstructor",
          data: {
            instructorId,
            adminEmail,
            confirmPassword: deletePassword,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "교관 삭제에 실패했습니다.");
      }

      setDeleteTarget(null);
      setDeletePassword("");
      setDrawerMode("none");
      if (selectedId === instructorId) {
        setSelectedId("");
        setForm(emptyInstructorForm);
        setScheduleForm(emptyScheduleForm);
      }
      await load();
      alert(`${instructorName} 교관을 삭제했습니다.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "교관 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File | null) {
    if (!form.instructorId) {
      alert("사진을 업로드할 교관을 먼저 선택하거나 교관 정보를 저장하세요.");
      return;
    }
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      alert("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("사진은 5MB 이하만 업로드할 수 있습니다.");
      return;
    }

    const payload = new FormData();
    payload.append("instructorId", form.instructorId);
    payload.append("file", file);

    setPhotoUploading(true);
    try {
      const response = await fetch("/api/instructors/photo", {
        method: "POST",
        body: payload,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "사진 업로드에 실패했습니다.");
      }
      const photoUrl = text(result.photoUrl || result.photo_url);
      setForm((current) => ({ ...current, photoUrl }));
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "사진 업로드에 실패했습니다.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePhoto() {
    if (!form.instructorId) return;
    if (!confirm("교관 사진을 제거할까요?")) return;
    setPhotoUploading(true);
    try {
      const response = await fetch("/api/instructors/photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructorId: form.instructorId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "사진 제거에 실패했습니다.");
      }
      setForm((current) => ({ ...current, photoUrl: "" }));
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "사진 제거에 실패했습니다.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function resetForms() {
    setForm(emptyInstructorForm);
    setScheduleForm(emptyScheduleForm);
    setSelectedId("");
  }

  function toggleOffDay(day: string) {
    const exists = scheduleForm.offDays.includes(day);
    setScheduleForm({
      ...scheduleForm,
      offDays: exists
        ? scheduleForm.offDays.filter((item) => item !== day)
        : [...scheduleForm.offDays, day],
    });
  }

  return (
    <PageContainer
      title="교관관리"
      description="정산 기준 실적과 교관별 월간 비행 상세 내역을 중심으로 관리합니다."
    >
      <ContentCard className="p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_150px]">
          <input
            className="ui-input"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="교관명, 연락처, 이메일, 면장번호 검색"
          />
          <select
            className="ui-input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "전체" ? "상태 전체" : item}
              </option>
            ))}
          </select>
          <input
            className="ui-input"
            type="month"
            value={settlementMonth}
            onChange={(event) =>
              setSettlementMonth(event.target.value || currentMonthText())
            }
          />
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={openInstructorCreate}
          >
            + 교관 등록
          </button>
        </div>
      </ContentCard>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <ContentCard className="overflow-hidden p-0">
          <div className="border-b border-blue-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#10213f]">
                  교관 목록
                </h2>
                <p className="mt-1 text-[12px] font-medium text-[#6f8199]">
                  교관을 선택하면 월간 정산 상세가 표시됩니다.
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-4">
            {loading ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-[14px] text-[#6f8199]">
                불러오는 중입니다.
              </p>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-[14px] text-[#6f8199]">
                표시할 교관이 없습니다.
              </p>
            ) : null}

            <div className="space-y-3">
              {filtered.map((row, index) => {
                const instructorId = text(
                  row.instructorId || row.instructor_id,
                );
                const stats =
                  monthlyStats[instructorId] || defaultStats(instructorId);
                const schedule = latestScheduleByInstructor[instructorId];
                const scheduleInfo = scheduleSummary(schedule);
                const selected = instructorId === selectedId;

                return (
                  <div
                    key={instructorId || index}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectInstructor(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") selectInstructor(row);
                    }}
                    className={`w-full cursor-pointer rounded-3xl border p-3.5 text-left transition ${
                      selected
                        ? "border-blue-300 bg-blue-50 shadow-[0_18px_34px_rgba(37,99,235,0.12)]"
                        : "border-[#dbe5f1] bg-white hover:border-blue-200 hover:bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <InstructorAvatar
                          name={text(row.name, "?")}
                          photoUrl={text(row.photoUrl || row.photo_url)}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold leading-tight text-[#10213f]">
                            {text(row.name, "-")}
                          </p>
                          <p className="mt-1 truncate text-[12px] font-medium leading-none text-[#6f8199]">
                            {text(row.phone, "연락처 없음")}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-medium ${badgeClass(row.status)}`}
                      >
                        {text(row.status, "-")}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Metric
                        label="정산시간"
                        value={hours(numberValue(stats.totalMinutes))}
                      />
                      <Metric
                        label="비행횟수"
                        value={`${numberValue(stats.totalCount)}회`}
                      />
                      <Metric
                        label="체험비행"
                        value={`${numberValue(stats.experienceCount)}회 · ${hours(numberValue(stats.experienceMinutes))}`}
                      />
                      <Metric
                        label="교육/동승"
                        value={`${numberValue(stats.educationCount) + numberValue(stats.rideCount)}회 · ${hours(numberValue(stats.educationMinutes) + numberValue(stats.rideMinutes))}`}
                      />
                    </div>

                    <div className="mt-2.5 rounded-2xl bg-slate-50/80 px-3 py-2 text-[12px] font-medium leading-none text-[#6f8199]">
                      가능 {scheduleInfo.startTime}~{scheduleInfo.endTime} ·
                      휴무 {scheduleInfo.offDays}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ContentCard>

        <ContentCard className="min-h-[760px] p-5">
          {selectedInstructor ? (
            <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 pb-5">
                <div className="flex min-w-0 items-center gap-3">
                  <InstructorAvatar
                    name={text(selectedInstructor.name, "?")}
                    photoUrl={text(selectedInstructor.photoUrl || selectedInstructor.photo_url)}
                    size="sm"
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-blue-600">
                      {settlementMonth} 정산 기준
                    </p>
                    <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-[#10213f]">
                      {text(selectedInstructor.name, "-")} 교관 정산 상세
                    </h2>
                    <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                      예약이 아니라 저장된 비행기록 기준입니다. 체험비행은 코스명까지 표시합니다.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline"
                    onClick={() => selectedInstructor && openInstructorEdit(selectedInstructor)}
                  >
                    정보수정
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline"
                    onClick={() => setDrawerMode("schedule")}
                  >
                    스케줄
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-[14px] font-semibold text-rose-700 hover:bg-rose-50"
                    onClick={() => selectedInstructor && openDeleteInstructor(selectedInstructor)}
                    disabled={saving}
                  >
                    삭제
                  </button>
                </div>
              </div>

              <SettlementStats
                stats={monthlyStats[selectedId] || defaultStats(selectedId)}
                details={selectedFlightDetails}
              />
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-[#cbd8e8] bg-slate-50 p-8 text-center">
              <div>
                <p className="text-[18px] font-semibold text-[#10213f]">
                  교관을 선택하세요
                </p>
                <p className="mt-2 text-[14px] font-medium text-[#6f8199]">
                  왼쪽 교관 목록에서 교관을 선택하면 월간 정산 요약과 전체 비행 상세 내역이 표시됩니다.
                </p>
              </div>
            </div>
          )}
        </ContentCard>
      </div>

      {drawerMode !== "none" ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]">
          <div className="h-full w-full max-w-[620px] overflow-y-auto bg-white shadow-[-24px_0_70px_rgba(15,23,42,0.22)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
              <div>
                <p className="text-[12px] font-semibold tracking-[0.14em] text-blue-500">
                  INSTRUCTOR
                </p>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[#10213f]">
                  {drawerMode === "schedule"
                    ? `${scheduleForm.instructorName || form.name || "교관"} 근무/휴무 스케줄`
                    : drawerMode === "instructorEdit"
                      ? "교관 정보 수정"
                      : "교관 신규 등록"}
                </h3>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-[14px] font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setDrawerMode("none")}
              >
                닫기
              </button>
            </div>

            {drawerMode === "instructorCreate" || drawerMode === "instructorEdit" ? (
              <form onSubmit={submitInstructor} className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="rounded-3xl border border-[#dbe5f1] bg-slate-50/70 p-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-4">
                    <InstructorAvatar
                      name={form.name || "?"}
                      photoUrl={form.photoUrl}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[#10213f]">프로필 사진</p>
                      <p className="mt-1 text-[12px] font-medium text-[#6f8199]">
                        신규 등록 시 로그인 계정과 교관 정보가 함께 생성됩니다. 사진은 저장 후 업로드하세요.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <label className={`ui-btn ui-btn-outline cursor-pointer ${!form.instructorId || photoUploading ? "pointer-events-none opacity-50" : ""}`}>
                          {photoUploading ? "업로드 중" : "사진 선택"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={!form.instructorId || photoUploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              void uploadPhoto(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {form.photoUrl ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-outline"
                            onClick={() => void removePhoto()}
                            disabled={photoUploading}
                          >
                            사진 제거
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <Field label="교관명" required>
                  <input
                    className="ui-input"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder="예: 한기준"
                  />
                </Field>
                <Field label="연락처">
                  <input
                    className="ui-input"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                    placeholder="01000000000"
                  />
                </Field>
                <Field label="이메일" required>
                  <input
                    className="ui-input"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    placeholder="email@example.com"
                  />
                </Field>
                {drawerMode === "instructorCreate" ? (
                  <Field label="임시 비밀번호" required>
                    <input
                      className="ui-input"
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        setForm({ ...form, password: event.target.value })
                      }
                      placeholder="6자 이상"
                    />
                  </Field>
                ) : null}
                {drawerMode === "instructorEdit" ? (
                  <Field label="연결 회원 ID">
                    <input
                      className="ui-input bg-slate-50 text-slate-500"
                      value={form.userId || "연결 정보 없음"}
                      readOnly
                    />
                  </Field>
                ) : null}
                <Field label="면장번호">
                  <input
                    className="ui-input"
                    value={form.licenseNo}
                    onChange={(event) =>
                      setForm({ ...form, licenseNo: event.target.value })
                    }
                    placeholder="면장번호"
                  />
                </Field>
                <Field label="상태">
                  <select
                    className="ui-input"
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
                    }
                  >
                    <option>근무중</option>
                    <option>휴무</option>
                    <option>외부일정</option>
                    <option>비활성</option>
                  </select>
                </Field>
                <Field label="사용 여부">
                  <select
                    className="ui-input"
                    value={form.active}
                    onChange={(event) =>
                      setForm({ ...form, active: event.target.value })
                    }
                  >
                    <option value="Y">사용</option>
                    <option value="N">비활성</option>
                  </select>
                </Field>
                <Field label="메모" className="sm:col-span-2">
                  <input
                    className="ui-input"
                    value={form.memo}
                    onChange={(event) =>
                      setForm({ ...form, memo: event.target.value })
                    }
                    placeholder="교관 관련 메모"
                  />
                </Field>
                <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:col-span-2">
                  <button className="ui-btn ui-btn-primary" disabled={saving}>
                    {saving ? "저장 중" : drawerMode === "instructorEdit" ? "수정 저장" : "계정 생성 + 교관 등록"}
                  </button>
                  {drawerMode === "instructorEdit" ? (
                    <>
                      <button
                        type="button"
                        className="ui-btn ui-btn-danger"
                        onClick={() =>
                          selectedInstructor ? void deactivate(selectedInstructor) : void deactivate(form as unknown as Row)
                        }
                      >
                        비활성화
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-[14px] font-semibold text-rose-700 hover:bg-rose-100"
                        onClick={() => openDeleteInstructor(selectedInstructor || (form as unknown as Row))}
                        disabled={saving}
                      >
                        교관 삭제
                      </button>
                    </>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <Field label="기본 가능 시작시간">
                  <select
                    className="ui-input"
                    value={scheduleForm.startTime}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        startTime: event.target.value,
                      })
                    }
                  >
                    {SCHEDULE_HOURS.map((item) => (
                      <option key={item} value={item}>
                        {Number(item.slice(0, 2))}시
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="기본 가능 종료시간">
                  <select
                    className="ui-input"
                    value={scheduleForm.endTime}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        endTime: event.target.value,
                      })
                    }
                  >
                    {SCHEDULE_HOURS.map((item) => (
                      <option key={item} value={item}>
                        {Number(item.slice(0, 2))}시
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="점심시간 교육">
                  <select
                    className="ui-input"
                    value={scheduleForm.lunchUnavailable}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        lunchUnavailable: event.target.value,
                      })
                    }
                  >
                    <option value="Y">불가</option>
                    <option value="N">가능</option>
                  </select>
                </Field>
                <Field label="스케줄 상태">
                  <select
                    className="ui-input"
                    value={scheduleForm.status}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        status: event.target.value,
                      })
                    }
                  >
                    <option>기본</option>
                    <option>임시변경</option>
                    <option>휴무</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <p className="mb-2 text-[13px] font-semibold text-[#243b63]">
                    반복 휴무요일
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const checked = scheduleForm.offDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleOffDay(day)}
                          className={`rounded-2xl border px-4 py-2 text-[13px] font-semibold transition ${checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-[#dbe5f1] bg-white text-[#5d7089] hover:border-blue-200"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Field label="스케줄 메모" className="sm:col-span-2">
                  <textarea
                    className="ui-input min-h-[110px] resize-none"
                    value={scheduleForm.memo}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        memo: event.target.value,
                      })
                    }
                    placeholder="예: 주말 오전만 가능, 특정 기간 외부일정 등"
                  />
                </Field>
                <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:col-span-2">
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={() => void saveSchedule()}
                    disabled={saving || !scheduleForm.instructorId}
                  >
                    {saving ? "저장 중" : "스케줄 저장"}
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline"
                    onClick={() => setDrawerMode("none")}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className="mb-5">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-rose-500">
                DELETE INSTRUCTOR
              </p>
              <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[#10213f]">
                교관 삭제 확인
              </h3>
              <p className="mt-2 text-[13px] font-medium leading-6 text-[#6f8199]">
                {text(deleteTarget.name || form.name, "선택한 교관")} 교관을 목록에서 삭제합니다.
                기존 비행기록과 정산 내역은 유지됩니다.
              </p>
            </div>

            <label className="ui-label">
              <span>관리자 비밀번호</span>
              <input
                className="ui-input"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void confirmDeleteInstructor();
                }}
                autoFocus
                placeholder="현재 로그인한 관리자 비밀번호"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeletePassword("");
                }}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-2xl bg-rose-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                onClick={() => void confirmDeleteInstructor()}
                disabled={saving}
              >
                {saving ? "삭제 중" : "비밀번호 확인 후 삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </PageContainer>
  );
}

function InstructorAvatar({
  name,
  photoUrl,
  size = "sm",
}: {
  name: string;
  photoUrl?: string;
  size?: "sm" | "lg";
}) {
  const dimension = size === "lg" ? "h-20 w-20 rounded-3xl" : "h-9 w-9 rounded-2xl";
  const textSize = size === "lg" ? "text-[26px]" : "text-[15px]";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${name} 교관 사진`}
        className={`${dimension} shrink-0 object-cover ring-1 ring-blue-100`}
      />
    );
  }
  return (
    <div
      className={`${dimension} ${textSize} flex shrink-0 items-center justify-center bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-100`}
    >
      {text(name, "?").slice(0, 1)}
    </div>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`ui-label ${className}`}>
      <span>
        {label}
        {required ? <em className="ml-1 not-italic text-rose-500">*</em> : null}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 px-3 py-2">
      <p className="text-[12px] font-medium leading-none text-[#6f8199]">{label}</p>
      <p className="mt-1.5 text-[13px] font-semibold leading-none text-[#10213f]">{value}</p>
    </div>
  );
}

function SettlementStats({
  stats,
  details,
}: {
  stats: MonthlyStats;
  details: MonthlyFlightDetail[];
}) {
  const rows = [
    {
      label: "합계",
      count: stats.totalCount,
      minutes: stats.totalMinutes,
      tone: "bg-blue-50 text-blue-700",
      subText: `교육생 ${stats.studentCount}명 · 최근 ${stats.recentLogDate || "-"}`,
    },
    {
      label: "교육비행",
      count: stats.educationCount,
      minutes: stats.educationMinutes,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "체험비행",
      count: stats.experienceCount,
      minutes: stats.experienceMinutes,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "동승비행",
      count: stats.rideCount,
      minutes: stats.rideMinutes,
      tone: "bg-violet-50 text-violet-700",
    },
    {
      label: "렌탈비행",
      count: stats.rentalCount || 0,
      minutes: stats.rentalMinutes || 0,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "기타",
      count: stats.otherCount,
      minutes: stats.otherMinutes,
      tone: "bg-slate-100 text-slate-600",
    },
  ];

  const [detailTypeFilter, setDetailTypeFilter] = useState("전체");
  const [detailKeyword, setDetailKeyword] = useState("");

  const detailTypeOptions = useMemo(
    () => [
      "전체",
      ...Array.from(
        new Set(details.map((item) => text(item.flightType)).filter(Boolean)),
      ),
    ],
    [details],
  );

  const filteredDetails = useMemo(() => {
    const query = detailKeyword.trim().toLowerCase();

    return details.filter((item) => {
      const matchesType = detailTypeFilter === "전체" || item.flightType === detailTypeFilter;
      const matchesKeyword =
        !query ||
        [
          item.flightDate,
          item.startTime,
          item.endTime,
          item.flightType,
          item.targetName,
          item.aircraftName,
          item.courseName,
          item.content,
          item.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesType && matchesKeyword;
    });
  }, [detailKeyword, detailTypeFilter, details]);

  const filteredSummary = useMemo(
    () =>
      filteredDetails.reduce(
        (result, item) => {
          result.count += 1;
          result.actualMinutes += item.actualMinutes || 0;
          result.settlementMinutes += item.settlementMinutes || 0;
          return result;
        },
        { count: 0, actualMinutes: 0, settlementMinutes: 0 },
      ),
    [filteredDetails],
  );

  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-6 overflow-hidden rounded-3xl border border-[#dbe5f1] bg-white">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`min-w-0 px-4 py-3 ${index > 0 ? "border-l border-[#e5edf7]" : ""}`}
          >
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${row.tone}`}
            >
              {row.label}
            </span>
            <p className="mt-2 whitespace-nowrap text-[14px] font-semibold text-[#10213f]">
              {row.count}회 · {hours(row.minutes)}
            </p>
            {"subText" in row && row.subText ? (
              <p className="mt-1 truncate text-[11px] font-medium text-[#6f8199]">
                {row.subText}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-[#dbe5f1] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold text-[#10213f]">
              월간 비행 상세 내역
            </h4>
            <p className="mt-1 text-[12px] font-medium text-[#6f8199]">
              교관이 수행한 모든 비행기록 기준입니다. 체험비행은 코스명으로 필터/검색할 수 있습니다.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-[#39516f]">
            {filteredDetails.length} / {details.length}건
          </span>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[150px_1fr_260px]">
          <select
            value={detailTypeFilter}
            onChange={(event) => setDetailTypeFilter(event.target.value)}
            className="h-10 rounded-2xl border border-[#dbe5f1] bg-white px-3 text-[13px] font-medium text-[#10213f] outline-none focus:border-blue-300"
          >
            {detailTypeOptions.map((item) => (
              <option key={item} value={item}>
                {item === "전체" ? "전체 구분" : item}
              </option>
            ))}
          </select>

          <input
            value={detailKeyword}
            onChange={(event) => setDetailKeyword(event.target.value)}
            placeholder="대상자, 항공기, 체험코스, 내용 검색"
            className="h-10 rounded-2xl border border-[#dbe5f1] bg-white px-3 text-[13px] font-medium text-[#10213f] outline-none placeholder:text-[#9aa8bb] focus:border-blue-300"
          />

          <div className="flex h-10 items-center justify-end rounded-2xl bg-slate-50 px-3 text-[12px] font-semibold text-[#39516f]">
            표시 {filteredSummary.count}건 · 실비행 {hours(filteredSummary.actualMinutes)} · 정산 {hours(filteredSummary.settlementMinutes)}
          </div>
        </div>

        <div className="mt-3 max-h-[520px] overflow-auto rounded-2xl border border-slate-100">
          <table className="min-w-[860px] w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-slate-50 text-[12px] font-semibold text-[#6f8199]">
              <tr>
                <th className="px-3 py-2.5">일자</th>
                <th className="px-3 py-2.5">시간</th>
                <th className="px-3 py-2.5">구분</th>
                <th className="px-3 py-2.5">대상</th>
                <th className="px-3 py-2.5">항공기</th>
                <th className="px-3 py-2.5">체험코스/내용</th>
                <th className="px-3 py-2.5 text-right">실비행</th>
                <th className="px-3 py-2.5 text-right">정산</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDetails.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[13px] text-[#6f8199]">
                    조건에 맞는 비행기록이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredDetails.map((item) => (
                  <tr key={item.id || `${item.flightDate}-${item.startTime}-${item.flightType}`} className="align-top hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[#10213f]">
                      {item.flightDate || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#39516f]">
                      {item.startTime || "-"}~{item.endTime || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${flightTypeTone(item.flightType)}`}>
                        {item.flightType || "기타"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#39516f]">
                      {item.targetName || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#39516f]">
                      {item.aircraftName || "-"}
                    </td>
                    <td className="min-w-[220px] px-3 py-2.5">
                      {item.flightType === "체험비행" ? (
                        <p className="font-semibold text-emerald-700">{item.courseName || item.content || "-"}</p>
                      ) : (
                        <p className="font-medium text-[#10213f]">{item.content || item.courseName || "-"}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#39516f]">
                      {hours(item.actualMinutes || 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#10213f]">
                      {hours(item.settlementMinutes || 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function flightTypeTone(type: string) {
  if (type === "교육비행") return "bg-blue-50 text-blue-700";
  if (type === "체험비행") return "bg-emerald-50 text-emerald-700";
  if (type === "동승비행") return "bg-violet-50 text-violet-700";
  if (type === "렌탈비행") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

