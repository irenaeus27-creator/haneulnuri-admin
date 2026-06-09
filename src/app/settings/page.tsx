"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type SettingRow = {
  rowNumber?: number | string;
  key?: string;
  value?: string;
  memo?: string;
  [key: string]: unknown;
};

type SettingForm = {
  rowNumber: string;
  key: string;
  value: string;
  memo: string;
};

const emptyForm: SettingForm = {
  rowNumber: "",
  key: "bookingStatus",
  value: "",
  memo: "",
};

const defaultKeys = [
  "schoolName",
  "operatingStartTime",
  "operatingEndTime",
  "reservationInterval",
  "defaultFlightTime",
  "timezone",
  "bookingStatus",
  "bookingType",
  "paymentStatus",
  "courseType",
  "activeStatus",
  "maintenanceType",
  "maintenanceStatus",
  "aircraftStatus",
  "instructorStatus",
  "rentalPilotStatus",
  "pilotLicenseType",
  "discountType",
  "couponTargetType",
  "couponStatus",
  "documentType",
  "documentTargetType",
  "documentStatus",
  "instructorScheduleStatus",
  "managedFileType",
  "managedFileStatus",
];

const keyLabels: Record<string, string> = {
  schoolName: "교육원명",
  operatingStartTime: "운영 시작 시간",
  operatingEndTime: "운영 종료 시간",
  reservationInterval: "예약 단위",
  defaultFlightTime: "기본 비행시간",
  timezone: "기준 시간대",
  bookingStatus: "예약 상태",
  bookingType: "예약 유형",
  paymentStatus: "결제 상태",
  courseType: "코스 유형",
  activeStatus: "사용 여부",
  maintenanceType: "정비 유형",
  maintenanceStatus: "정비 상태",
  aircraftStatus: "항공기 상태",
  instructorStatus: "교관 상태",
  rentalPilotStatus: "렌탈 기장 상태",
  pilotLicenseType: "조종 자격 종류",
  discountType: "할인 방식",
  couponTargetType: "쿠폰 적용 대상",
  couponStatus: "쿠폰 상태",
  documentType: "문서 종류",
  documentTargetType: "문서 적용 대상",
  documentStatus: "문서 상태",
  instructorScheduleStatus: "교관 스케줄 상태",
};

const integrationGroups = [
  {
    title: "예약관리 연동",
    description:
      "예약 상태, 유형, 결제 상태가 예약관리 필터와 입력 폼에 사용됩니다.",
    keys: ["bookingStatus", "bookingType", "paymentStatus"],
  },
  {
    title: "코스/렌탈 연동",
    description: "예약관리의 코스 선택, 렌탈 기장 선택과 연결됩니다.",
    keys: [
      "courseType",
      "activeStatus",
      "rentalPilotStatus",
      "pilotLicenseType",
    ],
  },
  {
    title: "정비/문서 연동",
    description: "대시보드의 점검 임박, 문서 만료 임박 항목과 연결됩니다.",
    keys: [
      "maintenanceType",
      "maintenanceStatus",
      "documentType",
      "documentTargetType",
      "documentStatus",
    ],
  },
  {
    title: "운영 확장 연동",
    description: "교관 스케줄과 쿠폰/할인 관리에서 사용됩니다.",
    keys: [
      "instructorScheduleStatus",
      "discountType",
      "couponTargetType",
      "couponStatus",
    ],
  },
];

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

function getKeyLabel(key: string) {
  return keyLabels[key] || key;
}

function getSortIndex(key: string) {
  const index = defaultKeys.indexOf(key);
  return index === -1 ? 999 : index;
}

function hasSettingKey(settings: SettingRow[], key: string) {
  return settings.some(
    (item) => String(item.key || "") === key && String(item.value || "").trim(),
  );
}

