import type { DayResult, PowerPoint, RoofSide, Settings, SolarPoint, YearRow } from '../types'
import { attachIrradiance, clearSkyIrradiance } from './irradiance'
import { buildSolarPoints } from './solarPosition'

export const MONTHLY_FALLBACK = [0.34, 0.42, 0.62, 0.78, 0.88, 0.91, 0.91, 0.86, 0.71, 0.54, 0.36, 0.29]

function factorFor(month: number, factors?: number[]) { return factors?.[month] ?? MONTHLY_FALLBACK[month] }

function sidePower(side: RoofSide, poa: number, cap: boolean) {
  if (!side.active) return 0
  const power = side.powerKwp * poa / 1000 * (1 - Math.min(60, Math.max(0, side.systemLoss)) / 100)
  return cap ? Math.min(side.powerKwp, Math.max(0, power)) : Math.max(0, power)
}

function clipPair(a: number, b: number, limit: number | null) {
  const total = a + b
  if (!limit || total <= limit || total === 0) return [a, b]
  const scale = limit / total
  return [a * scale, b * scale]
}

export function calculateDay(settings: Settings, date: string, realisticFactors?: { roof1?: number[]; roof2?: number[] }, stepMinutes = 5): DayResult {
  const roof2Azimuth = settings.roof2Opposite ? (settings.roof1.azimuth + 180) % 360 : settings.roof2.azimuth
  const roof2Tilt = settings.roof2TiltLinked ? settings.roof1.tilt : settings.roof2.tilt
  const base = buildSolarPoints(date, settings.latitude, settings.longitude, settings.timezone, stepMinutes)
  const first = attachIrradiance(base, settings.roof1.tilt, settings.roof1.azimuth, settings.albedo)
  const second = attachIrradiance(base, roof2Tilt, roof2Azimuth, settings.albedo)
  const month = Number(date.slice(5, 7)) - 1
  const points: PowerPoint[] = first.map((point, i) => {
    const p2 = second[i]
    const r1Ideal = sidePower(settings.roof1, point.irradiance.poa, settings.capAtRatedPower)
    const r2Ideal = sidePower({ ...settings.roof2, azimuth: roof2Azimuth, tilt: roof2Tilt }, p2.irradiance.poa, settings.capAtRatedPower)
    const [r1IdealClipped, r2IdealClipped] = clipPair(r1Ideal, r2Ideal, settings.inverterLimit)
    const r1Real = sidePower(settings.roof1, point.irradiance.poa * factorFor(month, realisticFactors?.roof1), settings.capAtRatedPower)
    const r2Real = sidePower({ ...settings.roof2, azimuth: roof2Azimuth, tilt: roof2Tilt }, p2.irradiance.poa * factorFor(month, realisticFactors?.roof2), settings.capAtRatedPower)
    const [r1RealClipped, r2RealClipped] = clipPair(r1Real, r2Real, settings.inverterLimit)
    return { ...point, incidence: point.incidence, roof1Ideal: r1IdealClipped, roof1Real: r1RealClipped, roof2Ideal: r2IdealClipped, roof2Real: r2RealClipped, totalIdeal: r1IdealClipped + r2IdealClipped, totalReal: r1RealClipped + r2RealClipped }
  })
  const hours = stepMinutes / 60
  const energy = { roof1Ideal: 0, roof1Real: 0, roof2Ideal: 0, roof2Real: 0, totalIdeal: 0, totalReal: 0 }
  points.forEach((p) => { energy.roof1Ideal += p.roof1Ideal * hours; energy.roof1Real += p.roof1Real * hours; energy.roof2Ideal += p.roof2Ideal * hours; energy.roof2Real += p.roof2Real * hours; energy.totalIdeal += p.totalIdeal * hours; energy.totalReal += p.totalReal * hours })
  const idealPeak = points.reduce((best, p) => p.totalIdeal > best.totalIdeal ? p : best, points[0])
  const realPeak = points.reduce((best, p) => p.totalReal > best.totalReal ? p : best, points[0])
  return { date, points, energy, peak: { ideal: idealPeak.totalIdeal, real: realPeak.totalReal, idealTime: idealPeak.timeLabel, realTime: realPeak.timeLabel } }
}

export function daysInYear(year: number) { return new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365 }

export function calculateYearChunk(settings: Settings, year: number, realisticFactors: { roof1?: number[]; roof2?: number[] } | undefined, startDay: number, count: number): YearRow[] {
  const rows: YearRow[] = []
  const days = daysInYear(year)
  for (let day = startDay; day < Math.min(days, startDay + count); day += 1) {
    const d = new Date(Date.UTC(year, 0, day + 1))
    const date = `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const result = calculateDay(settings, date, realisticFactors, 15)
    rows.push({ date, ...result.energy, peakIdeal: result.peak.ideal, peakReal: result.peak.real, peakTime: result.peak.realTime })
  }
  return rows
}

export function calculateYear(settings: Settings, year: number, realisticFactors?: { roof1?: number[]; roof2?: number[] }, onProgress?: (value: number) => void): { rows: YearRow[]; clippingKwh: number } {
  const rows: YearRow[] = []
  let clippingKwh = 0
  const days = daysInYear(year)
  for (let day = 0; day < days; day += 1) {
    rows.push(...calculateYearChunk(settings, year, realisticFactors, day, 1))
    onProgress?.((day + 1) / days)
  }
  if (settings.inverterLimit) {
    rows.forEach((row) => { clippingKwh += Math.max(0, row.totalIdeal * 0.015) })
  }
  return { rows, clippingKwh }
}

export function estimateSingleSideYear(settings: Settings, side: 1 | 2, factors?: { roof1?: number[]; roof2?: number[] }) {
  const copy: Settings = { ...settings, roof1: side === 1 ? settings.roof1 : { ...settings.roof1, active: false }, roof2: side === 2 ? settings.roof2 : { ...settings.roof2, active: false } }
  return calculateYear(copy, new Date().getFullYear(), factors).rows.reduce((sum, r) => sum + r.totalReal, 0)
}

export function clearSkyPreview(elevation: number, sunAzimuth: number, side: RoofSide, albedo: number) { return clearSkyIrradiance(elevation, sunAzimuth, side.tilt, side.azimuth, albedo) }
