"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { formatKstDate as sharedFormatKstDate } from "@/lib/formatDateTime";

type Row = Record<string, unknown>;
type RecordKind = "정기 정비/점검" | "일상 점검" | "결함/Squawk";

type MaintenanceForm = {
  maintenanceId: string;
  recordKind: RecordKind;
  aircraftId: string;
  registrationNo: string;
  inspectionDate: string;
  maintenanceType: string;
  status: string;
  currentAirframeTime: string;
  currentEngineTime: string;
  mechanic: string;
  provider: string;
  nextInspectionDate: string;
  nextDueBasis: string;
  nextDueHours: string;
  content: string;
  defect: string;
  actionTaken: string;
  checkStage: string;
  flightAvailable: string;
  oilStatus: string;
  oilAddedAmount: string;
  fuelStatus: string;
  tireStatus: string;
  brakeStatus: string;
  propellerStatus: string;
  pitotStatus: string;
  controlSurfaceStatus: string;
  exteriorDamage: string;
  riskLevel: string;
  operationDecision: string;
  closeYn: string;
  attachmentUrl: string;
  memo: string;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const emptyForm: MaintenanceForm = {
  maintenanceId: "",
  recordKind: "정기 정비/점검",
  aircraftId: "",
  registrationNo: "",
  inspectionDate: today(),
  maintenanceType: "연간점검",
  status: "완료",
  currentAirframeTime: "",
  currentEngineTime: "",
  mechanic: "",
  provider: "",
  nextInspectionDate: "",
  nextDueBasis: "날짜",
  nextDueHours: "",
  content: "",
  defect: "",
  actionTaken: "",
  checkStage: "비행 전",
  flightAvailable: "가능",
  oilStatus: "정상",
  oilAddedAmount: "",
  fuelStatus: "정상",
  tireStatus: "정상",
  brakeStatus: "정상",
  propellerStatus: "정상",
  pitotStatus: "정상",
  controlSurfaceStatus: "정상",
  exteriorDamage: "없음",
  riskLevel: "낮음",
  operationDecision: "운항 가능",
  closeYn: "N",
  attachmentUrl: "",
  memo: "",
};

const periodicTypes = ["연간점검", "25시간 점검", "50시간 점검", "100시간 점검", "엔진오일 교환", "오일필터 교환", "점화플러그 교환", "연료필터 교환", "브레이크 패드 교환", "타이어 교체", "배터리 교체", "프로펠러 점검", "기타"];
const dailyTypes = ["비행 전 점검", "비행 후 점검", "일상 확인", "엔진오일량 확인", "연료 확인", "기타 일상점검"];
const squawkTypes = ["결함/Squawk", "비행 전 결함", "비행 중 결함", "비행 후 결함", "운용 제한", "기타 결함"];
const periodicStatuses = ["예정", "진행중", "완료", "보류", "취소"];
const dailyStatuses = ["정상", "보충", "이상 발견", "조치 필요", "운항 불가"];
const squawkStatuses = ["미해결", "조치중", "완료", "보류"];
const riskLevels = ["낮음", "중간", "높음", "긴급"];
const operationDecisions = ["운항 가능", "운항 제한", "운항 불가"];
const checkValues = ["정상", "주의", "보충", "조치 필요", "해당 없음"];

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function normalizeDate(value: unknown) {
  const formatted = sharedFormatKstDate(value);
  return formatted === "-" ? "" : formatted;
}

function aircraftRegistration(row: Row) {
  return text(row.registrationNo || row.registration_no || row.aircraftName || row.aircraft_name || row.aircraftId || row.aircraft_id, "-");
}

function memoValue(memo: unknown, label: string) {
  const raw = text(memo);
  const line = raw.split(/\r?\n/).find((item) => item.startsWith(`${label}:`));
  return line ? line.replace(`${label}:`, "").trim() : "";
}

function recordKindOf(row: Row): RecordKind {
  const memoKind = memoValue(row.memo, "기록구분");
  const type = text(row.maintenanceType || row.maintenance_type);
  if (memoKind.includes("일상") || type.includes("비행 전") || type.includes("비행 후") || type.includes("일상") || type.includes("엔진오일량")) return "일상 점검";
  if (memoKind.includes("결함") || type.includes("결함") || type.includes("Squawk")) return "결함/Squawk";
  return "정기 정비/점검";
}

function statusClass(row: Row) {
  const status = text(row.status);
  if (["완료", "정상"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["진행중", "조치중", "보충"].includes(status)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["미해결", "예정", "주의", "이상 발견", "조치 필요"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["운항 불가", "긴급"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function kindBadgeClass(kind: RecordKind) {
  if (kind === "정기 정비/점검") return "bg-blue-50 text-blue-700 border-blue-200";
  if (kind === "일상 점검") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function riskClass(value: unknown) {
  const risk = text(value);
  if (risk === "긴급" || risk === "높음") return "bg-rose-50 text-rose-700 border-rose-200";
  if (risk === "중간") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function daysUntil(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - base) / 86400000);
}

function dDayText(value: unknown) {
  const days = daysUntil(value);
  if (days === null) return "-";
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "D-Day";
  return `D-${days}`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function statusDefault(kind: RecordKind) {
  if (kind === "정기 정비/점검") return "완료";
  if (kind === "일상 점검") return "정상";
  return "미해결";
}

function typeDefault(kind: RecordKind) {
  if (kind === "정기 정비/점검") return "연간점검";
  if (kind === "일상 점검") return "비행 전 점검";
  return "결함/Squawk";
}

function toForm(row: Row): MaintenanceForm {
  const kind = recordKindOf(row);
  return {
    maintenanceId: text(row.maintenanceId || row.maintenance_id),
    recordKind: kind,
    aircraftId: text(row.aircraftId || row.aircraft_id),
    registrationNo: aircraftRegistration(row) === "-" ? "" : aircraftRegistration(row),
    inspectionDate: normalizeDate(row.inspectionDate || row.inspection_date) || today(),
    maintenanceType: text(row.maintenanceType || row.maintenance_type, typeDefault(kind)),
    status: text(row.status, statusDefault(kind)),
    currentAirframeTime: memoValue(row.memo, "현재 기체시간"),
    currentEngineTime: memoValue(row.memo, "현재 엔진시간"),
    mechanic: text(row.mechanic),
    provider: memoValue(row.memo, "정비업체"),
    nextInspectionDate: normalizeDate(row.nextInspectionDate || row.next_inspection_date),
    nextDueBasis: memoValue(row.memo, "다음 예정 기준") || "날짜",
    nextDueHours: memoValue(row.memo, "다음 예정 시간"),
    content: memoValue(row.memo, "정비/점검 내용"),
    defect: memoValue(row.memo, "발견 결함"),
    actionTaken: memoValue(row.memo, "조치 내용"),
    checkStage: memoValue(row.memo, "점검 단계") || "비행 전",
    flightAvailable: memoValue(row.memo, "다음 비행 가능 여부") || "가능",
    oilStatus: memoValue(row.memo, "엔진오일량") || "정상",
    oilAddedAmount: memoValue(row.memo, "오일 보충량"),
    fuelStatus: memoValue(row.memo, "연료 상태") || "정상",
    tireStatus: memoValue(row.memo, "타이어 상태") || "정상",
    brakeStatus: memoValue(row.memo, "브레이크 상태") || "정상",
    propellerStatus: memoValue(row.memo, "프로펠러 상태") || "정상",
    pitotStatus: memoValue(row.memo, "피토관 상태") || "정상",
    controlSurfaceStatus: memoValue(row.memo, "조종면 상태") || "정상",
    exteriorDamage: memoValue(row.memo, "외부 손상") || "없음",
    riskLevel: memoValue(row.memo, "위험도") || "낮음",
    operationDecision: memoValue(row.memo, "운항판단") || "운항 가능",
    closeYn: memoValue(row.memo, "Close 여부") || "N",
    attachmentUrl: memoValue(row.memo, "첨부"),
    memo: memoValue(row.memo, "메모"),
  };
}

export default function AircraftMaintenancePage() {
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const [form, setForm] = useState<MaintenanceForm>(emptyForm);
  const [kindFilter, setKindFilter] = useState("전체");
  const [aircraftFilter, setAircraftFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(form.maintenanceId);
  const isPeriodicMode = form.recordKind === "정기 정비/점검";
  const isDailyMode = form.recordKind === "일상 점검";
  const isSquawkMode = form.recordKind === "결함/Squawk";

  async function load() {
    setLoading(true);
    const data = await fetchJson("/api/aircraft-maintenance");
    setAircraft(Array.isArray(data.aircraft) ? (data.aircraft as Row[]) : []);
    setRecords(Array.isArray(data.aircraftMaintenance) ? (data.aircraftMaintenance as Row[]) : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function selectAircraft(aircraftId: string) {
    const selected = aircraft.find((row) => text(row.aircraftId || row.aircraft_id) === aircraftId);
    setForm({ ...form, aircraftId, registrationNo: selected ? aircraftRegistration(selected) : "" });
  }

  function switchKind(kind: RecordKind) {
    setForm({
      ...emptyForm,
      aircraftId: form.aircraftId,
      registrationNo: form.registrationNo,
      inspectionDate: form.inspectionDate || today(),
      recordKind: kind,
      maintenanceType: typeDefault(kind),
      status: statusDefault(kind),
    });
  }

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return records.filter((row) => {
      const rowKind = recordKindOf(row);
      const aircraftId = text(row.aircraftId || row.aircraft_id);
      if (kindFilter !== "전체" && rowKind !== kindFilter) return false;
      if (aircraftFilter !== "전체" && aircraftId !== aircraftFilter) return false;
      if (statusFilter !== "전체" && text(row.status) !== statusFilter) return false;
      if (!q) return true;
      return [row.maintenanceId, row.aircraftId, row.aircraftName, row.registrationNo, row.maintenanceType, row.status, row.mechanic, row.memo]
        .map((value) => text(value).toLowerCase())
        .join(" ")
        .includes(q);
    });
  }, [aircraftFilter, keyword, kindFilter, records, statusFilter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.aircraftId) {
      alert("항공기를 선택하세요.");
      return;
    }
    if (!form.inspectionDate) {
      alert("기록일자를 입력하세요.");
      return;
    }
    if (!form.maintenanceType.trim()) {
      alert("점검종류를 선택하세요.");
      return;
    }
    if (!form.status.trim()) {
      alert("상태를 선택하세요.");
      return;
    }
    setSaving(true);
    const selected = aircraft.find((row) => text(row.aircraftId || row.aircraft_id) === form.aircraftId);
    const payload = {
      ...form,
      aircraftName: selected ? aircraftRegistration(selected) : form.registrationNo,
      registrationNo: selected ? aircraftRegistration(selected) : form.registrationNo,
      maintenanceType: form.maintenanceType || typeDefault(form.recordKind),
    };
    const response = await fetch("/api/aircraft-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isEdit ? "update" : "add", data: payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      alert(String(result.message || "항공기 정비관리 기록 저장에 실패했습니다."));
      setSaving(false);
      return;
    }
    setForm(emptyForm);
    await load();
    setSaving(false);
  }

  return (
    <PageContainer title="항공기 정비관리" description="정기 정비, 일상 점검, 결함/Squawk를 성격에 맞게 분리해 기록합니다.">
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <ContentCard className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#6f8199]">AIRCRAFT MAINTENANCE</p>
              <h2 className="mt-1 text-xl font-semibold text-[#10213f]">{isEdit ? "기록 수정" : "정비/점검 기록"}</h2>
              <p className="mt-2 text-sm text-[#6f8199]">다음 예정일은 정기 정비에서만 관리하고, 일상 점검은 비행 가능 여부만 기록합니다.</p>
            </div>
            {isEdit ? <span className="ui-badge bg-blue-50 text-blue-700 border-blue-200">수정 중</span> : null}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-5">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f4f8fd] p-1">
              {(["정기 정비/점검", "일상 점검", "결함/Squawk"] as RecordKind[]).map((kind) => (
                <button key={kind} type="button" onClick={() => switchKind(kind)} className={`rounded-xl px-2 py-2 text-xs font-medium transition md:text-sm ${form.recordKind === kind ? "bg-white text-blue-700 shadow-sm" : "text-[#6f8199]"}`}>
                  {kind}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="항공기" required>
                <select className="ui-input" value={form.aircraftId} onChange={(event) => selectAircraft(event.target.value)}>
                  <option value="">항공기 선택</option>
                  {aircraft.map((row, index) => {
                    const id = text(row.aircraftId || row.aircraft_id);
                    return <option key={id || index} value={id}>{aircraftRegistration(row)} · {text(row.model, "기종 미입력")}</option>;
                  })}
                </select>
              </Field>
              <Field label={isSquawkMode ? "발생일" : isDailyMode ? "점검일" : "정비/점검일"} required>
                <input type="date" className="ui-input" value={form.inspectionDate} onChange={(event) => setForm({ ...form, inspectionDate: event.target.value })} />
              </Field>
              <Field label={isSquawkMode ? "결함 구분" : isDailyMode ? "점검 구분" : "정기 정비 구분"} required>
                <select className="ui-input" value={form.maintenanceType} onChange={(event) => setForm({ ...form, maintenanceType: event.target.value })}>
                  {(isSquawkMode ? squawkTypes : isDailyMode ? dailyTypes : periodicTypes).map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="상태" required>
                <select className="ui-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {(isSquawkMode ? squawkStatuses : isDailyMode ? dailyStatuses : periodicStatuses).map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="현재 기체시간">
                <input className="ui-input" value={form.currentAirframeTime} onChange={(event) => setForm({ ...form, currentAirframeTime: event.target.value })} placeholder="예: 123.4" />
              </Field>
              <Field label="현재 엔진시간">
                <input className="ui-input" value={form.currentEngineTime} onChange={(event) => setForm({ ...form, currentEngineTime: event.target.value })} placeholder="예: 98.2" />
              </Field>
              <Field label={isSquawkMode ? "조치 담당자" : isDailyMode ? "점검자" : "정비자/점검자"}>
                <input className="ui-input" value={form.mechanic} onChange={(event) => setForm({ ...form, mechanic: event.target.value })} placeholder="이름 입력" />
              </Field>
              {isPeriodicMode ? (
                <Field label="정비업체">
                  <input className="ui-input" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} placeholder="업체명" />
                </Field>
              ) : null}
            </div>

            {isPeriodicMode ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="text-sm font-medium text-blue-800">정기 정비/점검 예정 관리</p>
                <p className="mt-1 text-xs text-blue-700/80">연간점검, 50시간 점검, 100시간 점검처럼 반복 주기가 있는 항목만 다음 예정값을 입력합니다.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="다음 예정 기준">
                    <select className="ui-input" value={form.nextDueBasis} onChange={(event) => setForm({ ...form, nextDueBasis: event.target.value })}>
                      <option>날짜</option>
                      <option>비행시간</option>
                      <option>엔진시간</option>
                      <option>착륙횟수</option>
                    </select>
                  </Field>
                  <Field label="다음 예정일">
                    <input type="date" className="ui-input" value={form.nextInspectionDate} onChange={(event) => setForm({ ...form, nextInspectionDate: event.target.value })} />
                  </Field>
                  <Field label="다음 예정 시간">
                    <input className="ui-input" value={form.nextDueHours} onChange={(event) => setForm({ ...form, nextDueHours: event.target.value })} placeholder="예: 370.4h" />
                  </Field>
                </div>
              </div>
            ) : null}

            {isDailyMode ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/45 p-4">
                <p className="text-sm font-medium text-sky-800">일상 점검 결과</p>
                <p className="mt-1 text-xs text-sky-700/80">엔진오일량 확인/보충처럼 매 비행 전후 확인하는 항목은 다음 예정일 없이 결과만 남깁니다.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="점검 단계">
                    <select className="ui-input" value={form.checkStage} onChange={(event) => setForm({ ...form, checkStage: event.target.value })}>
                      <option>비행 전</option>
                      <option>비행 후</option>
                    </select>
                  </Field>
                  <Field label="다음 비행 가능 여부">
                    <select className="ui-input" value={form.flightAvailable} onChange={(event) => setForm({ ...form, flightAvailable: event.target.value })}>
                      <option>가능</option>
                      <option>제한</option>
                      <option>불가</option>
                    </select>
                  </Field>
                  <Field label="엔진오일량">
                    <select className="ui-input" value={form.oilStatus} onChange={(event) => setForm({ ...form, oilStatus: event.target.value })}>
                      {checkValues.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="오일 보충량">
                    <input className="ui-input" value={form.oilAddedAmount} onChange={(event) => setForm({ ...form, oilAddedAmount: event.target.value })} placeholder="예: 0.5L" />
                  </Field>
                  <CheckField label="연료 상태" value={form.fuelStatus} onChange={(value) => setForm({ ...form, fuelStatus: value })} />
                  <CheckField label="타이어 상태" value={form.tireStatus} onChange={(value) => setForm({ ...form, tireStatus: value })} />
                  <CheckField label="브레이크 상태" value={form.brakeStatus} onChange={(value) => setForm({ ...form, brakeStatus: value })} />
                  <CheckField label="프로펠러 상태" value={form.propellerStatus} onChange={(value) => setForm({ ...form, propellerStatus: value })} />
                  <CheckField label="피토관 상태" value={form.pitotStatus} onChange={(value) => setForm({ ...form, pitotStatus: value })} />
                  <CheckField label="조종면 상태" value={form.controlSurfaceStatus} onChange={(value) => setForm({ ...form, controlSurfaceStatus: value })} />
                  <Field label="외부 손상">
                    <select className="ui-input" value={form.exteriorDamage} onChange={(event) => setForm({ ...form, exteriorDamage: event.target.value })}>
                      <option>없음</option>
                      <option>주의</option>
                      <option>손상 발견</option>
                      <option>조치 필요</option>
                    </select>
                  </Field>
                </div>
              </div>
            ) : null}

            {isSquawkMode ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="위험도">
                  <select className="ui-input" value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value })}>
                    {riskLevels.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="운항 판단">
                  <select className="ui-input" value={form.operationDecision} onChange={(event) => setForm({ ...form, operationDecision: event.target.value })}>
                    {operationDecisions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Close 여부">
                  <select className="ui-input" value={form.closeYn} onChange={(event) => setForm({ ...form, closeYn: event.target.value })}>
                    <option value="N">미해결</option>
                    <option value="Y">Close</option>
                  </select>
                </Field>
              </div>
            ) : null}

            <Field label={isSquawkMode ? "결함 내용" : isDailyMode ? "특이사항" : "정비/점검 내용"}>
              <textarea
                className="ui-input min-h-[86px] resize-y"
                value={isSquawkMode ? form.defect : form.content}
                onChange={(event) => isSquawkMode ? setForm({ ...form, defect: event.target.value }) : setForm({ ...form, content: event.target.value })}
                placeholder={isSquawkMode ? "발견된 결함이나 Squawk 내용을 입력하세요." : isDailyMode ? "비행 전후 점검 특이사항을 입력하세요." : "수행한 정기 정비 또는 점검 내용을 입력하세요."}
              />
            </Field>
            <Field label="조치 내용">
              <textarea className="ui-input min-h-[76px] resize-y" value={form.actionTaken} onChange={(event) => setForm({ ...form, actionTaken: event.target.value })} placeholder="보충, 조치 내용, 향후 확인 사항" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="첨부 URL">
                <input className="ui-input" value={form.attachmentUrl} onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })} placeholder="사진, 정비기록, 영수증 URL" />
              </Field>
              <Field label="관리 메모">
                <input className="ui-input" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder="관리자 메모" />
              </Field>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#31435f]">
              정기 정비의 다음 예정일만 항공기 관리에 반영됩니다. 일상 점검은 비행 가능 여부가 제한/불가일 때만 항공기 상태에 반영됩니다.
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" className="ui-btn ui-btn-outline" onClick={() => setForm(emptyForm)} disabled={saving}>초기화</button>
              <button className="ui-btn ui-btn-primary" disabled={saving}>{saving ? "저장 중" : isEdit ? "수정 저장" : "기록 저장"}</button>
            </div>
          </form>
        </ContentCard>

        <ContentCard className="overflow-hidden p-0">
          <div className="border-b border-[#e6eef8] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[#10213f]">정비/점검 기록 목록</h2>
                <p className="mt-1 text-sm text-[#6f8199]">성격별로 분리해 기록하고 항공기별로 함께 확인합니다.</p>
              </div>
              <span className="ui-badge bg-slate-50 text-slate-600 border-slate-200">표시 {filtered.length}건</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select className="ui-input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option>전체</option>
                <option>정기 정비/점검</option>
                <option>일상 점검</option>
                <option>결함/Squawk</option>
              </select>
              <select className="ui-input" value={aircraftFilter} onChange={(event) => setAircraftFilter(event.target.value)}>
                <option value="전체">항공기 전체</option>
                {aircraft.map((row, index) => {
                  const id = text(row.aircraftId || row.aircraft_id);
                  return <option key={id || index} value={id}>{aircraftRegistration(row)}</option>;
                })}
              </select>
              <select className="ui-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>전체</option>
                {[...periodicStatuses, ...dailyStatuses, ...squawkStatuses].filter((item, index, arr) => arr.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}
              </select>
              <input className="ui-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="항공기, 내용, 담당자 검색" />
            </div>
          </div>

          <div className="max-h-[860px] space-y-3 overflow-y-auto p-5">
            {loading ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-[#6f8199]">불러오는 중입니다.</div> : null}
            {!loading && filtered.length === 0 ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-[#6f8199]">표시할 기록이 없습니다.</div> : null}
            {!loading && filtered.map((row, index) => {
              const rowKind = recordKindOf(row);
              const risk = memoValue(row.memo, "위험도");
              const operationDecision = memoValue(row.memo, "운항판단");
              const flightAvailable = memoValue(row.memo, "다음 비행 가능 여부");
              const content = memoValue(row.memo, rowKind === "결함/Squawk" ? "발견 결함" : "정비/점검 내용") || memoValue(row.memo, "조치 내용") || text(row.memo, "내용 없음").split(/\r?\n/)[0];
              return (
                <button key={text(row.maintenanceId || row.maintenance_id) || index} type="button" onClick={() => setForm(toForm(row))} className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${rowKind === "결함/Squawk" ? "border-rose-100 bg-rose-50/35" : rowKind === "일상 점검" ? "border-sky-100 bg-sky-50/35" : "border-[#dbe5f1] bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`ui-badge ${kindBadgeClass(rowKind)}`}>{rowKind}</span>
                        <span className={`ui-badge ${statusClass(row)}`}>{text(row.status, "-")}</span>
                        {rowKind === "결함/Squawk" && risk ? <span className={`ui-badge ${riskClass(risk)}`}>위험도 {risk}</span> : null}
                        {rowKind === "일상 점검" && flightAvailable ? <span className="ui-badge bg-white text-slate-600 border-slate-200">비행 {flightAvailable}</span> : null}
                      </div>
                      <p className="mt-3 text-lg font-semibold text-[#10213f]">{aircraftRegistration(row)}</p>
                      <p className="mt-1 text-sm text-[#6f8199]">{normalizeDate(row.inspectionDate || row.inspection_date) || "-"} · {text(row.maintenanceType || row.maintenance_type, "-")} · {text(row.mechanic, "담당자 미입력")}</p>
                    </div>
                    <div className="text-right text-sm text-[#6f8199]">
                      {rowKind === "정기 정비/점검" ? <p>다음 예정 {dDayText(row.nextInspectionDate || row.next_inspection_date)}</p> : null}
                      {rowKind === "일상 점검" ? <p>{memoValue(row.memo, "점검 단계") || "일상 점검"}</p> : null}
                      {rowKind === "결함/Squawk" ? <p>{operationDecision || "운항판단 미입력"}</p> : null}
                      <p className="mt-1">수정 ›</p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[#31435f]">{content}</p>
                </button>
              );
            })}
          </div>
        </ContentCard>
      </div>
    </PageContainer>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`ui-label ${className}`}>
      <span>{label}{required ? <em className="ml-1 text-rose-500">*</em> : null}</span>
      {children}
    </label>
  );
}

function CheckField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select className="ui-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {checkValues.map((item) => <option key={item}>{item}</option>)}
      </select>
    </Field>
  );
}
