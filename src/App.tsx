import { Fragment, useEffect, useMemo, useState } from 'react'
import type { DayResult, RoofSide, Settings, YearRow } from './types'
import { configuredRoofSides, DEFAULT_SETTINGS } from './types'
import { calculateDay, calculateYearChunk, daysInYear } from './lib/pvCalculation'
import { directionName, oppositeAzimuth } from './lib/irradiance'
import { loadWeatherData, type WeatherData } from './lib/weatherData'
import { deriveDayInsights, monthlyBreakdown, surfaceBreakdown } from './lib/insights'

type Page = 'overview' | 'day' | 'insights' | 'year' | 'settings'
const COLORS = { roof1: '#f2a93b', roof2: '#5cc8b0', total: '#f4f6f8', real: '#9aa8b4' }
const SURFACE_COLORS = ['#f2a93b', '#5cc8b0', '#a98cff', '#e77f98', '#6ea8fe', '#c7d36f', '#f07f4f', '#79b8d1', '#d39bdf', '#b4c95d']
const surfaceColor = (index: number) => SURFACE_COLORS[index % SURFACE_COLORS.length]
const today = () => new Date().toISOString().slice(0, 10)
const n = (value: number, digits = 0) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
const kwh = (value: number) => `${n(value, 1)} kWh`
const kwhPrecise = (value: number) => `${n(value, 3)} kWh`
const kw = (value: number) => `${n(value, 2)} kW`
const azimuthText = (value: number) => `${n(value, 0)}° ${directionName(value)}`

function useStoredSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('solar-settings') || '{}') as Partial<Settings>
      const first = stored.roof1 ?? DEFAULT_SETTINGS.roof1
      const second = stored.roof2 ?? DEFAULT_SETTINGS.roof2
      const roofSides = Array.isArray(stored.roofSides) && stored.roofSides.length ? stored.roofSides : [first, second]
      return { ...DEFAULT_SETTINGS, ...stored, roofSides, roof1: roofSides[0], roof2: roofSides[1] ?? second }
    } catch { return DEFAULT_SETTINGS }
  })
  useEffect(() => localStorage.setItem('solar-settings', JSON.stringify(settings)), [settings])
  return [settings, setSettings] as const
}

function IconButton({ children, onClick, title }: { children: string; onClick: () => void; title: string }) { return <button className="icon-button" title={title} aria-label={title} onClick={onClick}>{children}</button> }

function Metric({ label, value, detail, accent = 'neutral' }: { label: string; value: string; detail?: string; accent?: 'neutral' | 'orange' | 'teal' }) { return <div className={`metric metric-${accent}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div> }

function RoofBadge({ side, settings }: { side: RoofSide; settings: Settings }) {
  return <div className="roof-badge roof-1"><span className="dot" /> {side.name || 'Dachfläche'} <b>{azimuthText(side.azimuth)}</b><em>{n(side.tilt)}° Neigung · {n(side.powerKwp, 1)} kWp</em></div>
}

function Header({ page, setPage, source, calculating }: { page: Page; setPage: (page: Page) => void; source: WeatherData['source']; calculating: boolean }) {
  return <header className="topbar"><div className="brand"><span className="brand-mark">/\</span><div><strong>Solarertrag</strong><small>PV-Planung mit Sonnenmodell</small></div></div><nav>{(['overview', 'day', 'insights', 'year', 'settings'] as Page[]).map((item) => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item === 'overview' ? 'Übersicht' : item === 'day' ? 'Tag' : item === 'insights' ? 'Analyse' : item === 'year' ? 'Jahr' : 'Anlage'}</button>)}</nav><span className={`data-status ${calculating ? 'status-calculating' : `status-${source}`}`}><i /> {calculating ? 'Berechnung läuft' : source === 'PVGIS' ? 'PVGIS verbunden' : 'Klimaschätzung'}</span></header>
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) { return <div className="section-title">{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2>{action}</div> }

function LineChart({ points, keys, labels, colors, height = 270 }: { points: Array<Record<string, number | string>>; keys: string[]; labels: Record<string, string>; colors?: Record<string, string>; height?: number }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const width = 960; const pad = { l: 42, r: 18, t: 18, b: 28 }; const chartW = width - pad.l - pad.r; const chartH = height - pad.t - pad.b
  const max = Math.max(1, ...points.flatMap((p) => keys.map((key) => Number(p[key]) || 0)))
  const path = (key: string) => points.map((p, i) => `${i ? 'L' : 'M'} ${pad.l + (i / Math.max(1, points.length - 1)) * chartW} ${pad.t + chartH - ((Number(p[key]) || 0) / max) * chartH}`).join(' ')
  const pointX = (index: number) => pad.l + (index / Math.max(1, points.length - 1)) * chartW
  const pointY = (key: string, index: number) => pad.t + chartH - ((Number(points[index]?.[key]) || 0) / max) * chartH
  const tickValues = [0, max * .25, max * .5, max * .75, max]
  const lineColor = (key: string) => colors?.[key] ?? (labels[key].includes('Seite 1') ? COLORS.roof1 : labels[key].includes('Seite 2') ? COLORS.roof2 : labels[key].includes('realistisch') ? COLORS.real : COLORS.total)
  const updateHover = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!points.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const svgX = (event.clientX - rect.left) / rect.width * width
    const index = Math.round((svgX - pad.l) / chartW * Math.max(1, points.length - 1))
    setHoveredIndex(index >= 0 && index < points.length ? index : null)
  }
  const tooltipX = hoveredIndex === null ? 0 : Math.min(width - 200, Math.max(pad.l, pointX(hoveredIndex) + 12))
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Leistungsverlauf" onMouseMove={updateHover} onMouseLeave={() => setHoveredIndex(null)}><g className="chart-grid">{tickValues.map((value) => <g key={value}><line x1={pad.l} x2={width - pad.r} y1={pad.t + chartH - value / max * chartH} y2={pad.t + chartH - value / max * chartH} /><text x={pad.l - 8} y={pad.t + chartH - value / max * chartH + 4} textAnchor="end">{n(value, 1)}</text></g>)}</g>{keys.map((key) => <path key={key} d={path(key)} className="chart-line" style={{ stroke: lineColor(key) }} />)}{hoveredIndex !== null && <g className="chart-hover"><line x1={pointX(hoveredIndex)} x2={pointX(hoveredIndex)} y1={pad.t} y2={pad.t + chartH} /><rect x={tooltipX} y="9" width="188" height={22 + keys.length * 17} rx="3" /><text x={tooltipX + 10} y="26">{String(points[hoveredIndex].time ?? '')} Uhr</text>{keys.map((key, index) => <Fragment key={key}><circle cx={pointX(hoveredIndex)} cy={pointY(key, hoveredIndex)} r="3.5" style={{ fill: lineColor(key) }} /><text x={tooltipX + 10} y={45 + index * 17} className="chart-tooltip-line"><tspan style={{ fill: lineColor(key) }}>{labels[key]}:</tspan> {n(Number(points[hoveredIndex][key]) || 0, 2)} kW</text></Fragment>)}</g>}<text x={pad.l} y={height - 5}>Nacht</text><text x={width - pad.r} y={height - 5} textAnchor="end">Abend</text></svg><div className="chart-legend">{keys.map((key) => <span key={key}><i style={{ background: lineColor(key) }} />{labels[key]}</span>)}</div></div>
}

function DistributionChart({ rows }: { rows: YearRow[] }) {
  const months = Array.from({ length: 12 }, (_, month) => rows.filter((r) => Number(r.date.slice(5, 7)) - 1 === month).reduce((sum, r) => sum + r.totalReal, 0))
  const max = Math.max(...months, 1)
  return <div className="bars">{months.map((value, i) => <div className="bar-item" key={i}><div className="bar"><i style={{ height: `${value / max * 100}%` }} /></div><span>{['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][i]}</span><small>{n(value, 0)}</small></div>)}</div>
}

function EnergyTable({ rows, download }: { rows: YearRow[]; download: () => void }) {
  return <div className="table-shell"><div className="table-head"><strong>{rows.length} Tage im Messjahr</strong><button className="secondary" onClick={download}>CSV exportieren</button></div><div className="scroll-table"><table><thead><tr><th>Datum</th><th>Seite 1 kWh</th><th>Seite 2 kWh</th><th>Gesamt kWh</th><th>Peak</th><th>Clipping</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{new Date(`${row.date}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</td><td>{n(row.roof1Real, 1)}</td><td>{n(row.roof2Real, 1)}</td><td className="strong-cell">{n(row.totalReal, 1)}</td><td>{kw(row.peakReal)} · {row.peakTime}</td><td>{n(row.clippingKwh, 3)} kWh</td></tr>)}</tbody></table></div><small className="table-note">Alle Energieangaben in kWh. Die Werte basieren auf standortbezogenen PVGIS-Klimadaten beziehungsweise der gekennzeichneten Fallback-Schätzung.</small></div>
}

