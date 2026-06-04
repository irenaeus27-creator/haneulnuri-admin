"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";

export type SheetRow = Record<string, unknown>;

export type SheetColumn = {
  key: string;
  label: string;
  width?: string;
};

export type SheetStat = {
  label: string;
  value: (rows: SheetRow[]) => number | string;
  colorClass?: string;
};

export type SheetFilter = {
  key: string;
  label: string;
  allLabel: string;
};

type SimpleSheetPageProps = {
  title: string;
  description: string;
  sheetName: string;
  columns: SheetColumn[];
  stats: SheetStat[];
  filters?: SheetFilter[];
  searchPlaceholder?: string;
};

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatCellValue(value: unknown) {
  const raw = text(value, "");

  if (!raw) return "-";
  if (raw.length > 120) return `${raw.slice(0, 120)}...`;
  return raw;
}

function uniqueValues(rows: SheetRow[], key: string) {
  const values = rows
    .map((row) => text(row[key], ""))
    .filter((value) => value !== "");

  return Array.from(new Set(values));
}

export default function SimpleSheetPage({
  title,
  description,
  sheetName,
  columns,
  stats,
  filters = [],
  searchPlaceholder = "검색어를 입력하세요",
}: SimpleSheetPageProps) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};

    filters.forEach((filter) => {
      initial[filter.key] = "전체";
    });

    return initial;
  });

  const loadRows = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheetName)}`, {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      let data: { ok?: boolean; message?: string; rows?: SheetRow[] };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "데이터를 불러오지 못했습니다.");
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sheetName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      for (const filter of filters) {
        const selected = filterValues[filter.key] || "전체";
        if (selected !== "전체" && text(row[filter.key], "") !== selected) return false;
      }

      if (!q) return true;

      const searchText = Object.values(row)
        .map((value) => text(value, ""))
        .join(" ")
        .toLowerCase();

      return searchText.includes(q);
    });
  }, [rows, keyword, filters, filterValues]);

  return (
    <PageContainer title={title} description={description}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <ContentCard key={stat.label} className="p-5">
            <p className="text-sm font-black text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-3xl font-black tracking-tight ${stat.colorClass || "text-slate-900"}`}>
              {stat.value(rows)}
            </p>
          </ContentCard>
        ))}
      </div>

      <ContentCard className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          {filters.map((filter) => (
            <label key={filter.key} className="flex min-w-[180px] flex-col gap-1">
              <span className="text-xs font-black text-slate-400">{filter.label}</span>
              <select
                value={filterValues[filter.key] || "전체"}
                onChange={(event) =>
                  setFilterValues((prev) => ({
                    ...prev,
                    [filter.key]: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-300"
              >
                <option value="전체">{filter.allLabel}</option>
                {uniqueValues(rows, filter.key).map((value) => (
                  <option key={`${filter.key}-${value}`} value={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}

          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="text-xs font-black text-slate-400">검색</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300"
            />
          </label>

          <button
            type="button"
            onClick={() => void loadRows(true)}
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={loading}
          >
            {loading ? "불러오는 중" : "새로고침"}
          </button>
        </div>
      </ContentCard>

      {error ? (
        <ContentCard className="border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-900">{title} 목록</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">Google Spreadsheet의 {sheetName} 시트 기준으로 표시됩니다.</p>
          </div>
          <div className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-500">표시 {filteredRows.length}건</div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold text-slate-400">데이터를 불러오는 중입니다.</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-sm font-bold text-slate-400">표시할 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-[12px] font-black text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-5 py-3.5" style={{ width: column.width }}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, index) => (
                  <tr key={`${sheetName}-${index}`} className="transition hover:bg-slate-50/80">
                    {columns.map((column) => (
                      <td key={`${sheetName}-${index}-${column.key}`} className="px-5 py-4 align-top text-slate-700">
                        <div className="max-w-md whitespace-pre-line leading-relaxed">{formatCellValue(row[column.key])}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>
    </PageContainer>
  );
}
