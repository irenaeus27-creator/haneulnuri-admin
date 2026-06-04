"use client";

import { useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";

type WeatherData = {
  ok: boolean;
  source?: string;
  current?: {
    time?: string;
    temperature?: number;
    apparentTemperature?: number;
    humidity?: number;
    precipitation?: number;
    rain?: number;
    weatherText?: string;
    pressureMsl?: number;
    windSpeed?: number;
    windDirection?: number;
    windGust?: number;
  } | null;
  runway?: { label: string; heading: number } | null;
  windComponents?: { headwind: number; crosswind: number; tailwind: number } | null;
  decision?: { label: string; tone: string; message: string } | null;
  hourly?: {
    time: string;
    temperature: number;
    windSpeed: number;
    windGust: number;
    windDirection?: number;
    precipitation?: number;
    cloudCover?: number;
    missing?: boolean;
  }[];
  message?: string;
};

function weatherToneClass(tone?: string) {
  if (tone === "emerald") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "border-amber-100 bg-amber-50 text-amber-700";
  if (tone === "rose") return "border-rose-100 bg-rose-50 text-rose-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

function numberText(value: unknown, suffix = "") {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return `-${suffix}`;
  return `${Math.round(numberValue)}${suffix}`;
}

function formatWeatherTime(value?: string) {
  if (!value) return "-";
  return value.replace("T", " ").slice(11, 16) || value;
}

function useWeather(initialWeather?: WeatherData) {
  const [weather, setWeather] = useState<WeatherData | undefined>(initialWeather);
  const [loading, setLoading] = useState(!initialWeather?.ok);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let retryTimer1: ReturnType<typeof setTimeout> | null = null;
    let retryTimer2: ReturnType<typeof setTimeout> | null = null;

    async function load(force = false) {
      try {
        if (!force && weather?.ok && weather.current) return;

        setLoading(true);
        const response = await fetch(`/api/weather/open-meteo?_ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) throw new Error(`날씨 API 오류: ${response.status}`);

        const data = (await response.json()) as WeatherData;
        if (!alive) return;

        if (data.ok && data.current) {
          setWeather(data);
          setError("");
        } else {
          setWeather(data);
          setError(data.message || "날씨 정보를 불러오지 못했습니다.");
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "날씨 정보를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    function reloadWhenVisible() {
      if (document.visibilityState === "visible") {
        load(true);
      }
    }

    function reloadWhenFocused() {
      load(true);
    }

    load(true);

    retryTimer1 = setTimeout(() => {
      if (!weather?.ok) load(true);
    }, 800);

    retryTimer2 = setTimeout(() => {
      if (!weather?.ok) load(true);
    }, 2500);

    document.addEventListener("visibilitychange", reloadWhenVisible);
    window.addEventListener("focus", reloadWhenFocused);

    return () => {
      alive = false;
      if (retryTimer1) clearTimeout(retryTimer1);
      if (retryTimer2) clearTimeout(retryTimer2);
      document.removeEventListener("visibilitychange", reloadWhenVisible);
      window.removeEventListener("focus", reloadWhenFocused);
    };
  }, []);

  return { weather, loading, error };
}

export function DashboardWeatherSummaryClient({ initialWeather }: { initialWeather?: WeatherData }) {
  const { weather, loading, error } = useWeather(initialWeather);
  const current = weather?.current;
  const runway = weather?.runway;
  const components = weather?.windComponents;
  const decision = weather?.decision;

  return (
    <ContentCard className="overflow-hidden p-0">
      <div className="flex items-start justify-between px-5 py-3.5">
        <div>
          <h3 className="text-lg font-bold text-[#10213f]">오늘 기상 요약</h3>
          <p className="mt-1 text-xs font-medium text-[#61758f]">Open-Meteo · 좌표 37.106759, 126.765010</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${weatherToneClass(decision?.tone)}`}>
          {loading ? "불러오는 중" : decision?.label || "확인 필요"}
        </span>
      </div>

      {!weather?.ok || !current ? (
        <div className="mx-5 mb-5 rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
          {loading ? "날씨 정보를 불러오는 중입니다." : error || "날씨 정보를 불러오지 못했습니다."}
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <p className="text-[11px] font-semibold text-blue-700">Active RWY</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{runway?.label || "-"}</p>
              <p className="mt-1 text-xs font-medium text-[#61758f]">활주로 {runway?.heading || "-"}° 기준</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold text-emerald-700">현재 바람</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">{numberText(current.windSpeed, "kt")}</p>
              <p className="mt-1 text-xs font-medium text-[#61758f]">{numberText(current.windDirection, "°")} · 돌풍 {numberText(current.windGust, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">측풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.crosswind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">정풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.headwind, "kt")}</p>
            </div>
            <div className="rounded-[20px] border border-[#e7eef7] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(20,46,80,0.04)]">
              <p className="text-[11px] font-medium text-[#6b7f99]">배풍</p>
              <p className="mt-1 text-lg font-bold text-[#10213f]">{numberText(components?.tailwind, "kt")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기온 {numberText(current.temperature, "℃")} · 체감 {numberText(current.apparentTemperature, "℃")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">습도 {numberText(current.humidity, "%")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">기압 {numberText(current.pressureMsl, "hPa")}</div>
            <div className="rounded-xl bg-[#f8fbff] px-3 py-2 font-semibold text-[#405875]">강수 {Number(current.precipitation || current.rain || 0).toFixed(1)}mm</div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#dbe5f1] bg-[#fbfdff] p-3">
            <p className="text-xs font-bold text-[#10213f]">{current.weatherText || "-"} · {decision?.message}</p>
            <p className="mt-1 text-[11px] font-medium text-[#7b8da5]">업데이트 {formatWeatherTime(current.time)}</p>
          </div>
        </div>
      )}
    </ContentCard>
  );
}

function smooth(points: { x: number; y: number }[]) {
  if (points.length < 2) return points[0] ? `M ${points[0].x} ${points[0].y}` : "";

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function WeatherChart({ title, unit, rows, series }: {
  title: string;
  unit: string;
  rows: { label: string; [key: string]: number | string }[];
  series: { key: string; label: string; stroke: string }[];
}) {
  const width = 760;
  const height = 470;
  const pad = { top: 30, right: 24, bottom: 72, left: 84 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key] || 0)));
  const max = Math.max(5, Math.ceil(Math.max(...values, 1) / 5) * 5);
  const ticks = Array.from({ length: Math.floor(max / 5) + 1 }, (_, i) => i * 5);

  const xAt = (i: number) => pad.left + (i / Math.max(rows.length - 1, 1)) * w;
  const yAt = (v: number) => pad.top + h - (v / max) * h;
  const pts = (key: string) => rows.map((row, i) => ({ x: xAt(i), y: yAt(Number(row[key] || 0)) }));

  return (
    <div className="rounded-[22px] border border-[#dfe8f5] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(20,46,80,0.05)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[18px] font-bold text-[#10213f]">{title}</p>
        <div className="flex items-center gap-2">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[14px] font-bold text-[#31455f] shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.stroke }} />
              {item.label} {Number(rows[rows.length - 1]?.[item.key] || 0)}
            </span>
          ))}
          <span className="text-[16px] font-bold text-[#263b55]">{unit}</span>
        </div>
      </div>

      <div className="rounded-[18px] border border-[#edf2f7] bg-white/90 px-3 py-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="#eef3f8" strokeDasharray="3 4" />
              <text x={pad.left - 14} y={yAt(tick) + 7} textAnchor="end" fill="#263b55" fontSize="22" fontWeight="850">{tick}</text>
            </g>
          ))}

          {rows.map((row, i) => (
            <g key={row.label}>
              <line x1={xAt(i)} x2={xAt(i)} y1={pad.top} y2={pad.top + h} stroke="#f5f8fc" />
              {i % 2 === 0 && row.label !== "20:00" ? (
                <text x={xAt(i)} y={height - 18} textAnchor="middle" fill="#263b55" fontSize="22" fontWeight="850">{row.label}</text>
              ) : null}
            </g>
          ))}

          {series.map((item) => (
            <g key={item.key}>
              <path d={smooth(pts(item.key))} fill="none" stroke={item.stroke} strokeWidth="4" strokeLinecap="round" />
              {pts(item.key).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke={item.stroke} strokeWidth="3" />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function DashboardWeatherDetailClient({ initialWeather }: { initialWeather?: WeatherData }) {
  const { weather, loading, error } = useWeather(initialWeather);

  const rows = useMemo(() => {
    const hourly = weather?.hourly || [];
    const map = new Map(hourly.map((item) => [Number(String(item.time).slice(11, 13)), item]));
    return Array.from({ length: 14 }, (_, index) => {
      const hour = index + 7;
      const row = map.get(hour);
      return {
        label: `${String(hour).padStart(2, "0")}:00`,
        windSpeed: Math.round(Number(row?.windSpeed || 0)),
        windGust: Math.round(Number(row?.windGust || 0)),
        temperature: Math.round(Number(row?.temperature || 0)),
      };
    });
  }, [weather]);

  const hasRows = Boolean(weather?.ok && weather?.hourly?.some((item) => !item.missing));

  return (
    <ContentCard className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[24px] border border-[#d9e6f5] bg-white/95 p-0 shadow-[0_18px_50px_rgba(20,46,80,0.08)]">
      <div className="flex shrink-0 items-center justify-between px-5 py-3.5">
        <div>
          <h3 className="text-[18px] font-bold text-[#10213f]">시간별 기상 그래프</h3>
          <p className="mt-0.5 text-[13px] font-medium text-[#61758f]">07:00~20:00 전체 시간대 표시</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">Open-Meteo</span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4">
        {!hasRows ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#dbe5f1] bg-[#f8fbff] p-5 text-sm font-medium text-[#6f8199]">
            {loading ? "07:00~20:00 기상 정보를 불러오는 중입니다." : error || "07:00~20:00 기상 정보를 불러오지 못했습니다."}
          </div>
        ) : (
          <div className="grid gap-3">
            <WeatherChart
              title="풍속·돌풍 변화"
              unit="kt"
              rows={rows}
              series={[
                { key: "windSpeed", label: "풍속", stroke: "#2563eb" },
                { key: "windGust", label: "돌풍", stroke: "#f59e0b" },
              ]}
            />
            <WeatherChart
              title="기온 변화"
              unit="℃"
              rows={rows}
              series={[
                { key: "temperature", label: "기온", stroke: "#f43f5e" },
              ]}
            />
          </div>
        )}
      </div>
    </ContentCard>
  );
}
