import { configuredRoofSides, type Settings } from '../types'
import { MONTHLY_FALLBACK } from './pvCalculation'

export type WeatherData = { factors: { factors: number[][]; roof1?: number[]; roof2?: number[] }; source: 'PVGIS' | 'fallback'; loadedAt: string; note: string }

const CACHE_PREFIX = 'solar-pvgis-v1:'

function pvgisAspect(azimuth: number) { return ((azimuth + 180) % 360 + 180) % 360 - 180 }

async function fetchSide(settings: Settings, azimuth: number, tilt: number) {
  const url = new URL('https://re.jrc.ec.europa.eu/api/v5_3/PVcalc')
  url.search = new URLSearchParams({ lat: String(settings.latitude), lon: String(settings.longitude), peakpower: '1', loss: '0', angle: String(tilt), aspect: String(pvgisAspect(azimuth)), mountingplace: 'building', pvtechchoice: 'crystSi', outputformat: 'json' }).toString()
  const response = await fetch(url)
  if (!response.ok) throw new Error(`PVGIS ${response.status}`)
  const json = await response.json() as { outputs?: { monthly?: Array<{ month: number; E_m: number }> } }
  const monthly = json.outputs?.monthly
  if (!monthly || monthly.length !== 12) throw new Error('PVGIS lieferte keine Monatswerte')
  return monthly.sort((a, b) => a.month - b.month).map((item) => item.E_m)
}

function deriveFactors(monthly: number[]) {
  const total = monthly.reduce((a, b) => a + b, 0)
  if (!total) throw new Error('PVGIS Monatswerte sind leer')
  const normalized = monthly.map((value) => value / total)
  const fallbackTotal = MONTHLY_FALLBACK.reduce((a, b) => a + b, 0)
  return normalized.map((value, i) => Math.min(1.15, Math.max(0.05, value / (MONTHLY_FALLBACK[i] / fallbackTotal) * 0.86)))
}

function normalizeCachedWeather(value: WeatherData) {
  if (value.factors?.factors?.length) return value
  const legacy = [value.factors?.roof1, value.factors?.roof2].filter((item): item is number[] => Array.isArray(item))
  return { ...value, factors: { ...value.factors, factors: legacy } }
}

export async function loadWeatherData(settings: Settings, force = false): Promise<WeatherData> {
  const sides = configuredRoofSides(settings)
  const key = `${CACHE_PREFIX}${settings.location}:${settings.latitude}:${settings.longitude}:${sides.map((side) => `${side.azimuth}:${side.tilt}:${side.powerKwp}`).join('|')}`
  if (!force) { const cached = localStorage.getItem(key); if (cached) return normalizeCachedWeather(JSON.parse(cached) as WeatherData) }
  try {
    const monthly = await Promise.all(sides.map((side) => side.active ? fetchSide(settings, side.azimuth, side.tilt) : Promise.resolve(MONTHLY_FALLBACK)))
    const factors = monthly.map(deriveFactors)
    const data: WeatherData = { factors: { factors, roof1: factors[0], roof2: factors[1] }, source: 'PVGIS', loadedAt: new Date().toISOString(), note: 'Klimatischer Erwartungswert aus PVGIS-Monatsdaten je Dachfläche. Tageswerte sind innerhalb des Monats modelliert.' }
    localStorage.setItem(key, JSON.stringify(data))
    return data
  } catch {
    return { factors: { factors: sides.map(() => MONTHLY_FALLBACK), roof1: MONTHLY_FALLBACK, roof2: MONTHLY_FALLBACK }, source: 'fallback', loadedAt: new Date().toISOString(), note: 'PVGIS ist momentan nicht erreichbar. Die realistischen Werte sind eine deutlich gekennzeichnete monatliche Klimaschätzung.' }
  }
}
