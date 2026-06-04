"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import ContentCard from "@/components/ContentCard";
import { formatKstDate as sharedFormatKstDate } from "@/lib/formatDateTime";

type CouponRow = {
  couponId?: string;
  couponName?: string;
  discountType?: string;
  discountValue?: string | number;
  targetType?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SettingRow = {
  key?: string;
  value?: string;
  memo?: string;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  discountCoupons?: CouponRow[];
  settings?: SettingRow[];
};

const emptyForm: CouponRow = {
  couponId: "",
  couponName: "",
  discountType: "금액할인",
  discountValue: 0,
  targetType: "전체",
  startDate: "",
  endDate: "",
  status: "활성",
  memo: "",
};

const fallbackDiscountTypes = ["금액할인", "비율할인"];
const fallbackTargetTypes = ["전체", "체험비행", "교육비행", "렌탈비행", "자가비행", "기타"];
const fallbackStatusValues = ["활성", "대기", "종료", "중지"];

function valueText(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const number = Number(valueText(value).replace(/,/g, ""));

  if (Number.isNaN(number)) {
    return 0;
  }

  return number;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function settingValues(settings: SettingRow[], key: string, fallback: string[]) {
  const values = settings
    .filter((item) => valueText(item.key) === key)
    .map((item) => valueText(item.value));

  return uniqueValues([...values, ...fallback]);
}

function normalizeCoupon(row: CouponRow): CouponRow {
  return {
    ...row,
    couponId: valueText(row.couponId),
    couponName: valueText(row.couponName),
    discountType: valueText(row.discountType) || "금액할인",
    discountValue: numberValue(row.discountValue),
    targetType: valueText(row.targetType) || "전체",
    startDate: sharedFormatKstDate(row.startDate) === "-" ? "" : sharedFormatKstDate(row.startDate),
    endDate: sharedFormatKstDate(row.endDate) === "-" ? "" : sharedFormatKstDate(row.endDate),
    status: valueText(row.status) || "활성",
    memo: valueText(row.memo),
  };
}

function formatDiscount(row: CouponRow) {
  const value = numberValue(row.discountValue);

  if (!value) {
    return "-";
  }

  if (valueText(row.discountType) === "비율할인") {
    return `${value}%`;
  }

  return value.toLocaleString("ko-KR") + "원";
}

function dateStatus(row: CouponRow) {
  const startDate = valueText(row.startDate);
  const endDate = valueText(row.endDate);
  const today = todayText();

  if (startDate && today < startDate) {
    return "시작 전";
  }

  if (endDate && today > endDate) {
    return "기간종료";
  }

  return "기간중";
}

function statusBadgeClass(status: string) {
  if (status === "활성") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "대기" || status === "시작 전") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (status === "종료" || status === "기간종료") {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }

  if (status === "중지") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

export default function DiscountCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [form, setForm] = useState<CouponRow>(emptyForm);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [targetFilter, setTargetFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");

  const discountTypes = useMemo(
    () => settingValues(settings, "discountType", fallbackDiscountTypes),
    [settings]
  );

  const targetTypes = useMemo(
    () => settingValues(settings, "couponTargetType", fallbackTargetTypes),
    [settings]
  );

  const statusValues = useMemo(
    () => settingValues(settings, "couponStatus", fallbackStatusValues),
    [settings]
  );

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/discount-coupons", {
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "쿠폰/할인 데이터를 불러오지 못했습니다.");
      }

      setCoupons((data.discountCoupons || []).map(normalizeCoupon));
      setSettings(data.settings || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "쿠폰/할인 데이터를 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredCoupons = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return coupons
      .filter((item) => {
        if (targetFilter !== "전체" && valueText(item.targetType) !== targetFilter) {
          return false;
        }

        if (statusFilter !== "전체" && valueText(item.status) !== statusFilter) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        const target = [
          item.couponId,
          item.couponName,
          item.discountType,
          item.targetType,
          item.status,
          item.memo,
        ]
          .map(valueText)
          .join(" ")
          .toLowerCase();

        return target.includes(keyword);
      })
      .sort((a, b) => {
        const endA = valueText(a.endDate) || "9999-12-31";
        const endB = valueText(b.endDate) || "9999-12-31";

        if (endA !== endB) {
          return endA.localeCompare(endB);
        }

        return valueText(a.couponName).localeCompare(valueText(b.couponName), "ko");
      });
  }, [coupons, searchText, targetFilter, statusFilter]);

  const activeCount = coupons.filter((item) => valueText(item.status) === "활성").length;
  const periodActiveCount = coupons.filter((item) => dateStatus(item) === "기간중").length;
  const expiredCount = coupons.filter((item) => dateStatus(item) === "기간종료").length;

  function updateFormField(key: keyof CouponRow, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setSelectedId("");
    setForm({
      ...emptyForm,
      discountType: discountTypes[0] || "금액할인",
      targetType: targetTypes[0] || "전체",
      status: statusValues[0] || "활성",
    });
    setSuccessMessage("");
    setErrorMessage("");
  }

  function selectCoupon(item: CouponRow) {
    const normalized = normalizeCoupon(item);
    setSelectedId(normalized.couponId || "");
    setForm(normalized);
    setSuccessMessage("");
    setErrorMessage("");

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!valueText(form.couponName)) {
        throw new Error("쿠폰/할인명을 입력해 주세요.");
      }

      if (numberValue(form.discountValue) <= 0) {
        throw new Error("할인값은 0보다 커야 합니다.");
      }

      if (valueText(form.discountType) === "비율할인" && numberValue(form.discountValue) > 100) {
        throw new Error("비율할인은 100% 이하로 입력해 주세요.");
      }

      if (valueText(form.startDate) && valueText(form.endDate) && valueText(form.startDate) > valueText(form.endDate)) {
        throw new Error("종료일은 시작일 이후여야 합니다.");
      }

      const payload = {
        ...form,
        couponId: selectedId || form.couponId || "",
        discountValue: numberValue(form.discountValue),
      };

      const response = await fetch("/api/discount-coupons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: selectedId ? "update" : "add",
          data: payload,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "쿠폰/할인 정보를 저장하지 못했습니다.");
      }

      setSuccessMessage(selectedId ? "쿠폰/할인 정보가 수정되었습니다." : "쿠폰/할인 정보가 등록되었습니다.");
      resetForm();
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "쿠폰/할인 정보를 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer
      title="쿠폰/할인관리"
      description="체험비행, 교육비, 렌탈 등에 적용할 할인 기준을 관리합니다."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <ContentCard title="전체 할인">
          <p className="text-3xl font-bold text-slate-900">{coupons.length}</p>
          <p className="mt-1 text-sm text-slate-500">등록된 할인 기준</p>
        </ContentCard>
        <ContentCard title="활성 상태">
          <p className="text-3xl font-bold text-emerald-600">{activeCount}</p>
          <p className="mt-1 text-sm text-slate-500">상태값 활성</p>
        </ContentCard>
        <ContentCard title="기간 중">
          <p className="text-3xl font-bold text-sky-600">{periodActiveCount}</p>
          <p className="mt-1 text-sm text-slate-500">오늘 기준 사용 가능 기간</p>
        </ContentCard>
        <ContentCard title="기간 종료">
          <p className="text-3xl font-bold text-slate-500">{expiredCount}</p>
          <p className="mt-1 text-sm text-slate-500">종료일 경과</p>
        </ContentCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <ContentCard title={selectedId ? "쿠폰/할인 수정" : "쿠폰/할인 등록"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedId ? (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">할인 ID</label>
                <input
                  value={selectedId}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">쿠폰/할인명</label>
              <input
                value={valueText(form.couponName)}
                onChange={(event) => updateFormField("couponName", event.target.value)}
                placeholder="예: 체험비행 프로모션 10만원 할인"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">할인 방식</label>
                <select
                  value={valueText(form.discountType)}
                  onChange={(event) => updateFormField("discountType", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {discountTypes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">할인값</label>
                <input
                  type="number"
                  value={valueText(form.discountValue)}
                  onChange={(event) => updateFormField("discountValue", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">적용 대상</label>
                <select
                  value={valueText(form.targetType)}
                  onChange={(event) => updateFormField("targetType", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {targetTypes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">상태</label>
                <select
                  value={valueText(form.status)}
                  onChange={(event) => updateFormField("status", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {statusValues.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">시작일</label>
                <input
                  type="date"
                  value={valueText(form.startDate)}
                  onChange={(event) => updateFormField("startDate", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">종료일</label>
                <input
                  type="date"
                  value={valueText(form.endDate)}
                  onChange={(event) => updateFormField("endDate", event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">메모</label>
              <textarea
                value={valueText(form.memo)}
                onChange={(event) => updateFormField("memo", event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "저장 중..." : selectedId ? "수정 저장" : "신규 등록"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                초기화
              </button>
            </div>
          </form>
        </ContentCard>

        <ContentCard title="쿠폰/할인 목록">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px]">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="할인명, 대상, 메모 검색"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <select
              value={targetFilter}
              onChange={(event) => setTargetFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="전체">대상 전체</option>
              {targetTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="전체">상태 전체</option>
              {statusValues.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              쿠폰/할인 데이터를 불러오는 중입니다.
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              표시할 쿠폰/할인 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">할인명</th>
                    <th className="px-4 py-3">방식</th>
                    <th className="px-4 py-3">대상</th>
                    <th className="px-4 py-3">기간</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCoupons.map((item) => {
                    const period = dateStatus(item);

                    return (
                      <tr key={valueText(item.couponId) || valueText(item.couponName)} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{valueText(item.couponName) || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">{valueText(item.couponId) || "ID 없음"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-700">{valueText(item.discountType) || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDiscount(item)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{valueText(item.targetType) || "전체"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{valueText(item.startDate) || "-"} ~ {valueText(item.endDate) || "-"}</div>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusBadgeClass(period)}`}>
                            {period}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusBadgeClass(valueText(item.status))}`}>
                            {valueText(item.status) || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => selectCoupon(item)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
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
        </ContentCard>
      </div>
    </PageContainer>
  );
}
