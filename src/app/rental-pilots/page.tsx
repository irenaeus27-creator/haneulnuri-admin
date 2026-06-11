"use client";

import { formatPhone, formatAircraft } from "@/lib/display-formatters";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

type Row = Record<string, unknown>;
type ApiResult = {
  ok?: boolean;
  message?: string;
  rentalPilots?: Row[];
  users?: Row[];
  aircraft?: Row[];
  flightRecords?: Row[];
};

type PilotForm = {
  pilotId: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  licenseNo: string;
  status: string;
  assignedAircraftIds: string;
  totalFlightHours: string;
  picFlightHours: string;
  memo: string;
};

const emptyForm: PilotForm = {
  pilotId: "",
  userId: "",
  name: "",
  phone: "",
  email: "",
  licenseNo: "",
  status: "활성",
  assignedAircraftIds: "",
  totalFlightHours: "0.0",
  picFlightHours: "0.0",
  memo: "",
};

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const raw = text(value);
  if (!raw) return fallback;
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}

function splitIds(value: unknown) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compact(value: unknown) {
  return text(value).replace(/\s/g, "").toLowerCase();
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function todayText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return null;
  const from = new Date(`${fromDate}T00:00:00+09:00`).getTime();
  const to = new Date(`${toDate}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function minutesToHours(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0.0";
  return (Math.round((minutes / 60) * 10) / 10).toFixed(1);
}

function hoursToMinutes(value: unknown) {
  const hours = numberValue(value, 0);
  return Math.max(0, Math.round(hours * 60));
}

function formatHours(minutes: number) {
  return `${minutesToHours(minutes)}시간`;
}

function aircraftLabel(row: Row) {
  return text(row.registrationNo || row.registration_no || row.aircraftName || row.aircraft_name || row.aircraftId || row.aircraft_id, "-");
}

function aircraftId(row: Row) {
  return text(row.aircraftId || row.aircraft_id);
}

function badgeClass(status: unknown) {
  const s = compact(status);
  if (["활성", "가능", "사용"].includes(s)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["대기", "휴무"].includes(s)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["비활성", "정지"].includes(s)) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function toForm(row: Row): PilotForm {
  return {
    pilotId: text(row.pilotId || row.pilot_id),
    userId: text(row.userId || row.user_id),
    name: text(row.name),
    phone: formatPhone(row.phone),
    email: text(row.email),
    licenseNo: text(row.licenseNo || row.license_no || row.licenseNumber),
    status: text(row.status || "활성"),
    assignedAircraftIds: text(row.assignedAircraftIds || row.assigned_aircraft_ids || row.aircraftIds),
    totalFlightHours: minutesToHours(numberValue(row.totalFlightMinutes || row.total_flight_minutes, 0)),
    picFlightHours: minutesToHours(numberValue(row.picFlightMinutes || row.pic_flight_minutes, 0)),
    memo: text(row.memo),
  };
}

function isRentalRecord(row: Row) {
  const type = text(row.flightType || row.flight_type || row.trainingType || row.training_type || row.bookingType || row.booking_type);
  return type.includes("렌탈") || type.includes("동승");
}

function isSoloRentalRecord(row: Row) {
  const type = text(row.flightType || row.flight_type || row.trainingType || row.training_type || row.bookingType || row.booking_type);
  return type.includes("렌탈") && !type.includes("동승");
}

function recordMinutes(row: Row) {
  return (
    numberValue(row.actualFlightMinutes || row.actual_flight_minutes, 0) ||
    numberValue(row.settlementMinutes || row.settlement_minutes, 0) ||
    numberValue(row.deductedMinutes || row.deducted_minutes, 0) ||
    numberValue(row.durationMinutes || row.duration_minutes, 0)
  );
}

function recordDate(row: Row) {
  return normalizeDate(row.flightDate || row.flight_date || row.trainingDate || row.training_date || row.bookingDate || row.booking_date);
}

function recordMatchesPilot(record: Row, pilot: Row) {
  const customer = compact(
    record.customerName ||
      record.customer_name ||
      record.studentName ||
      record.student_name ||
      record.userName ||
      record.user_name ||
      record.name,
  );
  if (!customer) return false;
  return [pilot.name, pilot.phone, pilot.email, pilot.pilotId, pilot.pilot_id, pilot.userId, pilot.user_id, pilot.rentalPilotId, pilot.rental_pilot_id]
    .map(compact)
    .filter(Boolean)
    .some((value) => customer === value || customer.includes(value) || value.includes(customer));
}

function pilotStats(pilot: Row, flightRecords: Row[]) {
  const relatedRecords = flightRecords.filter((record) => recordMatchesPilot(record, pilot) && isRentalRecord(record));
  const autoTotalMinutes = relatedRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
  const autoPicMinutes = relatedRecords
    .filter(isSoloRentalRecord)
    .reduce((sum, record) => sum + recordMinutes(record), 0);
  const manualTotalMinutes = numberValue(pilot.totalFlightMinutes || pilot.total_flight_minutes, 0);
  const manualPicMinutes = numberValue(pilot.picFlightMinutes || pilot.pic_flight_minutes, 0);
  const latestDate = relatedRecords
    .map(recordDate)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  const elapsedDays = latestDate ? daysBetween(latestDate, todayText()) : null;
  const instructorRequired = !latestDate || (elapsedDays ?? 0) >= 30;

  return {
    manualTotalMinutes,
    manualPicMinutes,
    autoTotalMinutes,
    autoPicMinutes,
    totalMinutes: manualTotalMinutes + autoTotalMinutes,
    picMinutes: manualPicMinutes + autoPicMinutes,
    latestDate,
    elapsedDays,
    instructorRequired,
    recordCount: relatedRecords.length,
  };
}

export default function RentalPilotsPage() {
  const [pilots, setPilots] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [flightRecords, setFlightRecords] = useState<Row[]>([]);
  const [form, setForm] = useState<PilotForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [flightFilter, setFlightFilter] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/rental-pilots", { cache: "no-store" });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || data.ok === false) throw new Error(data.message || "렌탈 기장 데이터를 불러오지 못했습니다.");
      setPilots(Array.isArray(data.rentalPilots) ? data.rentalPilots : []);
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setFlightRecords(Array.isArray(data.flightRecords) ? data.flightRecords : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "렌탈 기장 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(() => {
    return ["전체", ...Array.from(new Set(["활성", "대기", "휴무", "비활성", ...pilots.map((p) => text(p.status)).filter(Boolean)]))];
  }, [pilots]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return pilots.filter((pilot) => {
      const stats = pilotStats(pilot, flightRecords);
      const assignedCount = splitIds(pilot.assignedAircraftIds || pilot.assigned_aircraft_ids || pilot.aircraftIds).length;
      if (statusFilter !== "전체" && text(pilot.status) !== statusFilter) return false;
      if (flightFilter === "동승필요" && !stats.instructorRequired) return false;
      if (flightFilter === "최근30일비행" && stats.instructorRequired) return false;
      if (flightFilter === "미배정" && assignedCount > 0) return false;
      if (!q) return true;
      return [
        pilot.pilotId,
        pilot.pilot_id,
        pilot.name,
        pilot.phone,
        pilot.email,
        pilot.licenseNo,
        pilot.license_no,
        pilot.assignedAircraftIds,
        pilot.assigned_aircraft_ids,
        pilot.memo,
      ]
        .map((value) => text(value).toLowerCase())
        .join(" ")
        .includes(q);
    });
  }, [pilots, flightRecords, keyword, statusFilter, flightFilter]);

  const active = pilots.filter((p) => text(p.status) === "활성").length;
  const assigned = pilots.filter((p) => splitIds(p.assignedAircraftIds || p.assigned_aircraft_ids || p.aircraftIds).length > 0).length;
  const unassigned = pilots.length - assigned;
  const requireInstructor = pilots.filter((p) => pilotStats(p, flightRecords).instructorRequired).length;

  function update(key: keyof PilotForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(emptyForm);
    setEditing(false);
    setFormOpen(false);
  }

  function openNew() {
    setForm(emptyForm);
    setEditing(false);
    setFormOpen(true);
  }

  function selectUser(userId: string) {
    const user = users.find((u) => text(u.userId || u.user_id) === userId);
    setForm((prev) => ({
      ...prev,
      userId,
      name: user ? text(user.name) : prev.name,
      phone: user ? text(user.phone) : prev.phone,
      email: user ? text(user.email) : prev.email,
    }));
  }

  function toggleAircraft(id: string) {
    const current = splitIds(form.assignedAircraftIds);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    update("assignedAircraftIds", next.join(", "));
  }

  function startEdit(row: Row) {
    setForm(toForm(row));
    setEditing(true);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function assignedAircraftText(value: unknown) {
    const ids = splitIds(value);
    if (!ids.length) return "미배정";
    return ids
      .map((id) => {
        const row = aircraft.find((a) => [aircraftId(a), aircraftLabel(a), text(a.aircraftName || a.aircraft_name)].includes(id));
        return row ? aircraftLabel(row) : id;
      })
      .join(", ");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.name.trim()) throw new Error("기장명을 입력하세요.");
      const totalMinutes = hoursToMinutes(form.totalFlightHours);
      const picMinutes = hoursToMinutes(form.picFlightHours);
      if (picMinutes > totalMinutes) throw new Error("PIC 비행시간은 총 비행시간보다 클 수 없습니다.");

      const response = await fetch("/api/rental-pilots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing ? "updateRentalPilot" : "addRentalPilot",
          data: {
            ...form,
            licenseType: "",
            totalFlightMinutes: totalMinutes,
            picFlightMinutes: picMinutes,
          },
        }),
      });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || data.ok === false) throw new Error(data.message || "렌탈 기장을 저장하지 못했습니다.");
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "렌탈 기장을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer title="렌탈기장관리" description="렌탈 예약 시 기장별 배정 항공기와 30일 비행 기준을 관리합니다.">
      <ContentCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-sm text-[#526a89]">
            <div>
              <span className="font-semibold text-[#10213f]">활성 {active}명</span>
              <span className="mx-2 text-[#c0cbd8]">·</span>
              <span>배정 완료 <b className="text-[#1264f4]">{assigned}</b>명</span>
              <span className="mx-2 text-[#c0cbd8]">·</span>
              <span>미배정 <b className="text-amber-600">{unassigned}</b>명</span>
              <span className="mx-2 text-[#c0cbd8]">·</span>
              <span>동승 필요 <b className="text-rose-600">{requireInstructor}</b>명</span>
            </div>
            <p>최근 30일 비행기록이 없으면 렌탈 단독비행 대신 교관 동승비행이 필요합니다.</p>
          </div>
          <button type="button" onClick={openNew} className="ui-btn ui-btn-primary">+ 신규 등록</button>
        </div>
      </ContentCard>

      {formOpen ? (
        <ContentCard className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-[#10213f]">{editing ? "렌탈 기장 수정" : "렌탈 기장 등록"}</h2>
              <p className="mt-1 text-sm text-[#6f8199]">기본 비행시간을 입력하면 비행기록의 렌탈/동승 시간이 자동 합산됩니다.</p>
            </div>
            <button type="button" onClick={reset} className="ui-btn ui-btn-outline">닫기</button>
          </div>

          {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
              <label className="ui-label">
                <span>기존 회원 연결</span>
                <select className="ui-input" value={form.userId} onChange={(e) => selectUser(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {users.map((user, index) => (
                    <option key={`${text(user.userId || user.user_id)}-${index}`} value={text(user.userId || user.user_id)}>
                      {text(user.name)} / {text(user.userId || user.user_id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ui-label">
                <span>기장명</span>
                <input className="ui-input" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </label>
              <label className="ui-label">
                <span>연락처</span>
                <input className="ui-input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </label>
              <label className="ui-label">
                <span>상태</span>
                <select className="ui-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
                  <option>활성</option>
                  <option>대기</option>
                  <option>휴무</option>
                  <option>비활성</option>
                </select>
              </label>
              <label className="ui-label">
                <span>이메일</span>
                <input className="ui-input" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </label>
              <label className="ui-label">
                <span>면장번호</span>
                <input className="ui-input" value={form.licenseNo} onChange={(e) => update("licenseNo", e.target.value)} />
              </label>
              <label className="ui-label">
                <span>기존 총 비행시간</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={form.totalFlightHours} onChange={(e) => update("totalFlightHours", e.target.value)} />
              </label>
              <label className="ui-label">
                <span>기존 PIC 비행시간</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={form.picFlightHours} onChange={(e) => update("picFlightHours", e.target.value)} />
              </label>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-[#395270]">배정 가능한 항공기</div>
              <div className="rounded-2xl border border-[#dbe5f1] bg-white p-3">
                <div className="flex flex-wrap gap-2">
                  {aircraft.map((item, index) => {
                    const id = aircraftId(item);
                    const selected = splitIds(form.assignedAircraftIds).includes(id);
                    return (
                      <button
                        type="button"
                        key={`${id}-${index}`}
                        onClick={() => toggleAircraft(id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${selected ? "border-[#1264f4] bg-[#edf4ff] text-[#1264f4]" : "border-[#dbe5f1] bg-[#f8fbff] text-[#536985] hover:border-[#9db8dc]"}`}
                      >
                        {aircraftLabel(item)}
                      </button>
                    );
                  })}
                  {aircraft.length === 0 ? <span className="text-sm text-[#6f8199]">등록된 항공기가 없습니다.</span> : null}
                </div>
              </div>
            </div>

            <label className="ui-label">
              <span>메모</span>
              <input className="ui-input" value={form.memo} onChange={(e) => update("memo", e.target.value)} />
            </label>

            <div className="flex gap-2">
              <button disabled={saving} className="ui-btn ui-btn-primary">{saving ? "저장 중" : editing ? "수정 저장" : "등록"}</button>
              <button type="button" onClick={reset} className="ui-btn ui-btn-outline">취소</button>
            </div>
          </form>
        </ContentCard>
      ) : null}

      <ContentCard className="p-5">
        <div className="grid gap-3 xl:grid-cols-[190px_190px_minmax(320px,1fr)] md:grid-cols-3">
          <select className="ui-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status === "전체" ? "상태 전체" : status}</option>
            ))}
          </select>
          <select className="ui-input" value={flightFilter} onChange={(e) => setFlightFilter(e.target.value)}>
            <option value="전체">비행 기준 전체</option>
            <option value="동승필요">동승 필요</option>
            <option value="최근30일비행">최근 30일 비행</option>
            <option value="미배정">항공기 미배정</option>
          </select>
          <input className="ui-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="기장명, 연락처, 면장번호, 항공기 검색" />
        </div>
      </ContentCard>

      <ContentCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[#10213f]">렌탈 기장 목록</h2>
            <p className="mt-1 text-sm text-[#6f8199]">총 비행시간은 기존 입력값에 렌탈비행·동승비행 기록을 합산하고, PIC는 렌탈 단독비행만 합산합니다.</p>
          </div>
          <span className="ui-badge border-[#dbe5f1] bg-[#f4f8fd] text-[#526a89]">표시 {filtered.length}건</span>
        </div>
        <div className="overflow-x-auto px-6 pb-6">
          <table className="ui-table min-w-[1160px] overflow-hidden rounded-2xl border border-[#dbe5f1]">
            <thead>
              <tr>
                <th>기장명</th>
                <th>연락처</th>
                <th>면장번호</th>
                <th>비행시간</th>
                <th>30일 기준</th>
                <th>배정 항공기</th>
                <th>상태</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="text-center text-[#6f8199]">불러오는 중입니다.</td></tr> : null}
              {!loading && filtered.length === 0 ? <tr><td colSpan={8} className="text-center text-[#6f8199]">표시할 기장이 없습니다.</td></tr> : null}
              {!loading && filtered.map((row, index) => {
                const stats = pilotStats(row, flightRecords);
                const assignedText = assignedAircraftText(row.assignedAircraftIds || row.assigned_aircraft_ids || row.aircraftIds);
                return (
                  <tr key={`${text(row.pilotId || row.pilot_id)}-${index}`} className={stats.instructorRequired ? "bg-amber-50/20" : ""}>
                    <td>
                      <div className="font-semibold text-[#10213f]">{text(row.name, "-")}</div>
                      <div className="mt-1 text-xs text-[#7a8ba3]">{text(row.pilotId || row.pilot_id, "-")}</div>
                    </td>
                    <td>{formatPhone(row.phone) || "-"}</td>
                    <td>{text(row.licenseNo || row.license_no || row.licenseNumber, "-")}</td>
                    <td>
                      <div className="font-semibold text-[#10213f]">총 {formatHours(stats.totalMinutes)}</div>
                      <div className="mt-1 text-xs text-[#6f8199]">PIC {formatHours(stats.picMinutes)}</div>
                      <div className="mt-1 text-[11px] text-[#94a3b8]">자동 +{formatHours(stats.autoTotalMinutes)} / PIC +{formatHours(stats.autoPicMinutes)}</div>
                    </td>
                    <td>
                      {stats.instructorRequired ? (
                        <span className="ui-badge border-amber-200 bg-amber-50 text-amber-700">동승 필요</span>
                      ) : (
                        <span className="ui-badge border-emerald-200 bg-emerald-50 text-emerald-700">단독 가능</span>
                      )}
                      <div className="mt-1 text-xs text-[#6f8199]">
                        {stats.latestDate ? `최근 ${stats.latestDate}${stats.elapsedDays !== null ? ` · ${stats.elapsedDays}일 전` : ""}` : "비행기록 없음"}
                      </div>
                    </td>
                    <td>
                      {assignedText === "미배정" ? (
                        <span className="ui-badge border-amber-200 bg-amber-50 text-amber-700">미배정</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {assignedText.split(",").map((label) => <span key={label.trim()} className="ui-badge border-blue-100 bg-blue-50 text-blue-700">{label.trim()}</span>)}
                        </div>
                      )}
                    </td>
                    <td><span className={`ui-badge ${badgeClass(row.status)}`}>{text(row.status, "-")}</span></td>
                    <td className="text-right"><button type="button" className="ui-btn ui-btn-outline" onClick={() => startEdit(row)}>수정</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </PageContainer>
  );
}
