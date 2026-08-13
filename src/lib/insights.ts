import type { DayResult, YearRow } from '../types'

export type TimeBand = {
  label: string
  energy: number
  share: number
}

export type ThresholdInsight = {
  threshold: number
  hours: number
  shareOfDay: number
}

export type SurfaceInsight = {
  index: number
  real: number
  share: number
}

const localHour = (timeLabel: string) => Number(timeLabel.slice(0, 2)) + Number(timeLabel.slice(3, 5)) / 60

const intervalHours = (day: DayResult) => {
  if (day.points.length < 2) return 5 / 60
  return Math.max(1 / 120, (day.points[1].date.getTime() - day.points[0].date.getTime()) / 3_600_000)
}

export function deriveDayInsights(day: DayResult, installedKwp: number) {
  const stepHours = intervalHours(day)
  const totalEnergy = Math.max(0, day.energy.totalReal)
  const bands = [
    { label: 'Morgen', from: 0, to: 10 },
    { label: 'Mittag', from: 10, to: 15 },
    { label: 'Nachmittag', from: 15, to: 24 }
  ].map(({ label, from, to }): TimeBand => {
    const energy = day.points.reduce((sum, point) => {
      const hour = localHour(point.timeLabel)
      return hour >= from && hour < to ? sum + point.totalReal * stepHours : sum
    }, 0)
    return { label, energy, share: totalEnergy ? energy / totalEnergy : 0 }
  })

  const thresholds = [25, 50, 75, 90].map((threshold): ThresholdInsight => {
    const limit = Math.max(0, installedKwp) * threshold / 100
    const hours = day.points.reduce((sum, point) => sum + (point.totalReal >= limit ? stepHours : 0), 0)
    return { threshold, hours, shareOfDay: totalEnergy ? hours / (day.points.length * stepHours) : 0 }
  })

  return {
    bands,
    thresholds,
    stepHours
  }
}

export function surfaceBreakdown(day: DayResult, activeIndexes: number[]): SurfaceInsight[] {
  const total = Math.max(0, day.energy.totalReal)
  return activeIndexes.map((index) => {
    const value = day.sideEnergy[index] ?? { real: 0 }
    return { index, real: value.real, share: total ? value.real / total : 0 }
  })
}

export function monthlyBreakdown(rows: YearRow[]) {
  const labels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return labels.map((label, month) => rows.reduce((result, row) => {
    if (Number(row.date.slice(5, 7)) - 1 !== month) return result
    result.real += row.totalReal
    return result
  }, { month, label, real: 0 }))
}
