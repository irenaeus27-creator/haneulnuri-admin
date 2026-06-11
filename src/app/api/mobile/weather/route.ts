import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // no-op
}

const SKY_NURI_LAT = 37.106785;
const SKY_NURI_LON = 126.764932;
const MS_TO_KT = 1.9438444924406;

type JsonRecord = Record<string, unknown>;

type WeatherError = {
  provider: string;
  message: string;
};

function text(value: unknown, fallback = "") {
  const result = value == null ? "" : String(value).trim();
  return result || fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function dateParts(date: Date) {
  const updateDate = `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  const updateClock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return { updateDate, updateClock };
}

function round1(value: number) {
  return Number(value.toFixed(1));
}

function toKt(msValue: unknown, fallbackKt = 0) {
  const ms = numberValue(msValue, Number.NaN);
  if (!Number.isFinite(ms)) return fallbackKt;
  return round1(ms * MS_TO_KT);
}

async function fetchJson(url: string, provider: string, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        // MET Norway requires a descriptive User-Agent.
        "user-agent": "SkynuriFlightAcademy/1.0 contact=ceo@skynuri.co.kr",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || typeof data !== "object") {
      throw new Error("응답 형식 오류");
    }
    return data as JsonRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "fetch failed");
    throw new Error(`${provider}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenMeteo(url: string) {
  const candidates = [
    url,
    url.replace("https://api.open-meteo.com", "http://api.open-meteo.com"),
  ];
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return await fetchJson(candidate, candidate.startsWith("https") ? "Open-Meteo https" : "Open-Meteo http", 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "fetch failed");
      errors.push(message);
    }
  }

  throw new Error(errors.join(" / "));
}

