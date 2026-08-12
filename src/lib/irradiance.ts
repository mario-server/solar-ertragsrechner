import type { SolarPoint } from '../types'

const rad = Math.PI / 180

export function directionName(azimuth: number) {
  const names = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return names[Math.round(((azimuth % 360) + 360) % 360 / 22.5) % 16]
}

export function oppositeAzimuth(azimuth: number) { return (azimuth + 180) % 360 }

export function incidenceAngle(elevation: number, sunAzimuth: number, tilt: number, surfaceAzimuth: number) {
  if (elevation <= 0) return 90
  const cosIncidence = Math.sin(elevation * rad) * Math.cos(tilt * rad) + Math.cos(elevation * rad) * Math.sin(tilt * rad) * Math.cos((sunAzimuth - surfaceAzimuth) * rad)
  return Math.acos(Math.min(1, Math.max(-1, cosIncidence))) / rad
}

export function clearSkyIrradiance(elevation: number, sunAzimuth: number, tilt: number, surfaceAzimuth: number, albedo = 0.2) {
  if (elevation <= 0) return { poa: 0, direct: 0, diffuse: 0, reflected: 0, incidence: 90 }
  const incidence = incidenceAngle(elevation, sunAzimuth, tilt, surfaceAzimuth)
  const zenith = 90 - elevation
  const airMass = 1 / (Math.cos(zenith * rad) + 0.50572 * Math.pow(96.07995 - zenith, -1.6364))
  const dni = 1367 * Math.pow(0.7, Math.pow(airMass, 0.678))
  const direct = Math.max(0, dni * Math.cos(incidence * rad))
  const dhi = Math.min(240, 55 + 0.12 * dni)
  const diffuse = dhi * (1 + Math.cos(tilt * rad)) / 2
  const ghi = dni * Math.sin(elevation * rad) + dhi
  const reflected = Math.max(0, ghi * albedo * (1 - Math.cos(tilt * rad)) / 2)
  return { poa: direct + diffuse + reflected, direct, diffuse, reflected, incidence }
}

export function attachIrradiance(points: SolarPoint[], tilt: number, azimuth: number, albedo: number) {
  return points.map((point) => {
    const irradiance = clearSkyIrradiance(point.elevation, point.azimuth, tilt, azimuth, albedo)
    return { ...point, irradiance: { poa: irradiance.poa, direct: irradiance.direct, diffuse: irradiance.diffuse, reflected: irradiance.reflected }, incidence: irradiance.incidence }
  })
}
