import { configuredRoofSides, type DayResult, type PowerPoint, type RoofSide, type Settings, type SolarPoint, type YearRow } from '../types'
import { attachIrradiance, clearSkyIrradiance } from './irradiance'
import { buildSolarPoints } from './solarPosition'

export const MONTHLY_FALLBACK = [0.34, 0.42, 0.62, 0.78, 0.88, 0.91, 0.91, 0.86, 0.71, 0.54, 0.36, 0.29]
export type RealisticFactors = { factors?: number[][]; roof1?: number[]; roof2?: number[] }

function factorFor(month: number, factors?: number[]) { return factors?.[month] ?? MONTHLY_FALLBACK[month] }

function sidePower(side: RoofSide, poa: number, cap: boolean) {
  if (!side.active) return 0
  const power = side.powerKwp * poa / 1000 * (1 - Math.min(60, Math.max(0, side.systemLoss)) / 100)
  return cap ? Math.min(side.powerKwp, Math.max(0, power)) : Math.max(0, power)
}

export function calculateDay(settings: Settings, date: string, realisticFactors?: RealisticFactors, stepMinutes = 5): DayResult {
  const sides = configuredRoofSides(settings)
  const base = buildSolarPoints(date, settings.latitude, settings.longitude, settings.timezone, stepMinutes)
  const irradiance = sides.map((side) => attachIrradiance(base, side.tilt, side.azimuth, settings.albedo))
  const month = Number(date.slice(5, 7)) - 1
  const hours = stepMinutes / 60
  const sideEnergy = sides.map(() => ({ real: 0 }))
  let clippingKwh = 0
  const points: PowerPoint[] = base.map((point, i) => {
    const realValues = sides.map((side, sideIndex) => sidePower(side, irradiance[sideIndex][i].irradiance.poa * factorFor(month, realisticFactors?.factors?.[sideIndex] ?? (sideIndex === 0 ? realisticFactors?.roof1 : sideIndex === 1 ? realisticFactors?.roof2 : undefined)), settings.capAtRatedPower))
    const realClipped = clipMany(realValues, settings.inverterLimit)
    clippingKwh += Math.max(0, realValues.reduce((sum, value) => sum + value, 0) - realClipped.reduce((sum, value) => sum + value, 0)) * hours
    realClipped.forEach((value, sideIndex) => { sideEnergy[sideIndex].real += value * hours })
    return { ...point, irradiance: irradiance[0]?.[i]?.irradiance ?? point.irradiance, incidence: irradiance[0]?.[i]?.incidence ?? 90, sideReal: realClipped, roof1Real: realClipped[0] ?? 0, roof2Real: realClipped[1] ?? 0, totalReal: realClipped.reduce((sum, value) => sum + value, 0) }
  })
  const energy = { roof1Real: 0, roof2Real: 0, totalReal: 0 }
  points.forEach((p) => { energy.roof1Real += p.roof1Real * hours; energy.roof2Real += p.roof2Real * hours; energy.totalReal += p.totalReal * hours })
  const realPeak = points.reduce((best, p) => p.totalReal > best.totalReal ? p : best, points[0])
  return { date, points, energy, sideEnergy, clippingKwh, peak: { real: realPeak.totalReal, realTime: realPeak.timeLabel } }
}

function clipMany(values: number[], limit: number | null) {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!limit || total <= limit || total === 0) return values
  const scale = limit / total
  return values.map((value) => value * scale)
}

export function daysInYear(year: number) { return new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365 }

export function calculateYearChunk(settings: Settings, year: number, realisticFactors: RealisticFactors | undefined, startDay: number, count: number): YearRow[] {
  const rows: YearRow[] = []
  const days = daysInYear(year)
  for (let day = startDay; day < Math.min(days, startDay + count); day += 1) {
    const d = new Date(Date.UTC(year, 0, day + 1))
    const date = `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const result = calculateDay(settings, date, realisticFactors, 15)
    rows.push({ date, ...result.energy, peakReal: result.peak.real, peakTime: result.peak.realTime, clippingKwh: result.clippingKwh })
  }
  return rows
}

export function calculateYear(settings: Settings, year: number, realisticFactors?: RealisticFactors, onProgress?: (value: number) => void): { rows: YearRow[]; clippingKwh: number } {
  const rows: YearRow[] = []
  let clippingKwh = 0
  const days = daysInYear(year)
  for (let day = 0; day < days; day += 1) {
    rows.push(...calculateYearChunk(settings, year, realisticFactors, day, 1))
    onProgress?.((day + 1) / days)
  }
  if (settings.inverterLimit) {
    rows.forEach((row) => { clippingKwh += row.clippingKwh })
  }
  return { rows, clippingKwh }
}

export function estimateSingleSideYear(settings: Settings, side: 1 | 2, factors?: RealisticFactors) {
  const copy: Settings = { ...settings, roof1: side === 1 ? settings.roof1 : { ...settings.roof1, active: false }, roof2: side === 2 ? settings.roof2 : { ...settings.roof2, active: false } }
  return calculateYear(copy, new Date().getFullYear(), factors).rows.reduce((sum, r) => sum + r.totalReal, 0)
}