function Overview({ settings, day, yearRows, onNavigate }: { settings: Settings; day: DayResult; yearRows: YearRow[]; onNavigate: (p: Page) => void }) {
  const totalReal = yearRows.reduce((s, r) => s + r.totalReal, 0)
  const sides = configuredRoofSides(settings); const totalKwp = sides.reduce((sum, side) => sum + (side.active ? side.powerKwp : 0), 0)
  const monthly = Array.from({ length: 12 }, (_, month) => yearRows.filter((r) => Number(r.date.slice(5, 7)) - 1 === month).reduce((s, r) => s + r.totalReal, 0))
  const best = monthly.indexOf(Math.max(...monthly)); const worst = monthly.indexOf(Math.min(...monthly)); const side1 = yearRows.reduce((s, r) => s + r.roof1Real, 0); const side2 = Math.max(0, totalReal - side1)
  const oneSide = yearRows.reduce((s, r) => s + r.roof1Real, 0); const names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
  return <main><div className="page-heading"><div><span className="eyebrow">Anlagenmonitor · {settings.location}</span><h1>Dein Solarjahr im Überblick</h1><p>Standortbezogene PVGIS-Klimadaten und Sonnenverlauf in einer Ansicht.</p></div><button className="primary" onClick={() => onNavigate('day')}>Tagesprofil öffnen</button></div><div className="roof-strip">{sides.slice(0, 3).map((side) => <RoofBadge key={side.id || side.name} side={side} settings={settings} />)}{sides.length > 3 && <div className="roof-badge"><span className="dot" /> +{sides.length - 3} weitere Flächen</div>}<div className="roof-total"><span>Gesamtanlage</span><strong>{n(totalKwp, 1)} kWp</strong></div></div><div className="metric-grid"><Metric label="Realistischer Jahresertrag" value={kwh(totalReal)} detail="Klimatischer Erwartungswert" accent="teal" /><Metric label="Spezifischer Ertrag" value={`${n(totalReal / Math.max(.1, totalKwp), 0)} kWh/kWp`} detail="pro installierter Leistung" /><Metric label="Stärkster Monat" value={names[best]} detail={kwh(monthly[best])} /><Metric label="Schwächster Monat" value={names[worst]} detail={kwh(monthly[worst])} /></div><div className="overview-grid"><section className="panel profile-panel"><SectionTitle eyebrow="Heute · ausgewählter Tag" title={new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })} action={<button className="link-button" onClick={() => onNavigate('day')}>Details</button>} /><div className="today-main"><div><span>Ertrag realistisch</span><strong>{kwh(day.energy.totalReal)}</strong></div><div><span>Tagesmaximum</span><strong>{kw(day.peak.real)}</strong><small>{day.peak.realTime} Uhr</small></div></div><LineChart points={day.points.filter((_, i) => i % 3 === 0).map((p) => ({ time: p.timeLabel, totalReal: p.totalReal }))} keys={['totalReal']} labels={{ totalReal: 'Gesamt realistisch' }} height={190} /></section><section className="panel distribution-panel"><SectionTitle eyebrow="Jahresverteilung" title="Alle Flächen im Zusammenspiel" /><DistributionChart rows={yearRows} /><div className="share-row"><span><i className="dot orange" /> Seite 1 <b>{n(side1 / Math.max(.1, totalReal) * 100, 1)} %</b></span><span><i className="dot teal" /> Seite 2+ <b>{n(side2 / Math.max(.1, totalReal) * 100, 1)} %</b></span></div></section></div><section className="panel comparison"><SectionTitle eyebrow="Vergleich" title="Was bringt die gesamte Konfiguration?" /><div className="comparison-grid"><div><span>Erste Dachfläche</span><strong>{kwh(oneSide)}</strong><small>{n(sides[0]?.powerKwp ?? 0, 1)} kWp · {directionName(sides[0]?.azimuth ?? 0)}</small></div><div><span>Weitere Flächen</span><strong>{kwh(Math.max(0, totalReal - oneSide))}</strong><small>{n(Math.max(0, totalKwp - (sides[0]?.powerKwp ?? 0)), 1)} kWp · zusammen</small></div><div className="comparison-total"><span>Alle Flächen</span><strong>{kwh(totalReal)}</strong><small>{sides.length} von maximal 10 Flächen aktivierbar</small></div></div></section></main>
}

