import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AIRFIELD_LAT = 37.106759;
const AIRFIELD_LON = 126.765010;
const RUNWAY_32 = 320;
const RUNWAY_14 = 140;

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  apparent_temperature?: number;
  precipitation?: number;
  rain?: number;
  weather_code?: number;
  cloud_cover?: number;
  pressure_msl?: number;
  surface_pressure?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  wind_gusts_10m?: number;
};

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: number[];
  precipitation?: number[];
  cloud_cover?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  wind_gusts_10m?: number[];
};

type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
};

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function angularDifference(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return diff > 180 ? 360 - diff : diff;
}

function chooseActiveRunway(windDirection: number) {
  const diff32 = angularDifference(windDirection, RUNWAY_32);
  const diff14 = angularDifference(windDirection, RUNWAY_14);
  return diff32 <= diff14 ? { label: "32", heading: RUNWAY_32 } : { label: "14", heading: RUNWAY_14 };
}

function calculateWindComponents(windDirection: number, windSpeed: number, runwayHeading: number) {
  const diff = normalizeAngle(windDirection - runwayHeading);
  const radians = (diff * Math.PI) / 180;
  const headwind = windSpeed * Math.cos(radians);
  const crosswind = Math.abs(windSpeed * Math.sin(radians));

  return {
    headwind: Math.round(headwind),
    crosswind: Math.round(crosswind),
    tailwind: headwind < 0 ? Math.round(Math.abs(headwind)) : 0,
  };
}

function weatherCodeText(code: number) {
  const map: Record<number, string> = {
    0: "맑음",
    1: "대체로 맑음",
    2: "부분 흐림",
    3: "흐림",
    45: "안개",
    48: "착빙성 안개",
    51: "약한 이슬비",
    53: "이슬비",
    55: "강한 이슬비",
    61: "약한 비",
    63: "비",
    65: "강한 비",
    71: "약한 눈",
    73: "눈",
    75: "강한 눈",
    80: "약한 소나기",
    81: "소나기",
    82: "강한 소나기",
    95: "뇌우",
    96: "우박 동반 뇌우",
    99: "강한 우박 동반 뇌우",
  };

  return map[code] || `코드 ${code}`;
}

function flightDecision({
  crosswind,
  tailwind,
  gust,
  precipitation,
  weatherCode,
}: {
  crosswind: number;
  tailwind: number;
  gust: number;
  precipitation: number;
  weatherCode: number;
}) {
  if (weatherCode === 45 || weatherCode === 48 || weatherCode >= 95 || gust >= 25 || crosswind >= 15 || tailwind >= 8 || precipitation >= 3) {
    return {
      label: "제한",
      tone: "rose",
      message: "운항 전 기상 확인과 교관 판단이 필요합니다.",
    };
  }

  if (gust >= 18 || crosswind >= 10 || tailwind >= 4 || precipitation > 0) {
    return {
      label: "주의",
      tone: "amber",
      message: "풍속·돌풍·강수 변화를 계속 확인하세요.",
    };
  }

  return {
    label: "양호",
    tone: "emerald",
    message: "현재 기준 운항 조건이 비교적 양호합니다.",
  };
}

function todayKstDateText() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pickOperatingHourly(hourly: OpenMeteoHourly | undefined) {
  if (!hourly?.time?.length) return [];

  const allRows = hourly.time
    .map((time, index) => ({
      time,
      date: time.slice(0, 10),
      hour: Number(time.slice(11, 13)),
      temperature: toNumber(hourly.temperature_2m?.[index]),
      windSpeed: toNumber(hourly.wind_speed_10m?.[index]),
      windDirection: toNumber(hourly.wind_direction_10m?.[index]),
      windGust: toNumber(hourly.wind_gusts_10m?.[index]),
      precipitation: toNumber(hourly.precipitation?.[index]),
      cloudCover: toNumber(hourly.cloud_cover?.[index]),
    }))
    .filter((item) => item.hour >= 7 && item.hour <= 20);

  const today = todayKstDateText();
  const todayRows = allRows.filter((item) => item.date === today);

  let selectedRows = todayRows;

  if (selectedRows.length < 6) {
    const dateCounts = allRows.reduce<Record<string, number>>((acc, item) => {
      acc[item.date] = (acc[item.date] || 0) + 1;
      return acc;
    }, {});

    const bestDate = Object.entries(dateCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

    selectedRows = bestDate ? allRows.filter((item) => item.date === bestDate) : todayRows;
  }

  const byHour = new Map(selectedRows.map((item) => [item.hour, item]));

  return Array.from({ length: 14 }, (_, index) => {
    const hour = index + 7;
    const existing = byHour.get(hour);

    if (existing) return existing;

    const date = selectedRows[0]?.date || today;

    return {
      time: `${date}T${String(hour).padStart(2, "0")}:00`,
      date,
      hour,
      temperature: 0,
      windSpeed: 0,
      windDirection: 0,
      windGust: 0,
      precipitation: 0,
      cloudCover: 0,
      missing: true,
    };
  });
}

export async function GET() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(AIRFIELD_LAT));
    url.searchParams.set("longitude", String(AIRFIELD_LON));
    url.searchParams.set("timezone", "Asia/Seoul");
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("wind_speed_unit", "kn");
    url.searchParams.set(
      "current",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation",
        "rain",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "surface_pressure",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
    );
    url.searchParams.set(
      "hourly",
      [
        "temperature_2m",
        "precipitation",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
    );

    const response = await fetch(url.toString(), {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo API 오류: ${response.status}`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current || {};
    const windDirection = toNumber(current.wind_direction_10m);
    const windSpeed = toNumber(current.wind_speed_10m);
    const runway = chooseActiveRunway(windDirection);
    const windComponents = calculateWindComponents(windDirection, windSpeed, runway.heading);
    const weatherCode = Math.round(toNumber(current.weather_code));
    const decision = flightDecision({
      crosswind: windComponents.crosswind,
      tailwind: windComponents.tailwind,
      gust: toNumber(current.wind_gusts_10m),
      precipitation: toNumber(current.precipitation),
      weatherCode,
    });

    return NextResponse.json({
      ok: true,
      source: "Open-Meteo",
      location: {
        latitude: AIRFIELD_LAT,
        longitude: AIRFIELD_LON,
      },
      current: {
        time: current.time || "",
        temperature: toNumber(current.temperature_2m),
        apparentTemperature: toNumber(current.apparent_temperature),
        humidity: Math.round(toNumber(current.relative_humidity_2m)),
        precipitation: toNumber(current.precipitation),
        rain: toNumber(current.rain),
        weatherCode,
        weatherText: weatherCodeText(weatherCode),
        cloudCover: Math.round(toNumber(current.cloud_cover)),
        pressureMsl: Math.round(toNumber(current.pressure_msl)),
        surfacePressure: Math.round(toNumber(current.surface_pressure)),
        windSpeed: Math.round(windSpeed),
        windDirection: Math.round(windDirection),
        windGust: Math.round(toNumber(current.wind_gusts_10m)),
      },
      runway,
      windComponents,
      decision,
      hourly: pickOperatingHourly(data.hourly),
    });
  } catch (error) {
    console.error("[weather open-meteo error]", error);

    return NextResponse.json(
      {
        ok: false,
        source: "Open-Meteo",
        message: error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다.",
        current: null,
        runway: null,
        windComponents: null,
        decision: {
          label: "확인 필요",
          tone: "slate",
          message: "날씨 정보를 불러오지 못했습니다.",
        },
        hourly: [],
      },
      { status: 200 },
    );
  }
}
