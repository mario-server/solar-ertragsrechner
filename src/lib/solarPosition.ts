import type { SolarPoint } from '../types'

const rad = Math.PI / 180
const deg = 180 / Math.PI

function partsFor(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])) as Record<string, number>
}

export function zonedDateTimeToUtc(date: string, hour: number, timezone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const localHour = Math.floor(hour)
  const localMinute = Math.round((hour - localHour) * 60)
  let guess = new Date(Date.UTC(year, month - 1, day, localHour, localMinute, 0))
  for (let i = 0; i < 2; i += 1) {
    const p = partsFor(guess, timezone)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    guess = new Date(guess.getTime() + Date.UTC(year, month - 1, day, localHour, localMinute) - asUtc)
  }
  return guess
}

export function timezoneOffsetMinutes(date: Date, timezone: string) {
  const p = partsFor(date, timezone)
  const utc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((utc - date.getTime()) / 60000)
}

export function solarPosition(date: Date, latitude: number, longitude: number) {
  const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000)
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24)
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  const trueSolarMinutes = (hour * 60 + equation + 4 * longitude) % 1440
  const hourAngle = (trueSolarMinutes / 4 < 0 ? trueSolarMinutes / 4 + 180 : trueSolarMinutes / 4 - 180) * rad
  const lat = latitude * rad
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)))
  const zenith = Math.acos(cosZenith)
  const elevation = 90 - zenith * deg
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) * deg + 180 + 360) % 360
  return { elevation, zenith: zenith * deg, azimuth, declination: declination * deg }
}

export function formatTimeInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

export function buildSolarPoints(date: string, latitude: number, longitude: number, timezone: string, stepMinutes = 5): SolarPoint[] {
  const points: SolarPoint[] = []
  for (let minute = 0; minute < 1440; minute += stepMinutes) {
    const utc = zonedDateTimeToUtc(date, minute / 60, timezone)
    const position = solarPosition(utc, latitude, longitude)
    points.push({ date: utc, timeLabel: formatTimeInZone(utc, timezone), elevation: position.elevation, azimuth: position.azimuth, irradiance: { poa: 0, direct: 0, diffuse: 0, reflected: 0 }, incidence: 0 })
  }
  return points
}