function DayPage({ settings, date, setDate, day, weatherSource }: { settings: Settings; date: string; setDate: (d: string) => void; day: DayResult; weatherSource: WeatherData['source'] }) {
  const sides = configuredRoofSides(settings)
  const series = sides.map((side, index) => ({ key: `surface${index}Real`, label: side.name || `Fläche ${index + 1}`, color: surfaceColor(index) }))
  const chartLabels: Record<string, string> = { totalReal: 'Gesamtanlage' }
  const chartColors: Record<string, string> = { totalReal: COLORS.total }
  series.forEach((item) => { chartLabels[item.key] = item.label; chartColors[item.key] = item.color })
  const seriesSignature = sides.map((side, index) => `${index}:${side.id || side.name}:${side.active}`).join('|')
  const defaultVisible = [...series.filter((item) => sides[Number(item.key.match(/\d+/)?.[0] ?? 0)].active).map((item) => item.key), 'totalReal']
  const [showTechnical, setShowTechnical] = useState(false); const [visible, setVisible] = useState(defaultVisible)
  useEffect(() => setVisible(defaultVisible), [seriesSignature])
  const chartPoints = day.points.filter((_, i) => i % 3 === 0).map((p) => {
    const point: Record<string, number | string> = { time: p.timeLabel, totalReal: p.totalReal }
    sides.forEach((_, index) => { point[`surface${index}Real`] = p.sideReal[index] ?? 0 })
    return point
  })
  const chartKeys = [...series.filter((item) => sides[Number(item.key.match(/\d+/)?.[0] ?? 0)].active).map((item) => item.key), 'totalReal']
  const toggle = (key: string) => setVisible((old) => old.includes(key) ? old.filter((x) => x !== key) : [...old, key])
  const move = (amount: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); setDate(d.toISOString().slice(0, 10)) }
  const accumulated = day.points.reduce((values, point, index) => { const previous = values[index - 1] ?? 0; values.push(previous + point.totalReal * 5 / 60); return values }, [] as number[])
  const rows = day.points.map((p, index) => <tr key={p.timeLabel}><td>{p.timeLabel}</td><td>{n(p.elevation, 1)}°</td><td>{n(p.azimuth, 1)}°</td>{sides.map((side, sideIndex) => <td key={side.id || sideIndex}>{n((p.sideReal[sideIndex] ?? 0) * 1000, 0)} W</td>)}<td className="strong-cell">{n(p.totalReal * 1000, 0)} W</td><td className="accumulated-cell">{n(accumulated[index], 3)} kWh</td>{showTechnical && <><td>{n(p.incidence, 1)}°</td><td>{n(p.irradiance.poa, 0)} W/m²</td></>}</tr>)
  const csvHeader = ['Uhrzeit', 'Sonnenhöhe', 'Sonnenazimut', ...sides.map((side, index) => `${side.name || `Fläche ${index + 1}`} realistisch W`), 'Gesamt realistisch W', 'Gesamt realistisch aufgelaufen kWh']
  const download = () => downloadCsv(`solar-tag-${date}.csv`, [csvHeader, ...day.points.map((p, index) => [p.timeLabel, p.elevation, p.azimuth, ...sides.map((_, sideIndex) => (p.sideReal[sideIndex] ?? 0) * 1000), p.totalReal * 1000, accumulated[index]])])
  return <main><div className="page-heading compact"><div><span className="eyebrow">Tagesanalyse</span><h1>Leistung im Tagesverlauf</h1><p>5-Minuten-Modell auf Basis der standortbezogenen PVGIS-Klimadaten für alle konfigurierten Flächen.</p></div><div className="date-control"><IconButton title="Vorheriger Tag" onClick={() => move(-1)}>←</IconButton><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><IconButton title="Nächster Tag" onClick={() => move(1)}>→</IconButton><button className="secondary" onClick={() => setDate(today())}>Heute</button></div></div><div className="metric-grid day-metrics"><Metric label="Gesamtanlage" value={kwh(day.energy.totalReal)} detail={`Peak ${kw(day.peak.real)} · ${day.peak.realTime}`} accent="teal" /><Metric label="Aufgelaufen realistisch" value={kwhPrecise(day.energy.totalReal)} detail="über den gesamten Tag integriert" accent="teal" />{sides.slice(0, 3).map((side, index) => <Metric key={side.id || index} label={side.name || `Dachfläche ${index + 1}`} value={kwh(day.sideEnergy[index]?.real ?? 0)} detail={`${n(side.powerKwp, 1)} kWp`} accent={index % 2 === 0 ? 'orange' : 'teal'} />)}</div><section className="panel large-chart"><div className="section-title"><div><span>Leistungsprofil · kW</span><h2>Alle Flächen im direkten Vergleich</h2></div><div className="chart-toggles">{chartKeys.map((key) => <button key={key} className={visible.includes(key) ? 'selected' : ''} onClick={() => toggle(key)}><i style={{ background: chartColors[key] }} />{chartLabels[key]}</button>)}</div></div><LineChart points={chartPoints} keys={visible} labels={chartLabels} colors={chartColors} height={330} /></section><section className="panel"><div className="table-head"><div><span className="eyebrow">Zeitreihe</span><h2>Alle Berechnungspunkte</h2></div><div className="table-actions"><label><input type="checkbox" checked={showTechnical} onChange={(e) => setShowTechnical(e.target.checked)} /> Technische Spalten</label><button className="secondary" onClick={download}>CSV exportieren</button></div></div><div className="scroll-table"><table><thead><tr><th>Uhrzeit</th><th>Sonnenhöhe</th><th>Sonnenazimut</th>{sides.map((side, index) => <th key={side.id || index}>{side.name || `Fläche ${index + 1}`} real W</th>)}<th>Gesamt real W</th><th>Aufgelaufen real kWh</th>{showTechnical && <><th>Einfallswinkel</th><th>POA</th></>}</tr></thead><tbody>{rows}</tbody></table></div><small className="table-note">Datenquelle: {weatherSource === 'PVGIS' ? 'PVGIS / EU Joint Research Centre' : 'monatliche Klimaschätzung als Fallback'}. Intern werden Leistungen in kW gerechnet, hier für die Zeitreihe in W angezeigt. Die kumulierte Energie wird aus der realistischen Gesamtleistung integriert. Diagramm, Tabelle und Summen berücksichtigen alle aktiven Flächen.</small></section></main>
}

