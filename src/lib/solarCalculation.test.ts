import { describe, expect, it } from 'vitest'
import { directionName, oppositeAzimuth } from './irradiance'
import { calculateDay } from './pvCalculation'
import { DEFAULT_SETTINGS } from '../types'

describe('solar calculation invariants', () => {
  it('keeps opposite roof azimuths normalized', () => {
    expect(oppositeAzimuth(30)).toBe(210)
    expect(oppositeAzimuth(350)).toBe(170)
    expect(directionName(210)).toBe('SSW')
  })

  it('produces no power at midnight', () => {
    const result = calculateDay(DEFAULT_SETTINGS, '2026-08-12')
    const midnight = result.points[0]
    expect(midnight.elevation).toBeLessThan(0)
    expect(midnight.totalReal).toBe(0)
  })

  it('adds the roof sides and integrates realistic power into energy', () => {
    const result = calculateDay(DEFAULT_SETTINGS, '2026-08-12')
    const integrated = result.points.reduce((sum, point) => sum + point.totalReal * 5 / 60, 0)
    expect(result.energy.totalReal).toBeCloseTo(integrated, 8)
    expect(result.points[120].totalReal).toBeCloseTo(result.points[120].roof1Real + result.points[120].roof2Real, 8)
    expect(result.peak.real).toBeLessThanOrEqual(20)
  })

  it('scales approximately linearly with installed power', () => {
    const oneSide = calculateDay({ ...DEFAULT_SETTINGS, roof2: { ...DEFAULT_SETTINGS.roof2, active: false }, roofSides: [{ ...DEFAULT_SETTINGS.roof1 }, { ...DEFAULT_SETTINGS.roof2, active: false }] }, '2026-08-12')
    const doubled = calculateDay({ ...DEFAULT_SETTINGS, roof2: { ...DEFAULT_SETTINGS.roof1 }, roofSides: [{ ...DEFAULT_SETTINGS.roof1 }, { ...DEFAULT_SETTINGS.roof1, id: 'roof-2' }] }, '2026-08-12')
    expect(doubled.energy.totalReal).toBeCloseTo(oneSide.energy.totalReal * 2, 5)
  })

  it('includes additional active roof surfaces in the total', () => {
    const one = calculateDay(DEFAULT_SETTINGS, '2026-08-12')
    const three = { ...DEFAULT_SETTINGS, roofSides: [...DEFAULT_SETTINGS.roofSides, { id: 'roof-3', name: 'Garage', active: true, powerKwp: 5, azimuth: 180, tilt: 20, systemLoss: 14 }] }
    const result = calculateDay(three, '2026-08-12')
    expect(result.sideEnergy).toHaveLength(3)
    expect(result.energy.totalReal).toBeGreaterThan(one.energy.totalReal)
  })
})
