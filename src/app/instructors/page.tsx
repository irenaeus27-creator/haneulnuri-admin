"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";

type Row = Record<string, unknown>;

type InstructorForm = {
  instructorId: string;
  name: string;
  phone: string;
  email: string;
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
  otherCount: number;
  otherMinutes: number;
  totalCount: number;
  totalMinutes: number;
  studentCount: number;
  recentLogDate: string;
};

const emptyInstructorForm: InstructorForm = {
  instructorId: "",
  name: "",
  phone: "",
  email: "",
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
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<
    Record<string, MonthlyStats>
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

  const isEdit = Boolean(form.instructorId);

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

  function selectInstructor(row: Row) {
    const instructorId = text(row.instructorId || row.instructor_id);
    setSelectedId(instructorId);
    setForm({
      instructorId,
      name: text(row.name),
      phone: text(row.phone),
      email: text(row.email),
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
    setSaving(true);
    try {
      const action = isEdit ? "updateInstructor" : "addInstructor";
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
      description="교관 기본정보, 근무 스케줄, 월말 정산 기준 실적을 한 화면에서 관리합니다."
    >
      <ContentCard className="p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px]">
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
        </div>
      </ContentCard>

      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
        <ContentCard className="overflow-hidden p-0">
          <div className="border-b border-blue-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold text-[#10213f]">
                  교관 목록
                </h2>
                <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                  정산은 비행기록에 저장된 실제 기록만 기준으로 계산합니다.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold text-blue-700">
                {filtered.length}명
              </span>
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto p-4">
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
                  <button
                    key={instructorId || index}
                    type="button"
                    onClick={() => selectInstructor(row)}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      selected
                        ? "border-blue-400 bg-blue-50/80 shadow-[0_16px_36px_rgba(37,99,235,0.12)]"
                        : "border-[#dbe5f1] bg-white hover:border-blue-200 hover:bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <InstructorAvatar
                            name={text(row.name, "?")}
                            photoUrl={text(row.photoUrl || row.photo_url)}
                            size="sm"
                          />
                          <div>
                            <p className="text-[16px] font-semibold text-[#10213f]">
                              {text(row.name, "-")}
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-[#6f8199]">
                              {text(row.phone, "연락처 없음")}
                            </p>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${badgeClass(row.status)}`}
                      >
                        {text(row.status, "-")}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
                      <Metric
                        label="정산시간"
                        value={hours(numberValue(stats.totalMinutes))}
                      />
                      <Metric
                        label="비행횟수"
                        value={`${numberValue(stats.totalCount)}회`}
                      />
                      <Metric
                        label="교육"
                        value={`${numberValue(stats.educationCount)}회 · ${hours(numberValue(stats.educationMinutes))}`}
                      />
                      <Metric
                        label="체험/동승"
                        value={`${numberValue(stats.experienceCount) + numberValue(stats.rideCount)}회 · ${hours(numberValue(stats.experienceMinutes) + numberValue(stats.rideMinutes))}`}
                      />
                    </div>

                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[12px] font-medium text-[#6f8199]">
                      가능 {scheduleInfo.startTime}~{scheduleInfo.endTime} ·
                      휴무 {scheduleInfo.offDays}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </ContentCard>

        <div className="space-y-4">
          <ContentCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold text-[#10213f]">
                  {isEdit ? "교관 상세 수정" : "교관 신규 등록"}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                  기본정보와 근무 스케줄을 같은 화면에서 관리합니다.
                </p>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn-outline"
                onClick={resetForms}
              >
                초기화
              </button>
            </div>

            <form
              onSubmit={submitInstructor}
              className="mt-5 grid gap-4 xl:grid-cols-4"
            >
              <div className="rounded-3xl border border-[#dbe5f1] bg-slate-50/70 p-4 xl:col-span-4">
                <div className="flex flex-wrap items-center gap-4">
                  <InstructorAvatar
                    name={form.name || "?"}
                    photoUrl={form.photoUrl}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[#10213f]">프로필 사진</p>
                    <p className="mt-1 text-[12px] font-medium text-[#6f8199]">
                      교관 정보를 먼저 저장한 뒤 JPG, PNG, WEBP 파일을 업로드하세요. 사진은 교관 카드에 바로 표시됩니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                  placeholder="010-0000-0000"
                />
              </Field>
              <Field label="이메일">
                <input
                  className="ui-input"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="email@example.com"
                />
              </Field>
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
              <Field label="메모" className="xl:col-span-2">
                <input
                  className="ui-input"
                  value={form.memo}
                  onChange={(event) =>
                    setForm({ ...form, memo: event.target.value })
                  }
                  placeholder="교관 관련 메모"
                />
              </Field>
              <div className="flex flex-wrap gap-2 xl:col-span-4">
                <button className="ui-btn ui-btn-primary" disabled={saving}>
                  {saving ? "저장 중" : isEdit ? "수정 저장" : "교관 등록"}
                </button>
                {isEdit ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn-danger"
                    onClick={() =>
                      selectedInstructor && void deactivate(selectedInstructor)
                    }
                  >
                    비활성화
                  </button>
                ) : null}
              </div>
            </form>
          </ContentCard>

          <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
            <ContentCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-[#10213f]">
                    근무/휴무 스케줄
                  </h3>
                  <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                    교관 선택 후 기본 가능시간과 반복 휴무요일을 저장합니다.
                  </p>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  onClick={() => void saveSchedule()}
                  disabled={saving || !scheduleForm.instructorId}
                >
                  스케줄 저장
                </button>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
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
                <div className="xl:col-span-2">
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
                <Field label="스케줄 메모" className="xl:col-span-2">
                  <textarea
                    className="ui-input min-h-[92px] resize-none"
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
              </div>
            </ContentCard>

            <ContentCard className="p-5">
              <h3 className="text-[17px] font-semibold text-[#10213f]">
                {settlementMonth} 정산 기준
              </h3>
              <p className="mt-1 text-[13px] font-medium text-[#6f8199]">
                예약이 아니라 저장된 비행기록 기준입니다.
              </p>

              {selectedInstructor ? (
                <SettlementStats
                  stats={monthlyStats[selectedId] || defaultStats(selectedId)}
                />
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-[#cbd8e8] bg-slate-50 p-5 text-center text-[14px] font-medium text-[#6f8199]">
                  왼쪽에서 교관을 선택하면 월간 정산 기준 실적이 표시됩니다.
                </div>
              )}
            </ContentCard>
          </div>
        </div>
      </div>
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
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold text-[#8391a7]">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-[#10213f]">{value}</p>
    </div>
  );
}

function SettlementStats({ stats }: { stats: MonthlyStats }) {
  const rows = [
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
      label: "기타",
      count: stats.otherCount,
      minutes: stats.otherMinutes,
      tone: "bg-slate-100 text-slate-600",
    },
  ];

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-[13px] font-semibold text-blue-700">합계</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-[30px] font-semibold leading-none text-[#10213f]">
            {hours(stats.totalMinutes)}
          </p>
          <p className="text-[14px] font-semibold text-[#39516f]">
            {stats.totalCount}회
          </p>
        </div>
        <p className="mt-2 text-[12px] font-medium text-[#6f8199]">
          교육생 {stats.studentCount}명 · 최근 기록 {stats.recentLogDate || "-"}
        </p>
      </div>

      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between rounded-2xl border border-[#dbe5f1] bg-white px-4 py-3"
        >
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${row.tone}`}
          >
            {row.label}
          </span>
          <span className="text-[13px] font-semibold text-[#10213f]">
            {row.count}회 · {hours(row.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}