function InsightsPage({ settings, day, rows, onNavigate }: { settings: Settings; day: DayResult; rows: YearRow[]; onNavigate: (page: Page) => void }) {
  const sides = configuredRoofSides(settings)
  const activeIndexes = sides.map((side, index) => side.active ? index : -1).filter((index) => index >= 0)
  const totalKwp = activeIndexes.reduce((sum, index) => sum + sides[index].powerKwp, 0)
  const insights = useMemo(() => deriveDayInsights(day, totalKwp), [day, totalKwp])
  const surfaces = surfaceBreakdown(day, activeIndexes)
  const months = monthlyBreakdown(rows)
  const maxMonth = Math.max(1, ...months.map((month) => month.real))
  const yearPoints = rows.filter((_, index) => index % Math.max(1, Math.ceil(rows.length / 180)) === 0).map((row) => ({ totalReal: row.totalReal }))
  const surfaceColors = ['#f2a93b', '#5cc8b0', '#a98cff', '#e77f98', '#6ea8fe', '#c7d36f']
  const selectedDate = new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })

  return <main>
    <div className="page-heading compact">
      <div><span className="eyebrow">Analyse · Vergleich</span><h1>Wie erzeugt deine Anlage Energie?</h1><p>Zusätzliche Muster und Vergleiche aus dem ausgewählten Tagesprofil und dem laufenden Ertragsjahr.</p></div>
      <button className="primary" onClick={() => onNavigate('day')}>Tagesprofil öffnen</button>
    </div>
    <section className="insight-hero">
      <div><span className="insight-kicker">Ausgewählter Tag · {selectedDate}</span><h2>Breite statt kurzer Spitze</h2><p>Die Verteilung zeigt, wann deine Flächen gemeinsam Leistung liefern. Alle Werte basieren auf dem standortbezogenen PVGIS-Klimamodell.</p></div>
      <div className="insight-stat-grid"><div className="insight-stat"><span>Ertrag ausgewählt</span><strong>{kwh(day.energy.totalReal)}</strong><small>klimatische Erwartung</small></div><div className="insight-stat"><span>Über 50 % Leistung</span><strong>{n(insights.thresholds[1].hours, 1)} h</strong><small>von {n(totalKwp, 1)} kWp</small></div><div className="insight-stat"><span>Tagespeak</span><strong>{kw(day.peak.real)}</strong><small>{day.peak.realTime} Uhr</small></div></div>
    </section>
    <div className="insight-grid">
      <section className="panel insight-panel">
        <SectionTitle eyebrow="Tagesrhythmus" title="Wann entsteht die Energie?" />
        <div className="insight-bars">{insights.bands.map((band) => <div className="insight-bar-row" key={band.label}><div className="insight-bar-label"><strong>{band.label}</strong><span>{n(band.share * 100, 0)} % · {kwh(band.energy)}</span></div><div className="insight-bar-track"><i style={{ width: `${Math.max(0, Math.min(100, band.share * 100))}%` }} /></div></div>)}</div>
        <small className="insight-note">Aufteilung der realistischen Tagesenergie in Zeitfenster. Die Energie wird aus den 5-Minuten-Leistungswerten integriert.</small>
      </section>
      <section className="panel insight-panel">
        <SectionTitle eyebrow="Leistungsdauer" title="Wie lange wird Leistung erreicht?" />
        <div className="threshold-list">{insights.thresholds.map((item) => <div className="threshold-row" key={item.threshold}><span>{item.threshold} %</span><div className="insight-bar-track"><i style={{ width: `${Math.max(0, Math.min(100, item.shareOfDay * 100))}%` }} /></div><strong>{n(item.hours, 1)} h</strong></div>)}</div>
        <small className="insight-note">Zeitanteil der berechneten Tagespunkte über der jeweiligen Schwelle der aktiven Gesamtleistung.</small>
      </section>
      <section className="panel insight-panel">
        <SectionTitle eyebrow="Flächenvergleich" title="Wer liefert den Tagesertrag?" />
        <div className="surface-list">{surfaces.map((surface) => { const side = sides[surface.index]; return <div className="surface-row" key={side.id || surface.index}><div className="surface-row-title"><i className="surface-color" style={{ background: surfaceColors[surface.index % surfaceColors.length] }} /><strong>{side.name || `Dachfläche ${surface.index + 1}`}</strong><span>{n(side.powerKwp, 1)} kWp</span></div><div className="insight-bar-track"><i style={{ width: `${Math.max(0, Math.min(100, surface.share * 100))}%`, background: surfaceColors[surface.index % surfaceColors.length] }} /></div><div className="surface-row-values"><b>{kwh(surface.real)}</b><span>{n(surface.share * 100, 1)} % des Tagesertrags</span></div></div> })}</div>
        <small className="insight-note">Anteile beziehen sich auf den ausgewählten Tag und die realistische Berechnung.</small>
      </section>
      <section className="panel insight-panel">
        <SectionTitle eyebrow="Jahresverlauf" title="Klimatischer Ertrag nach Monat" />
        <div className="insight-month-grid">{months.map((month) => <div className="insight-month" key={month.label}><div className="insight-month-bars"><i style={{ height: `${month.real / maxMonth * 100}%` }} /></div><span>{month.label}</span><small>{n(month.real, 0)} kWh</small></div>)}</div>
        <div className="chart-legend"><span><i style={{ background: COLORS.roof2 }} /> PVGIS / Fallback</span></div>
      </section>
      <section className="panel insight-panel insight-wide">
        <SectionTitle eyebrow="Jahreskurve" title="Wie verändert sich das Profil über die Monate?" action={<button className="link-button" onClick={() => onNavigate('year')}>Jahresdetails</button>} />
        <LineChart points={yearPoints} keys={['totalReal']} labels={{ totalReal: 'Gesamtanlage' }} height={240} />
        {rows.length < 365 && <small className="insight-note">Die Jahresberechnung läuft noch. Die Kurve wird mit den fertig berechneten Tagen aufgebaut.</small>}
      </section>
    </div>
  </main>
}

