"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type MaintenanceRow = {
  maintenanceId?: string;
  aircraftId?: string;
  aircraftName?: string;
  registrationNo?: string;
  inspectionDate?: string;
  maintenanceType?: string;
  status?: string;
  nextInspectionDate?: string;
  mechanic?: string;
  cost?: string | number;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type AircraftRow = {
  aircraftId?: string;
  aircraftName?: string;
  registrationNo?: string;
  model?: string;
  status?: string;
  active?: string | boolean;
  [key: string]: unknown;
};

type MaintenanceForm = {
  maintenanceId: string;
  aircraftId: string;
  aircraftName: string;
  registrationNo: string;
  inspectionDate: string;
  maintenanceType: string;
  status: string;
  nextInspectionDate: string;
  mechanic: string;
  cost: string;
  memo: string;
};

const emptyForm: MaintenanceForm = {
  maintenanceId: "",
  aircraftId: "",
  aircraftName: "",
  registrationNo: "",
  inspectionDate: "",
  maintenanceType: "정기점검",
  status: "예정",
  nextInspectionDate: "",
  mechanic: "",
  cost: "",
  memo: "",
};

const maintenanceTypes = [
  "정기점검",
  "100시간점검",
  "연간점검",
  "오일교환",
  "수리",
  "기타",
];

const maintenanceStatuses = ["예정", "진행중", "완료", "보류", "취소"];

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
  const number = Number(String(value || "0").replace(/,/g, ""));

  if (Number.isNaN(number)) {
    return 0;
  }

  return number;
}

function formatMoney(value: unknown) {
  const number = numberValue(value);

  if (number <= 0) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR").format(number);
}

