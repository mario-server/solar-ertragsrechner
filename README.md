# Solarertrag

Eine responsive React-/TypeScript-/Vite-Anwendung zur Planung und Auswertung einer PV-Anlage mit zwei gegenüberliegenden Dachflächen.

## Funktionen

- Sonnenstand mit Deklination, Zeitgleichung, UTC und konfigurierbarer IANA-Zeitzone
- POA-Modell aus direkter, diffuser und reflektierter Einstrahlung
- getrennte Klarhimmel- und realistische Klimawerte
- PVGIS-Monatsdaten mit lokalem, deutlich gekennzeichnetem Fallback
- 5-Minuten-Tagesprofil, 365/366-Tage-Jahresberechnung und Monatsaggregation
- AC-Wechselrichterlimit, Clipping, Systemverluste und lokale Speicherung
- Tages- und Jahres-CSV, technische Tabellenspalten und Methodik-Erklärung

## Start

```bash
npm install
npm run dev
```

Der PVGIS-Aufruf erfolgt aus dem Browser. Wenn die API nicht erreichbar ist, werden Idealwerte weiter berechnet und realistische Werte als Klimaschätzung markiert.

## Tests

```bash
npm test
```
