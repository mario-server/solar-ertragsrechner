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
    expect(midnight.totalIdeal).toBe(0)
    expect(midnight.totalReal).toBe(0)
  })

  it('adds the two roof sides and integrates power into energy', () => {
    const result = calculateDay(DEFAULT_SETTINGS, '2026-08-12')
    const integrated = result.points.reduce((sum, point) => sum + point.totalIdeal * 5 / 60, 0)
    expect(result.energy.totalIdeal).toBeCloseTo(integrated, 8)
    expect(result.points[120].totalIdeal).toBeCloseTo(result.points[120].roof1Ideal + result.points[120].roof2Ideal, 8)
    expect(result.peak.ideal).toBeLessThanOrEqual(20)
  })

  it('scales approximately linearly with installed power', () => {
    const oneSide = calculateDay({ ...DEFAULT_SETTINGS, roof2: { ...DEFAULT_SETTINGS.roof2, active: false } }, '2026-08-12')
    const doubled = calculateDay({ ...DEFAULT_SETTINGS, roof2: { ...DEFAULT_SETTINGS.roof1 } }, '2026-08-12')
    expect(doubled.energy.totalIdeal).toBeCloseTo(oneSide.energy.totalIdeal * 2, 5)
  })
})