function nearestHourlyIndex(times: unknown[], target: Date) {
  let closestIndex = -1;
  let closestMinutes: number | null = null;

  times.forEach((time, index) => {
    const parsed = new Date(String(time));
    if (Number.isNaN(parsed.getTime())) return;
    const diffMinutes = Math.abs(parsed.getTime() - target.getTime()) / 60000;
    if (closestMinutes == null || diffMinutes < closestMinutes) {
      closestMinutes = diffMinutes;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function currentWeatherFromOpenMeteo(data: JsonRecord) {
  const currentWeather = data.current_weather;
  if (!currentWeather || typeof currentWeather !== "object") {
    throw new Error("현재 날씨 응답 형식 오류");
  }

  const current = currentWeather as JsonRecord;
  const hourly = toRecord(data.hourly);
  const times = listValue(hourly.time);
  const hourlyTemps = listValue(hourly.temperature_2m);
  const hourlyHumidity = listValue(hourly.relative_humidity_2m);
  const hourlyPressure = listValue(hourly.pressure_msl);
  const hourlyPrecipitation = listValue(hourly.precipitation);
  const hourlyWeatherCodes = listValue(hourly.weather_code);
  const hourlyWinds = listValue(hourly.wind_speed_10m);
  const hourlyGusts = listValue(hourly.wind_gusts_10m);
  const hourlyWindDirections = listValue(hourly.wind_direction_10m);

  const currentTime = new Date(text(current.time));
  const updateTime = Number.isNaN(currentTime.getTime()) ? new Date() : currentTime;
  const closestIndex = nearestHourlyIndex(times, updateTime);
  const windSpeed = numberValue(current.windspeed);
  const windDirection = Math.round(numberValue(current.winddirection));
  const hourlyDetails: JsonRecord[] = [];

  for (let i = 0; i < times.length; i += 1) {
    const parsed = new Date(String(times[i]));
    if (Number.isNaN(parsed.getTime())) continue;
    const sameDate =
      parsed.getFullYear() === updateTime.getFullYear() &&
      parsed.getMonth() === updateTime.getMonth() &&
      parsed.getDate() === updateTime.getDate();
    const hour = parsed.getHours();
    if (!sameDate || hour < 7 || hour > 20) continue;

    hourlyDetails.push({
      time: `${String(hour).padStart(2, "0")}시`,
      tempC: Math.round(numberValue(hourlyTemps[i], numberValue(current.temperature))),
      windKt: numberValue(hourlyWinds[i], windSpeed),
      gustKt: numberValue(hourlyGusts[i], windSpeed),
      windDeg: Math.round(numberValue(hourlyWindDirections[i], windDirection)),
      precipitationMm: round1(numberValue(hourlyPrecipitation[i])),
      weatherCode: Math.round(numberValue(hourlyWeatherCodes[i], numberValue(current.weathercode))),
    });
  }

  const { updateDate, updateClock } = dateParts(updateTime);

  return {
    source: "Open-Meteo",
    windKt: windSpeed,
    gustKt: closestIndex >= 0 ? numberValue(hourlyGusts[closestIndex], windSpeed) : windSpeed,
    windDeg: windDirection,
    tempC: numberValue(current.temperature),
    humidity: closestIndex >= 0 ? Math.round(numberValue(hourlyHumidity[closestIndex])) : 0,
    pressure: closestIndex >= 0 ? Math.round(numberValue(hourlyPressure[closestIndex])) : 0,
    visibilityKm: 10,
    precipitation: closestIndex >= 0 ? numberValue(hourlyPrecipitation[closestIndex]) : 0,
    cloudBaseFt: null,
    cloudBaseSource: "",
    dewPointC: null,
    metarRemark: "",
    hourly: hourlyDetails,
    updateDate,
    updateClock,
  };
}

function weeklyForecastFromOpenMeteo(data: JsonRecord) {
  const daily = toRecord(data.daily);
  const hourly = toRecord(data.hourly);

  const dates = listValue(daily.time);
  const tempMax = listValue(daily.temperature_2m_max);
  const tempMin = listValue(daily.temperature_2m_min);
  const precipitation = listValue(daily.precipitation_sum);
  const windMax = listValue(daily.wind_speed_10m_max);
  const gustMax = listValue(daily.wind_gusts_10m_max);

  const hourlyTimes = listValue(hourly.time);
  const hourlyTemps = listValue(hourly.temperature_2m);
  const hourlyPrecipitation = listValue(hourly.precipitation);
  const hourlyWeatherCodes = listValue(hourly.weather_code);
  const hourlyWinds = listValue(hourly.wind_speed_10m);
  const hourlyGusts = listValue(hourly.wind_gusts_10m);

  return dates.map((dateValue, index) => {
    const dateKey = String(dateValue);
    const rain = numberValue(precipitation[index]);
    const gust = Math.round(numberValue(gustMax[index]));
    const condition = gust >= 20
      ? "강풍 주의"
      : rain >= 2
        ? "강수 주의"
        : rain > 0
          ? "약한 강수 가능"
          : "비행 가능 조건 양호";
    const hourlyDetails: JsonRecord[] = [];

    for (let i = 0; i < hourlyTimes.length; i += 1) {
      const parsed = new Date(String(hourlyTimes[i]));
      if (Number.isNaN(parsed.getTime())) continue;
      const hourlyDateKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      if (hourlyDateKey !== dateKey) continue;
      const hour = parsed.getHours();
      if (hour < 6 || hour > 21) continue;
      if ((hour - 6) % 3 !== 0) continue;

      hourlyDetails.push({
        time: `${String(hour).padStart(2, "0")}시`,
        tempC: Math.round(numberValue(hourlyTemps[i])),
        windKt: Math.round(numberValue(hourlyWinds[i])),
        gustKt: Math.round(numberValue(hourlyGusts[i])),
        precipitationMm: round1(numberValue(hourlyPrecipitation[i])),
        weatherCode: Math.round(numberValue(hourlyWeatherCodes[i])),
      });
    }

    return {
      source: "Open-Meteo",
      date: dateKey.replaceAll("-", "."),
      dateKey,
      tempMax: Math.round(numberValue(tempMax[index])),
      tempMin: Math.round(numberValue(tempMin[index])),
      precipitationMm: round1(rain),
      windMaxKt: Math.round(numberValue(windMax[index])),
      gustMaxKt: gust,
      condition,
      hourlyDetails,
    };
  });
}

function metTimeseries(data: JsonRecord) {
  const properties = toRecord(data.properties);
  return listValue(properties.timeseries).filter((item) => item && typeof item === "object") as JsonRecord[];
}

async function fetchMetNorway() {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${SKY_NURI_LAT}&lon=${SKY_NURI_LON}`;
  return fetchJson(url, "MET Norway", 4500);
}

function metInstantDetails(item: JsonRecord) {
  const data = toRecord(item.data);
  const instant = toRecord(data.instant);
  return toRecord(instant.details);
}

function metNextDetails(item: JsonRecord, key: "next_1_hours" | "next_6_hours" | "next_12_hours") {
  const data = toRecord(item.data);
  const next = toRecord(data[key]);
  return toRecord(next.details);
}

function metWeatherCode(item: JsonRecord) {
  const data = toRecord(item.data);
  const next1 = toRecord(data.next_1_hours);
  const summary = toRecord(next1.summary);
  const symbol = text(summary.symbol_code);
  if (symbol.includes("thunder")) return 95;
  if (symbol.includes("rain") || symbol.includes("sleet")) return 61;
  if (symbol.includes("snow")) return 71;
  if (symbol.includes("fog")) return 45;
  if (symbol.includes("cloudy")) return 3;
  if (symbol.includes("partlycloudy")) return 2;
  return 0;
}

function currentWeatherFromMetNorway(data: JsonRecord) {
  const series = metTimeseries(data);
  if (series.length === 0) throw new Error("MET Norway 현재 날씨 응답 없음");

  const now = new Date();
  const currentIndex = nearestHourlyIndex(series.map((item) => item.time), now);
  const currentItem = series[Math.max(0, currentIndex)];
  const currentTime = new Date(text(currentItem.time));
  const updateTime = Number.isNaN(currentTime.getTime()) ? now : currentTime;
  const current = metInstantDetails(currentItem);
  const next1 = metNextDetails(currentItem, "next_1_hours");

  const windKt = toKt(current.wind_speed);
  const gustKt = toKt(current.wind_speed_of_gust, windKt);
  const windDeg = Math.round(numberValue(current.wind_from_direction));
  const hourlyDetails: JsonRecord[] = [];

  for (const item of series) {
    const parsed = new Date(text(item.time));
    if (Number.isNaN(parsed.getTime())) continue;
    const sameDate =
      parsed.getFullYear() === updateTime.getFullYear() &&
      parsed.getMonth() === updateTime.getMonth() &&
      parsed.getDate() === updateTime.getDate();
    const hour = parsed.getHours();
    if (!sameDate || hour < 7 || hour > 20) continue;

    const details = metInstantDetails(item);
    const next = metNextDetails(item, "next_1_hours");
    const itemWindKt = toKt(details.wind_speed, windKt);
    hourlyDetails.push({
      time: `${String(hour).padStart(2, "0")}시`,
      tempC: Math.round(numberValue(details.air_temperature)),
      windKt: itemWindKt,
      gustKt: toKt(details.wind_speed_of_gust, itemWindKt),
      windDeg: Math.round(numberValue(details.wind_from_direction, windDeg)),
      precipitationMm: round1(numberValue(next.precipitation_amount)),
      weatherCode: metWeatherCode(item),
    });
  }

  const { updateDate, updateClock } = dateParts(updateTime);

  return {
    source: "MET Norway",
    windKt,
    gustKt,
    windDeg,
    tempC: numberValue(current.air_temperature),
    humidity: Math.round(numberValue(current.relative_humidity)),
    pressure: Math.round(numberValue(current.air_pressure_at_sea_level)),
    visibilityKm: 10,
    precipitation: numberValue(next1.precipitation_amount),
    cloudBaseFt: null,
    cloudBaseSource: "",
    dewPointC: null,
    metarRemark: "",
    hourly: hourlyDetails,
    updateDate,
    updateClock,
  };
}

function weeklyForecastFromMetNorway(data: JsonRecord) {
  const series = metTimeseries(data);
  const byDate = new Map<string, JsonRecord[]>();

  for (const item of series) {
    const parsed = new Date(text(item.time));
    if (Number.isNaN(parsed.getTime())) continue;
    const dateKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)?.push(item);
  }

  return Array.from(byDate.entries()).slice(0, 7).map(([dateKey, items]) => {
    let tempMax = -100;
    let tempMin = 100;
    let windMaxKt = 0;
    let gustMaxKt = 0;
    let precipitationMm = 0;
    const hourlyDetails: JsonRecord[] = [];

    for (const item of items) {
      const parsed = new Date(text(item.time));
      if (Number.isNaN(parsed.getTime())) continue;
      const hour = parsed.getHours();
      const details = metInstantDetails(item);
      const next1 = metNextDetails(item, "next_1_hours");
      const next6 = metNextDetails(item, "next_6_hours");
      const tempC = numberValue(details.air_temperature);
      const windKt = toKt(details.wind_speed);
      const gustKt = toKt(details.wind_speed_of_gust, windKt);
      const rain1 = numberValue(next1.precipitation_amount);
      const rain6 = numberValue(next6.precipitation_amount);

      tempMax = Math.max(tempMax, tempC);
      tempMin = Math.min(tempMin, tempC);
      windMaxKt = Math.max(windMaxKt, windKt);
      gustMaxKt = Math.max(gustMaxKt, gustKt);
      precipitationMm += rain1;

      if (hour >= 6 && hour <= 21 && (hour - 6) % 3 === 0) {
        hourlyDetails.push({
          time: `${String(hour).padStart(2, "0")}시`,
          tempC: Math.round(tempC),
          windKt: Math.round(windKt),
          gustKt: Math.round(gustKt),
          precipitationMm: round1(rain1 || rain6),
          weatherCode: metWeatherCode(item),
        });
      }
    }

    const rain = round1(precipitationMm);
    const gust = Math.round(gustMaxKt);
    const condition = gust >= 20
      ? "강풍 주의"
      : rain >= 2
        ? "강수 주의"
        : rain > 0
          ? "약한 강수 가능"
          : "비행 가능 조건 양호";

    return {
      source: "MET Norway",
      date: dateKey.replaceAll("-", "."),
      dateKey,
      tempMax: Math.round(tempMax === -100 ? 0 : tempMax),
      tempMin: Math.round(tempMin === 100 ? 0 : tempMin),
      precipitationMm: rain,
      windMaxKt: Math.round(windMaxKt),
      gustMaxKt: gust,
      condition,
      hourlyDetails,
    };
  });
}

async function loadCurrentWeather(errors: WeatherError[]) {
  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${SKY_NURI_LAT}&longitude=${SKY_NURI_LON}&current_weather=true&hourly=temperature_2m,relative_humidity_2m,pressure_msl,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&forecast_days=2&past_days=1&wind_speed_unit=kn&timezone=Asia%2FSeoul`;

  // Open-Meteo가 일부 환경에서 TLS 연결이 끊기는 문제가 있어 MET Norway를 우선 사용합니다.
  try {
    const data = await fetchMetNorway();
    return currentWeatherFromMetNorway(data);
  } catch (error) {
    errors.push({ provider: "MET Norway", message: error instanceof Error ? error.message : String(error) });
  }

  try {
    const data = await fetchOpenMeteo(openMeteoUrl);
    return currentWeatherFromOpenMeteo(data);
  } catch (error) {
    errors.push({ provider: "Open-Meteo", message: error instanceof Error ? error.message : String(error) });
  }

  throw new Error(errors.map((item) => `${item.provider}: ${item.message}`).join(" / "));
}

async function loadWeeklyForecast(errors: WeatherError[]) {
  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${SKY_NURI_LAT}&longitude=${SKY_NURI_LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=Asia%2FSeoul&forecast_days=7`;

  try {
    const data = await fetchMetNorway();
    return weeklyForecastFromMetNorway(data);
  } catch (error) {
    errors.push({ provider: "MET Norway", message: error instanceof Error ? error.message : String(error) });
  }

  try {
    const data = await fetchOpenMeteo(openMeteoUrl);
    return weeklyForecastFromOpenMeteo(data);
  } catch (error) {
    errors.push({ provider: "Open-Meteo", message: error instanceof Error ? error.message : String(error) });
  }

  throw new Error(errors.map((item) => `${item.provider}: ${item.message}`).join(" / "));
}

export async function GET(request: NextRequest) {
  const mode = text(request.nextUrl.searchParams.get("mode"), "current").toLowerCase();
  const errors: WeatherError[] = [];

  try {
    if (mode === "weekly") {
      const forecast = await loadWeeklyForecast(errors);
      return NextResponse.json({ ok: true, forecast, fallbackErrors: errors });
    }

    const weather = await loadCurrentWeather(errors);
    return NextResponse.json({ ok: true, weather, fallbackErrors: errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "날씨 정보를 불러오지 못했습니다.");
    return NextResponse.json({ ok: false, message, errors }, { status: 502 });
  }
}