function YearPage({ settings, rows, year, setYear, progress, clippingKwh, calculating }: { settings: Settings; rows: YearRow[]; year: number; setYear: (y: number) => void; progress: number; clippingKwh: number; calculating: boolean }) {
  const total = rows.reduce((s, r) => s + r.totalReal, 0); const totalKwp = configuredRoofSides(settings).reduce((sum, side) => sum + (side.active ? side.powerKwp : 0), 0); const monthly = Array.from({ length: 12 }, (_, month) => rows.filter((r) => Number(r.date.slice(5, 7)) - 1 === month).reduce((s, r) => s + r.totalReal, 0))
  return <main><div className="page-heading compact"><div><span className="eyebrow">Jahresanalyse</span><h1>Das komplette Ertragsjahr</h1><p>Jeder Kalendertag wird auf Basis der standortbezogenen PVGIS-Klimadaten berechnet.</p></div><div className="year-control"><label>Jahr<input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label><button className="secondary" onClick={() => downloadCsv(`solar-jahr-${year}.csv`, [['Datum', 'S1 kWh', 'S2 kWh', 'Gesamt kWh', 'Peak kW', 'Peak Uhrzeit', 'Clipping kWh'], ...rows.map((r) => [r.date, r.roof1Real, r.roof2Real, r.totalReal, r.peakReal, r.peakTime, r.clippingKwh])])}>CSV exportieren</button></div></div>{calculating && <div className="calculation-note">Jahreswerte werden aktualisiert: {n(progress * 100, 0)} %</div>}{progress < 1 && <div className="progress"><span style={{ width: `${progress * 100}%` }} /></div>}<div className="metric-grid"><Metric label="Realistischer Ertrag" value={kwh(total)} detail={`${n(total / Math.max(.1, totalKwp), 0)} kWh/kWp`} accent="teal" /><Metric label="Ø pro Tag" value={kwh(rows.length ? total / rows.length : 0)} detail={`${rows.length} von ${daysInYear(year)} Kalendertagen`} /><Metric label="Wechselrichter-Clipping" value={kwh(clippingKwh)} detail={settings.inverterLimit ? `Limit ${kw(settings.inverterLimit)}` : 'Kein Limit konfiguriert'} /></div><section className="panel year-chart"><SectionTitle eyebrow="Monatssummen" title="Klimatischer Ertrag nach Monat" /><div className="month-bars">{monthly.map((value, i) => <div key={i} className="month-column"><div className="month-value">{n(value, 0)}</div><div className="month-bar"><i style={{ height: `${value / Math.max(...monthly, 1) * 100}%` }} /></div><span>{['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][i]}</span></div>)}</div><div className="chart-legend"><span><i style={{ background: COLORS.roof2 }} /> PVGIS / Fallback</span></div></section><EnergyTable rows={rows} download={() => downloadCsv(`solar-jahr-${year}.csv`, [['Datum', 'S1 kWh', 'S2 kWh', 'Gesamt kWh', 'Peak kW', 'Peak Uhrzeit', 'Clipping kWh'], ...rows.map((r) => [r.date, r.roof1Real, r.roof2Real, r.totalReal, r.peakReal, r.peakTime, r.clippingKwh])])} /></main>
}

function Field({ label, value, onChange, suffix, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; min?: number; max?: number; step?: number }) { return <label className="field"><span>{label}</span><div><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <em>{suffix}</em>}</div></label> }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span />{label}</label> }

function LegacySettingsPage({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const update = (path: 'roof1' | 'roof2', key: string, value: number | boolean) => setSettings((s) => ({ ...s, [path]: { ...s[path], [key]: value } }))
  return <main><div className="page-heading compact"><div><span className="eyebrow">Anlage konfigurieren</span><h1>Standort und Dachflächen</h1><p>Die Konfiguration wird automatisch in diesem Browser gespeichert.</p></div><button className="secondary" onClick={() => setSettings(DEFAULT_SETTINGS)}>Auf Standard zurücksetzen</button></div><div className="settings-layout"><div><section className="panel settings-panel"><SectionTitle eyebrow="Standort" title="Wo steht die Anlage?" /><div className="field-grid"><label className="field wide"><span>Ort</span><input value={settings.location} onChange={(e) => setSettings((s) => ({ ...s, location: e.target.value }))} /></label><Field label="Breitengrad" value={settings.latitude} onChange={(v) => setSettings((s) => ({ ...s, latitude: v }))} suffix="° N" min={-90} max={90} step={.01} /><Field label="Längengrad" value={settings.longitude} onChange={(v) => setSettings((s) => ({ ...s, longitude: v }))} suffix="° E" min={-180} max={180} step={.01} /><label className="field wide"><span>Zeitzone</span><input value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))} /></label></div></section><section className="panel settings-panel"><SectionTitle eyebrow="Dachfläche 1" title="Morgenorientierte Fläche" /><Toggle label="Dachfläche aktiv" checked={settings.roof1.active} onChange={(v) => update('roof1', 'active', v)} /><div className="field-grid"><Field label="Installierte Leistung" value={settings.roof1.powerKwp} onChange={(v) => update('roof1', 'powerKwp', v)} suffix="kWp" min={0} max={1000} step={.1} /><Field label="Azimut" value={settings.roof1.azimuth} onChange={(v) => update('roof1', 'azimuth', ((v % 360) + 360) % 360)} suffix={directionName(settings.roof1.azimuth)} min={0} max={359} /><Field label="Dachneigung" value={settings.roof1.tilt} onChange={(v) => update('roof1', 'tilt', v)} suffix="°" min={0} max={90} /><Field label="Systemverluste" value={settings.roof1.systemLoss} onChange={(v) => update('roof1', 'systemLoss', v)} suffix="%" min={0} max={60} /></div><p className="field-hint">Azimut: 0° = Nord · 90° = Ost · 180° = Süd · 270° = West</p></section><section className="panel settings-panel"><SectionTitle eyebrow="Dachfläche 2" title="Gegenüberliegende Fläche" /><Toggle label="Dachfläche aktiv" checked={settings.roof2.active} onChange={(v) => update('roof2', 'active', v)} /><Toggle label="Ausrichtung automatisch gegenüber Fläche 1" checked={settings.roof2Opposite} onChange={(v) => setSettings((s) => ({ ...s, roof2Opposite: v }))} /><Toggle label="Dachneigung von Fläche 1 übernehmen" checked={settings.roof2TiltLinked} onChange={(v) => setSettings((s) => ({ ...s, roof2TiltLinked: v }))} /><div className="opposite-preview"><span>Aktuelle Gegenüberliegende Ausrichtung</span><strong>{azimuthText(settings.roof2Opposite ? oppositeAzimuth(settings.roof1.azimuth) : settings.roof2.azimuth)}</strong></div><div className="field-grid"><Field label="Installierte Leistung" value={settings.roof2.powerKwp} onChange={(v) => update('roof2', 'powerKwp', v)} suffix="kWp" min={0} max={1000} step={.1} /><Field label="Freies Azimut" value={settings.roof2.azimuth} onChange={(v) => update('roof2', 'azimuth', ((v % 360) + 360) % 360)} suffix={directionName(settings.roof2.azimuth)} min={0} max={359} /><Field label="Freie Dachneigung" value={settings.roof2.tilt} onChange={(v) => update('roof2', 'tilt', v)} suffix="°" min={0} max={90} /><Field label="Systemverluste" value={settings.roof2.systemLoss} onChange={(v) => update('roof2', 'systemLoss', v)} suffix="%" min={0} max={60} /></div></section><section className="panel settings-panel"><SectionTitle eyebrow="System" title="Verluste und Wechselrichter" /><div className="field-grid"><Field label="Albedo Bodenreflexion" value={settings.albedo} onChange={(v) => setSettings((s) => ({ ...s, albedo: v }))} min={0} max={1} step={.01} /><Field label="AC-Wechselrichterlimit" value={settings.inverterLimit ?? 0} onChange={(v) => setSettings((s) => ({ ...s, inverterLimit: v > 0 ? v : null }))} suffix={settings.inverterLimit ? 'kW' : 'aus'} min={0} max={1000} step={.1} /></div><Toggle label="Leistung je Dachfläche auf Nennleistung begrenzen" checked={settings.capAtRatedPower} onChange={(v) => setSettings((s) => ({ ...s, capAtRatedPower: v }))} /></section></div><aside className="method-card"><span className="eyebrow">Methodik</span><h2>Wie wird gerechnet?</h2><p>Der Sonnenstand wird für jeden Zeitpunkt anhand von Datum, UTC-Zeit, Standort, Deklination und Zeitgleichung berechnet. Die Zeitzone wird mit den Browser-Zeitzonenregeln inklusive Sommerzeit aufgelöst.</p><dl><dt>PVGIS-Klima</dt><dd>PVGIS-Monatsklima für den Standort und die jeweilige Ausrichtung. Innerhalb eines Monats wird die zeitliche Kurve aus dem Sonnenverlauf skaliert.</dd><dt>Leistung</dt><dd>kWp × Einstrahlungsprofil / 1000, danach Systemverluste, Nennleistungsgrenze und optionales AC-Clipping.</dd><dt>Energie</dt><dd>Jeder Leistungswert wird mit dem Zeitintervall multipliziert und zu kWh integriert.</dd></dl><div className="assumption"><strong>Transparente Annahme</strong><span>Die Ergebnisreihe ist eine klimatische Erwartung und keine exakte Wettervorhersage. Temperatur- und Leitungsverluste sind im konfigurierbaren Systemverlust enthalten.</span></div></aside></div></main>
}