function countSettingKey(settings: SettingRow[], key: string) {
  return settings.filter(
    (item) => String(item.key || "") === key && String(item.value || "").trim(),
  ).length;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [form, setForm] = useState<SettingForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keyFilter, setKeyFilter] = useState("전체");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/settings", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "설정 데이터를 불러오지 못했습니다.");
      }

      setSettings(Array.isArray(data.settings) ? data.settings : []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "설정 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const settingKeys = useMemo(() => {
    const keySet = new Set(defaultKeys);

    settings.forEach((item) => {
      if (item.key) {
        keySet.add(String(item.key));
      }
    });

    return Array.from(keySet).sort((a, b) => {
      const sortCompare = getSortIndex(a) - getSortIndex(b);

      if (sortCompare !== 0) {
        return sortCompare;
      }

      return a.localeCompare(b, "ko");
    });
  }, [settings]);

  const filteredSettings = useMemo(() => {
    const trimmedKeyword = keyword.trim().toLowerCase();

    return settings
      .filter((item) => {
        const itemKey = String(item.key || "");

        if (keyFilter !== "전체" && itemKey !== keyFilter) {
          return false;
        }

        if (!trimmedKeyword) {
          return true;
        }

        const target = [item.key, item.value, item.memo]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        return target.includes(trimmedKeyword);
      })
      .sort((a, b) => {
        const keyCompare =
          getSortIndex(String(a.key || "")) - getSortIndex(String(b.key || ""));

        if (keyCompare !== 0) {
          return keyCompare;
        }

        const rowA = Number(a.rowNumber || 0);
        const rowB = Number(b.rowNumber || 0);

        return rowA - rowB;
      });
  }, [settings, keyword, keyFilter]);

  const groupedSettings = useMemo(() => {
    return filteredSettings.reduce<Record<string, SettingRow[]>>(
      (acc, item) => {
        const itemKey = String(item.key || "미분류");

        if (!acc[itemKey]) {
          acc[itemKey] = [];
        }

        acc[itemKey].push(item);
        return acc;
      },
      {},
    );
  }, [filteredSettings]);

  function updateForm<K extends keyof SettingForm>(
    key: K,
    value: SettingForm[K],
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function startEdit(item: SettingRow) {
    setForm({
      rowNumber: formValue(item.rowNumber),
      key: formValue(item.key) || "bookingStatus",
      value: formValue(item.value),
      memo: formValue(item.memo),
    });

    setSuccessMessage("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.key.trim()) {
      setErrorMessage("key를 입력하세요.");
      return;
    }

    if (!form.value.trim()) {
      setErrorMessage("value를 입력하세요.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const mode = form.rowNumber ? "update" : "add";
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          data: form,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "설정 저장에 실패했습니다.");
      }

      setSuccessMessage(
        mode === "add" ? "설정이 추가되었습니다." : "설정이 수정되었습니다.",
      );
      setForm(emptyForm);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "설정 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Settings</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">설정관리</h1>
            <p className="mt-2 text-sm text-slate-500">
              기존 settings 시트 구조인 key, value, memo 형식을 그대로 사용하며,
              전체 페이지의 드롭다운 기준값을 점검합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            새로고침
          </button>
        </div>

        {(errorMessage || successMessage) && (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm font-medium ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                settings 연동 점검
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                현재 만든 운영 페이지들이 참조하는 key가 settings 시트에 있는지
                확인합니다. 빠진 key가 있어도 기본값으로 동작하지만, 시트에
                추가하면 드롭다운이 통일됩니다.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              key/value/memo 구조
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            {integrationGroups.map((group) => {
              const missingKeys = group.keys.filter(
                (key) => !hasSettingKey(settings, key),
              );

              return (
                <div
                  key={group.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900">
                        {group.title}
                      </h3>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        {group.description}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${missingKeys.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {missingKeys.length
                        ? `${missingKeys.length}개 누락`
                        : "정상"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {group.keys.map((key) => {
                      const count = countSettingKey(settings, key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setKeyFilter(key);
                            setKeyword("");
                          }}
                          className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-xs font-bold ring-1 ring-slate-200 hover:bg-slate-100"
                        >
                          <span className="text-slate-700">
                            {getKeyLabel(key)}
                          </span>
                          <span
                            className={
                              count ? "text-emerald-600" : "text-amber-600"
                            }
                          >
                            {count || "없음"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {form.rowNumber ? "설정 수정" : "설정 추가"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                예약 상태, 예약 유형, 결제 상태 등 반복되는 값은 같은 key로 여러
                줄 등록하면 됩니다.
              </p>
            </div>

            {form.rowNumber && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                새 항목 작성
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                key
              </label>
              <input
                list="setting-keys"
                value={form.key}
                onChange={(event) => updateForm("key", event.target.value)}
                placeholder="예: bookingStatus"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
              <datalist id="setting-keys">
                {settingKeys.map((key) => (
                  <option key={key} value={key} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                value
              </label>
              <input
                value={form.value}
                onChange={(event) => updateForm("value", event.target.value)}
                placeholder="예: 확정"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                memo
              </label>
              <input
                value={form.memo}
                onChange={(event) => updateForm("memo", event.target.value)}
                placeholder="예: 예약 상태"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex items-end md:col-span-6">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving
                  ? "저장 중..."
                  : form.rowNumber
                    ? "수정 저장"
                    : "설정 추가"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">설정 목록</h2>
              <p className="mt-1 text-sm text-slate-500">
                총 {settings.length}개 중 {filteredSettings.length}개 표시
              </p>
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <select
                value={keyFilter}
                onChange={(event) => setKeyFilter(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-900"
              >
                <option value="전체">전체 key</option>
                {settingKeys.map((key) => (
                  <option key={key} value={key}>
                    {getKeyLabel(key)} / {key}
                  </option>
                ))}
              </select>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="검색"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              설정 데이터를 불러오는 중입니다.
            </div>
          ) : filteredSettings.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              표시할 설정이 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSettings).map(([key, items]) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-2xl border border-slate-200"
                >
                  <div className="flex items-center justify-between bg-slate-100 px-4 py-3">
                    <div>
                      <h3 className="font-bold text-slate-900">
                        {getKeyLabel(key)}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {key}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {items.length}개
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-white text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">value</th>
                          <th className="px-4 py-3">memo</th>
                          <th className="px-4 py-3">행 번호</th>
                          <th className="px-4 py-3 text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {items.map((item, index) => (
                          <tr key={String(item.rowNumber || `${key}-${index}`)}>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {text(item.value)}
                            </td>
                            <td className="max-w-md px-4 py-3 text-slate-500">
                              {text(item.memo)}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {text(item.rowNumber)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                수정
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
