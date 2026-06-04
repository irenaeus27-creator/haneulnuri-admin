export type SettingLikeRow = Record<string, unknown>;

const CANONICAL_SETTING_VALUES: Record<string, Record<string, string>> = {
  aircraftStatus: {
    운항가능: "운항 가능",
    사용가능: "운항 가능",
    가능: "운항 가능",
    점검중: "점검 중",
    점검: "점검 중",
    정비중: "정비 중",
    정비: "정비 중",
    정비대기: "정비 대기",
    정비예정: "정비 대기",
    예약불가: "예약 불가",
    운항불가: "예약 불가",
    비활성: "비활성",
  },
  bookingStatus: {
    요청: "요청",
    예약요청: "요청",
    확정: "확정",
    예정: "예정",
    완료: "완료",
    취소: "취소",
    기상취소: "기상취소",
    노쇼: "노쇼",
    반려: "반려",
    취소요청: "취소요청",
  },
  bookingType: {
    체험비행: "체험비행",
    체험: "체험비행",
    교육비행: "교육비행",
    비행교육: "교육비행",
    교육: "교육비행",
    렌탈비행: "렌탈비행",
    렌탈: "렌탈비행",
    자가비행: "자가비행",
    자가: "자가비행",
    정비: "정비",
    점검: "정비",
    기타: "기타",
  },
  paymentStatus: {
    미결제: "미결제",
    결제대기: "미결제",
    결제완료: "결제완료",
    완료: "결제완료",
    부분결제: "부분결제",
    환불: "환불",
    환불완료: "환불",
  },
  trainingStatus: {
    교육중: "교육중",
    교육: "교육중",
    수료: "수료",
    완료: "수료",
    중단: "중단",
    보류: "보류",
  },
};

const ORDERED_SETTING_VALUES: Record<string, string[]> = {
  aircraftStatus: ["운항 가능", "점검 중", "정비 대기", "정비 중", "예약 불가", "비활성"],
  bookingStatus: ["요청", "확정", "예정", "완료", "취소", "기상취소", "노쇼", "반려", "취소요청"],
  bookingType: ["체험비행", "교육비행", "렌탈비행", "자가비행", "정비", "기타"],
  paymentStatus: ["미결제", "결제완료", "부분결제", "환불"],
  trainingStatus: ["교육중", "수료", "보류", "중단"],
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function compact(value: unknown) {
  return text(value).replace(/\s+/g, "");
}

export function normalizeSettingValue(key: unknown, value: unknown) {
  const rawValue = text(value);
  if (!rawValue) return "";

  const rawKey = text(key);
  const lookupKey = compact(rawValue);
  const dictionary = CANONICAL_SETTING_VALUES[rawKey];

  return dictionary?.[lookupKey] || rawValue;
}

export function settingDedupeKey(row: SettingLikeRow) {
  const key = text(row.key);
  return `${key}::${compact(normalizeSettingValue(key, row.value))}`;
}

export function normalizeSettingsRows(rows: SettingLikeRow[]) {
  const seen = new Set<string>();
  const normalizedRows: SettingLikeRow[] = [];

  rows.forEach((row, index) => {
    const key = text(row.key);
    const value = normalizeSettingValue(key, row.value);

    if (!key || !value) return;

    const dedupeKey = `${key}::${compact(value)}`;
    if (seen.has(dedupeKey)) return;

    seen.add(dedupeKey);
    normalizedRows.push({
      ...row,
      key,
      value,
      memo: text(row.memo),
      rowNumber: Number(row.rowNumber || row._rowNumber || index + 2),
    });
  });

  return normalizedRows.sort((a, b) => {
    const aKey = text(a.key);
    const bKey = text(b.key);

    if (aKey !== bKey) return aKey.localeCompare(bKey, "ko");

    const order = ORDERED_SETTING_VALUES[aKey];
    if (order) {
      const aIndex = order.indexOf(text(a.value));
      const bIndex = order.indexOf(text(b.value));

      if (aIndex !== bIndex) {
        if (aIndex < 0) return 1;
        if (bIndex < 0) return -1;
        return aIndex - bIndex;
      }
    }

    return text(a.value).localeCompare(text(b.value), "ko");
  });
}

export function findDuplicateSettings(rows: SettingLikeRow[]) {
  const groups = new Map<string, SettingLikeRow[]>();

  rows.forEach((row, index) => {
    const key = text(row.key);
    const value = normalizeSettingValue(key, row.value);

    if (!key || !value) return;

    const dedupeKey = `${key}::${compact(value)}`;
    const nextRow = {
      ...row,
      key,
      value,
      originalValue: text(row.value),
      rowNumber: Number(row.rowNumber || row._rowNumber || index + 2),
    };

    groups.set(dedupeKey, [...(groups.get(dedupeKey) || []), nextRow]);
  });

  return Array.from(groups.values()).filter((items) => items.length > 1);
}

export function getSettingOptions(rows: SettingLikeRow[], key: string, fallback: string[] = []) {
  return normalizeSettingsRows([
    ...rows.filter((row) => text(row.key) === key),
    ...fallback.map((value) => ({ key, value, memo: "fallback" })),
  ]).map((row) => text(row.value));
}