function isDueSoon(dateText: unknown) {
  const raw = text(dateText, "");

  if (!raw) {
    return false;
  }

  const target = new Date(`${raw.substring(0, 10)}T00:00:00`);

  if (Number.isNaN(target.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffDays >= 0 && diffDays <= 30;
}

function isOverdue(dateText: unknown) {
  const raw = text(dateText, "");

  if (!raw) {
    return false;
  }

  const target = new Date(`${raw.substring(0, 10)}T00:00:00`);

  if (Number.isNaN(target.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return target.getTime() < today.getTime();
}

function toForm(row: MaintenanceRow): MaintenanceForm {
  return {
    maintenanceId: formValue(row.maintenanceId),
    aircraftId: formValue(row.aircraftId),
    aircraftName: formValue(row.aircraftName),
    registrationNo: formValue(row.registrationNo),
    inspectionDate: formValue(row.inspectionDate),
    maintenanceType: formValue(row.maintenanceType || "정기점검"),
    status: formValue(row.status || "예정"),
    nextInspectionDate: formValue(row.nextInspectionDate),
    mechanic: formValue(row.mechanic),
    cost: formValue(row.cost),
    memo: formValue(row.memo),
  };
}

function getStatusBadgeClass(status: unknown) {
  const value = text(status, "");

  if (value === "완료") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (value === "진행중") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (value === "예정") {
    return "bg-slate-50 text-slate-700 ring-slate-200";
  }

  if (value === "보류") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (value === "취소") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export default function AircraftMaintenancePage() {
  const [maintenanceRows, setMaintenanceRows] = useState<MaintenanceRow[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [error, setError] = useState("");

  const [form, setForm] = useState<MaintenanceForm>(emptyForm);
  const [editing, setEditing] = useState(false);

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      setError("");

      const response = await fetch("/api/aircraft-maintenance", {
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
        aircraftMaintenance?: MaintenanceRow[];
        aircraft?: AircraftRow[];
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message || "항공기 점검/정비 데이터를 불러오지 못했습니다."
        );
      }

      setMaintenanceRows(
        Array.isArray(data.aircraftMaintenance) ? data.aircraftMaintenance : []
      );
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "항공기 점검/정비 데이터를 불러오지 못했습니다."
      );
      setMaintenanceRows([]);
      setAircraft([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const typeOptions = useMemo(() => {
    const values = maintenanceRows
      .map((item) => text(item.maintenanceType, ""))
      .filter((item) => item !== "");

    return ["전체", ...Array.from(new Set([...maintenanceTypes, ...values]))];
  }, [maintenanceRows]);

  const statusOptions = useMemo(() => {
    const values = maintenanceRows
      .map((item) => text(item.status, ""))
      .filter((item) => item !== "");

    return ["전체", ...Array.from(new Set([...maintenanceStatuses, ...values]))];
  }, [maintenanceRows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return maintenanceRows.filter((item) => {
      if (statusFilter !== "전체" && text(item.status, "") !== statusFilter) {
        return false;
      }

      if (
        typeFilter !== "전체" &&
        text(item.maintenanceType, "") !== typeFilter
      ) {
        return false;
      }

      if (!q) {
        return true;
      }

      const searchText = [
        item.maintenanceId,
        item.aircraftId,
        item.aircraftName,
        item.registrationNo,
        item.inspectionDate,
        item.maintenanceType,
        item.status,
        item.nextInspectionDate,
        item.mechanic,
        item.cost,
        item.memo,
      ]
        .map((value) => text(value, ""))
        .join(" ")
        .toLowerCase();

      return searchText.includes(q);
    });
  }, [maintenanceRows, keyword, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const total = maintenanceRows.length;
    const planned = maintenanceRows.filter((item) => item.status === "예정").length;
    const inProgress = maintenanceRows.filter(
      (item) => item.status === "진행중"
    ).length;
    const dueSoon = maintenanceRows.filter((item) =>
      isDueSoon(item.nextInspectionDate)
    ).length;

    return { total, planned, inProgress, dueSoon };
  }, [maintenanceRows]);

  function resetForm() {
    setForm(emptyForm);
    setEditing(false);
  }

  function selectAircraft(aircraftId: string) {
    const selected = aircraft.find(
      (item) => text(item.aircraftId, "") === aircraftId
    );

    setForm((prev) => ({
      ...prev,
      aircraftId,
      aircraftName: text(selected?.aircraftName, ""),
      registrationNo: text(selected?.registrationNo, ""),
    }));
  }

  function startEdit(row: MaintenanceRow) {
    setForm(toForm(row));
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.aircraftId) {
      setError("항공기를 선택하세요.");
      return;
    }

    if (!form.inspectionDate) {
      setError("점검일을 입력하세요.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch("/api/aircraft-maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: editing ? "update" : "add",
          data: form,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "저장에 실패했습니다.");
      }

      resetForm();
      await loadData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="flex w-full flex-col gap-6 p-6">
        <section className="flex flex-row items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-500">관리자 기능</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              항공기 점검/정비관리
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              항공기별 점검일, 정비 유형, 상태, 다음 점검일을 관리합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData(true)}
            className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
          >
            {loading ? "불러오는 중" : "새로고침"}
          </button>
        </section>

        <section className="grid grid-cols-4 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">전체 이력</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{stats.total}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">예정</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{stats.planned}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">진행중</p>
            <p className="mt-3 text-3xl font-black text-blue-600">{stats.inProgress}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">30일 내 점검</p>
            <p className="mt-3 text-3xl font-black text-amber-600">{stats.dueSoon}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {editing ? "점검/정비 수정" : "점검/정비 등록"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                aircraftMaintenance 시트에 저장됩니다.
              </p>
            </div>

            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                새 등록으로 전환
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
            <input type="hidden" value={form.maintenanceId} readOnly />

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              항공기
              <select
                value={form.aircraftId}
                onChange={(event) => selectAircraft(event.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">항공기 선택</option>
                {aircraft.map((item, index) => {
                  const id = text(item.aircraftId, "");
                  const name = text(item.aircraftName, "");
                  const reg = text(item.registrationNo, "");

                  return (
                    <option key={id || index} value={id}>
                      {name || id} {reg ? `(${reg})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              점검일
              <input
                type="date"
                value={form.inspectionDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, inspectionDate: event.target.value }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              정비 유형
              <select
                value={form.maintenanceType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maintenanceType: event.target.value }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                {maintenanceTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              상태
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                {maintenanceStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              다음 점검일
              <input
                type="date"
                value={form.nextInspectionDate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    nextInspectionDate: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              담당자/정비처
              <input
                value={form.mechanic}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, mechanic: event.target.value }))
                }
                placeholder="예: 내부점검 / 외주정비처"
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
              비용
              <input
                value={form.cost}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cost: event.target.value }))
                }
                placeholder="숫자만 입력"
                inputMode="numeric"
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="col-span-2 flex flex-col gap-2 text-sm font-bold text-slate-700">
              메모
              <input
                value={form.memo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, memo: event.target.value }))
                }
                placeholder="점검 내용, 교체 부품, 특이사항"
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <div className="col-span-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                초기화
              </button>

              <button
                type="submit"
                disabled={saving}
                className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "저장 중" : editing ? "수정 저장" : "신규 등록"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-[220px_220px_minmax(0,1fr)] gap-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "전체" ? "전체 상태" : item}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              {typeOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "전체" ? "전체 유형" : item}
                </option>
              ))}
            </select>

            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="항공기명, 등록번호, 담당자, 메모 검색"
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </section>

        {error && (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
            {error}
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                점검/정비 목록
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                표시 {filteredRows.length}건 / 전체 {maintenanceRows.length}건
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-medium text-slate-500">
              데이터를 불러오는 중입니다.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-sm font-medium text-slate-500">
              표시할 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">항공기</th>
                    <th className="px-6 py-4">점검일</th>
                    <th className="px-6 py-4">유형</th>
                    <th className="px-6 py-4">상태</th>
                    <th className="px-6 py-4">다음 점검일</th>
                    <th className="px-6 py-4">담당자</th>
                    <th className="px-6 py-4 text-right">비용</th>
                    <th className="px-6 py-4">메모</th>
                    <th className="px-6 py-4 text-center">관리</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row, index) => {
                    const overdue = isOverdue(row.nextInspectionDate);
                    const dueSoon = isDueSoon(row.nextInspectionDate);

                    return (
                      <tr
                        key={row.maintenanceId || index}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="px-6 py-5 align-top font-bold text-slate-700">
                          {text(row.maintenanceId)}
                        </td>
                        <td className="px-6 py-5 align-top">
                          <p className="font-bold text-slate-950">
                            {text(row.aircraftName || row.aircraftId)}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {text(row.registrationNo, "") || text(row.aircraftId)}
                          </p>
                        </td>
                        <td className="px-6 py-5 align-top text-slate-700">
                          {text(row.inspectionDate)}
                        </td>
                        <td className="px-6 py-5 align-top text-slate-700">
                          {text(row.maintenanceType)}
                        </td>
                        <td className="px-6 py-5 align-top">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${getStatusBadgeClass(
                              row.status
                            )}`}
                          >
                            {text(row.status)}
                          </span>
                        </td>
                        <td className="px-6 py-5 align-top">
                          <p
                            className={
                              overdue
                                ? "font-black text-rose-600"
                                : dueSoon
                                  ? "font-black text-amber-600"
                                  : "text-slate-700"
                            }
                          >
                            {text(row.nextInspectionDate)}
                          </p>
                          {(overdue || dueSoon) && (
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {overdue ? "점검일 경과" : "30일 내 점검"}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-5 align-top text-slate-700">
                          {text(row.mechanic)}
                        </td>
                        <td className="px-6 py-5 align-top text-right font-bold text-slate-700">
                          {formatMoney(row.cost)}
                        </td>
                        <td className="px-6 py-5 align-top text-slate-700">
                          <div className="max-w-sm whitespace-pre-line leading-relaxed">
                            {text(row.memo)}
                          </div>
                        </td>
                        <td className="px-6 py-5 align-top text-center">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            수정
                          </button>
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
    </div>
  );
}
