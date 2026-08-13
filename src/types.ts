export type RoofSide = {
  id?: string
  name?: string
  active: boolean
  powerKwp: number
  azimuth: number
  tilt: number
  systemLoss: number
}

export type Settings = {
  location: string
  latitude: number
  longitude: number
  timezone: string
  roof1: RoofSide
  roof2: RoofSide
  roofSides: RoofSide[]
  roof2Opposite: boolean
  roof2TiltLinked: boolean
  albedo: number
  inverterLimit: number | null
  capAtRatedPower: boolean
}

export type SolarPoint = {
  date: Date
  timeLabel: string
  elevation: number
  azimuth: number
  irradiance: { poa: number; direct: number; diffuse: number; reflected: number }
  incidence: number
}

export type PowerPoint = SolarPoint & {
  sideIdeal: number[]
  sideReal: number[]
  roof1Ideal: number
  roof1Real: number
  roof2Ideal: number
  roof2Real: number
  totalIdeal: number
  totalReal: number
}

export type DayResult = {
  date: string
  points: PowerPoint[]
  energy: { roof1Ideal: number; roof1Real: number; roof2Ideal: number; roof2Real: number; totalIdeal: number; totalReal: number }
  sideEnergy: Array<{ ideal: number; real: number }>
  peak: { ideal: number; real: number; idealTime: string; realTime: string }
}

export type YearRow = {
  date: string
  roof1Ideal: number
  roof1Real: number
  roof2Ideal: number
  roof2Real: number
  totalIdeal: number
  totalReal: number
  peakIdeal: number
  peakReal: number
  peakTime: string
}

export function configuredRoofSides(settings: Settings): RoofSide[] {
  const base = Array.isArray(settings.roofSides) && settings.roofSides.length ? settings.roofSides : [settings.roof1, settings.roof2]
  return base.map((side, index) => index === 1 ? {
    ...side,
    azimuth: settings.roof2Opposite ? (base[0].azimuth + 180) % 360 : side.azimuth,
    tilt: settings.roof2TiltLinked ? base[0].tilt : side.tilt
  } : side)
}

export const DEFAULT_SETTINGS: Settings = {
  location: 'Bad Lauchstädt',
  latitude: 51.39,
  longitude: 11.87,
  timezone: 'Europe/Berlin',
  roof1: { active: true, powerKwp: 10, azimuth: 30, tilt: 25, systemLoss: 14 },
  roof2: { active: true, powerKwp: 10, azimuth: 210, tilt: 25, systemLoss: 14 },
  roofSides: [
    { id: 'roof-1', name: 'Dachfläche 1', active: true, powerKwp: 10, azimuth: 30, tilt: 25, systemLoss: 14 },
    { id: 'roof-2', name: 'Dachfläche 2', active: true, powerKwp: 10, azimuth: 210, tilt: 25, systemLoss: 14 }
  ],
  roof2Opposite: true,
  roof2TiltLinked: true,
  albedo: 0.2,
  inverterLimit: null,
  capAtRatedPower: true
}