type PlaceSuggestion = { display_name: string; lat: string; lon: string }

function LocationSearch({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const [query, setQuery] = useState(settings.location)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  useEffect(() => setQuery(settings.location), [settings.location])
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3 || trimmed === settings.location) { setSuggestions([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ format: 'jsonv2', limit: '5', 'accept-language': 'de', q: trimmed })
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: controller.signal })
        if (response.ok) setSuggestions(await response.json() as PlaceSuggestion[])
      } catch { /* Aborted searches are expected while typing. */ }
      finally { setSearching(false) }
    }, 450)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, settings.location])
  const select = (place: PlaceSuggestion) => {
    setQuery(place.display_name)
    setSuggestions([])
    setSettings((current) => ({ ...current, location: place.display_name, latitude: Number(place.lat), longitude: Number(place.lon) }))
  }
  return <div className="location-search"><label className="field wide"><span>Ort suchen</span><input value={query} placeholder="z. B. Bad Lauchstädt" onChange={(event) => setQuery(event.target.value)} onFocus={() => query.length >= 3 && query !== settings.location && setSuggestions(suggestions)} /></label>{searching && <small className="search-status">Orte werden gesucht ...</small>}{suggestions.length > 0 && <div className="suggestions" role="listbox">{suggestions.map((place) => <button type="button" key={`${place.lat}-${place.lon}-${place.display_name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => select(place)}><strong>{place.display_name.split(',')[0]}</strong><span>{place.display_name}</span></button>)}</div>}<small className="field-hint">Tippe mindestens drei Zeichen. Die Suche liefert zunehmend passendere Ortsvorschläge; bei Auswahl werden die Koordinaten übernommen.</small></div>
}

function SettingsPage({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const sides = configuredRoofSides(settings)
  const updateSide = (index: number, key: keyof RoofSide, value: string | number | boolean) => setSettings((current) => {
    const next = [...configuredRoofSides(current)]
    next[index] = { ...next[index], [key]: value }
    return { ...current, roofSides: next, roof1: next[0], roof2: next[1] ?? current.roof2 }
  })
  const addSide = () => setSettings((current) => {
    const next = [...configuredRoofSides(current), { id: `roof-${Date.now()}`, name: `Dachfläche ${configuredRoofSides(current).length + 1}`, active: true, powerKwp: 5, azimuth: 180, tilt: 25, systemLoss: 14 }]
    return { ...current, roofSides: next, roof1: next[0], roof2: next[1] }
  })
  const removeSide = (index: number) => setSettings((current) => {
    if (configuredRoofSides(current).length <= 1) return current
    const next = configuredRoofSides(current).filter((_, sideIndex) => sideIndex !== index)
    return { ...current, roofSides: next, roof1: next[0], roof2: next[1] ?? current.roof2 }
  })
  return <main><div className="page-heading compact"><div><span className="eyebrow">Anlage konfigurieren</span><h1>Standort und Dachflächen</h1><p>Bis zu 10 Flächen können unabhängig konfiguriert und gemeinsam simuliert werden.</p></div><button className="secondary" onClick={() => setSettings(DEFAULT_SETTINGS)}>Auf Standard zurücksetzen</button></div><div className="settings-layout"><div><section className="panel settings-panel"><SectionTitle eyebrow="Standort" title="Wo steht die Anlage?" /><LocationSearch settings={settings} setSettings={setSettings} /><div className="field-grid"><Field label="Breitengrad" value={settings.latitude} onChange={(v) => setSettings((s) => ({ ...s, latitude: v }))} suffix="°" min={-90} max={90} step={.01} /><Field label="Längengrad" value={settings.longitude} onChange={(v) => setSettings((s) => ({ ...s, longitude: v }))} suffix="°" min={-180} max={180} step={.01} /><label className="field wide"><span>Zeitzone</span><input value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))} /></label></div></section><section className="panel settings-panel"><div className="section-title"><div><span>Dachflächen · {sides.length} von 10</span><h2>Jede Fläche separat pflegen</h2></div><button className="secondary" disabled={sides.length >= 10} onClick={addSide}>+ Fläche hinzufügen</button></div>{sides.map((side, index) => <div className="surface-editor" key={side.id || index}><div className="surface-heading"><label className="surface-name-field"><span>Bezeichnung</span><input className="surface-name" value={side.name || `Dachfläche ${index + 1}`} placeholder={`Dachfläche ${index + 1}`} onChange={(e) => updateSide(index, 'name', e.target.value)} aria-label={`Name Dachfläche ${index + 1}`} /></label><div><Toggle label="Aktiv" checked={side.active} onChange={(v) => updateSide(index, 'active', v)} />{sides.length > 1 && <button className="remove-button" title="Dachfläche entfernen" onClick={() => removeSide(index)}>×</button>}</div></div><div className="field-grid"><Field label="Installierte Leistung" value={side.powerKwp} onChange={(v) => updateSide(index, 'powerKwp', v)} suffix="kWp" min={0} max={1000} step={.1} /><Field label="Azimut" value={side.azimuth} onChange={(v) => updateSide(index, 'azimuth', ((v % 360) + 360) % 360)} suffix={directionName(side.azimuth)} min={0} max={359} /><Field label="Dachneigung" value={side.tilt} onChange={(v) => updateSide(index, 'tilt', v)} suffix="°" min={0} max={90} /><Field label="Systemverluste" value={side.systemLoss} onChange={(v) => updateSide(index, 'systemLoss', v)} suffix="%" min={0} max={60} /></div>{index === 0 && <p className="field-hint">Azimut: 0° = Nord · 90° = Ost · 180° = Süd · 270° = West</p>}{index === 1 && <><Toggle label="Ausrichtung automatisch gegenüber Fläche 1" checked={settings.roof2Opposite} onChange={(v) => setSettings((s) => ({ ...s, roof2Opposite: v }))} /><Toggle label="Dachneigung von Fläche 1 übernehmen" checked={settings.roof2TiltLinked} onChange={(v) => setSettings((s) => ({ ...s, roof2TiltLinked: v }))} /><div className="opposite-preview"><span>Berechnete Ausrichtung</span><strong>{azimuthText(configuredRoofSides(settings)[1].azimuth)}</strong></div></>}</div>)}</section><section className="panel settings-panel"><SectionTitle eyebrow="System" title="Verluste und Wechselrichter" /><div className="field-grid"><Field label="Albedo Bodenreflexion" value={settings.albedo} onChange={(v) => setSettings((s) => ({ ...s, albedo: v }))} min={0} max={1} step={.01} /><Field label="AC-Wechselrichterlimit" value={settings.inverterLimit ?? 0} onChange={(v) => setSettings((s) => ({ ...s, inverterLimit: v > 0 ? v : null }))} suffix={settings.inverterLimit ? 'kW' : 'aus'} min={0} max={1000} step={.1} /></div><Toggle label="Leistung je Fläche auf Nennleistung begrenzen" checked={settings.capAtRatedPower} onChange={(v) => setSettings((s) => ({ ...s, capAtRatedPower: v }))} /></section></div><aside className="method-card"><span className="eyebrow">Methodik</span><h2>Bis zu 10 Flächen, eine Summe</h2><p>Jede aktive Fläche wird separat aus Sonnenstand, Ausrichtung, Neigung, Einstrahlung und PVGIS-Klimadaten berechnet. Danach werden alle Flächen am Wechselrichter zusammengeführt.</p><dl><dt>Ortssuche</dt><dd>Die Vorschläge kommen aus OpenStreetMap/Nominatim. Nach der Auswahl werden Name und Koordinaten gemeinsam gespeichert.</dd><dt>PVGIS</dt><dd>Für jede aktive Dachfläche werden standortbezogene Monatsfaktoren geladen und lokal zwischengespeichert.</dd><dt>AC-Clipping</dt><dd>Das Wechselrichterlimit wird auf die Summe aller aktiven Flächen angewendet.</dd><dt>Energie</dt><dd>Jeder Leistungswert wird mit dem Zeitintervall multipliziert und zu kWh integriert.</dd></dl><div className="assumption"><strong>Transparente Annahme</strong><span>Temperatur- und Leitungsverluste sind je Fläche im Systemverlust enthalten. Die Ortssuche benötigt eine Internetverbindung; die manuelle Koordinateneingabe bleibt verfügbar.</span></div></aside></div></main>
}

function downloadCsv(filename: string, rows: unknown[][]) { const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\n'); const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url) }

export default function App() {
  const [settings, setSettings] = useStoredSettings(); const [page, setPage] = useState<Page>('overview'); const [date, setDate] = useState(today()); const [year, setYear] = useState(new Date().getFullYear()); const [weather, setWeather] = useState<WeatherData>({ factors: { factors: [], roof1: [], roof2: [] }, source: 'fallback', loadedAt: '', note: '' }); const [weatherLoading, setWeatherLoading] = useState(false); const [yearRows, setYearRows] = useState<YearRow[]>([]); const [progress, setProgress] = useState(0); const [yearCalculating, setYearCalculating] = useState(false)
  useEffect(() => {
    let alive = true
    setWeatherLoading(true)
    const timer = window.setTimeout(() => {
      loadWeatherData(settings).then((data) => { if (alive) { setWeather(data); setWeatherLoading(false) } })
    }, 350)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [settings])
  const day = useMemo(() => calculateDay(settings, date, weather.factors.factors.length ? weather.factors : undefined), [settings, date, weather])
  useEffect(() => {
    if (page !== 'overview' && page !== 'insights' && page !== 'year') return
    let alive = true
    let cursor = 0
    const totalDays = daysInYear(year)
    const factors = weather.factors.factors.length ? weather.factors : undefined
    setYearRows([])
    setProgress(0)
    setYearCalculating(true)
    let timer = 0
    const runChunk = () => {
      if (!alive) return
      const chunk = calculateYearChunk(settings, year, factors, cursor, 4)
      cursor += chunk.length
      setYearRows((previous) => [...previous, ...chunk])
      setProgress(cursor / totalDays)
      if (cursor < totalDays) timer = window.setTimeout(runChunk, 10)
      else setYearCalculating(false)
    }
    timer = window.setTimeout(runChunk, 60)
    return () => { alive = false; window.clearTimeout(timer); setYearCalculating(false) }
  }, [settings, year, weather, page])
  const clippingKwh = useMemo(() => yearRows.reduce((sum, row) => sum + row.clippingKwh, 0), [yearRows])
  const calculating = weatherLoading || yearCalculating
  return <div className="app-shell"><Header page={page} setPage={setPage} source={weather.source} calculating={calculating} /><div className="main-shell">{page === 'overview' && <Overview settings={settings} day={day} yearRows={yearRows} onNavigate={setPage} />}{page === 'day' && <DayPage settings={settings} date={date} setDate={setDate} day={day} weatherSource={weather.source} />}{page === 'insights' && <InsightsPage settings={settings} day={day} rows={yearRows} onNavigate={setPage} />}{page === 'year' && <YearPage settings={settings} rows={yearRows} year={year} setYear={setYear} progress={progress} clippingKwh={clippingKwh} calculating={yearCalculating} />}{page === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} />}</div><footer>Solarertrag · {settings.location} · Modellstand 2026 · Werte dienen der Planung und ersetzen keine Fachplanung.</footer></div>
}
