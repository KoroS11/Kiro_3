import { useMemo, useState } from 'react'
import DataLoader from './components/DataLoader.jsx'
import KPICard from './components/KPICard.jsx'
import OrdersChart from './components/charts/OrdersChart.jsx'
import WeatherImpactChart from './components/charts/WeatherImpactChart.jsx'
import TempScatterChart from './components/charts/TempScatterChart.jsx'

export default function App() {
  const [state, setState] = useState({
    rawOrders: [],
    rawWeather: [],
    mergedData: [],
    kpis: {
      totalOrders: 0,
      avgOrdersPerDay: 0,
      rainyDayAvg: null,
      nonRainyDayAvg: null,
      percentIncrease: null,
    },
    chartData: {
      ordersOverTime: null,
      weatherImpact: null,
      tempCorrelation: null,
    },
    warnings: [],
    loading: false,
    error: null,
    viewMode: 'daily',
  })

  const datasetSummary = useMemo(() => {
    if (!Array.isArray(state.mergedData) || state.mergedData.length === 0) return null
    const sorted = [...state.mergedData].sort((a, b) => (a.date_iso < b.date_iso ? -1 : a.date_iso > b.date_iso ? 1 : 0))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    const rainyDays = state.kpis.rainyDays ?? null
    const nonRainyDays = state.kpis.nonRainyDays ?? null
    const imputedWeatherPct = state.kpis.imputedWeatherPct ?? null
    const corr = state.kpis.tempOrderCorr ?? null

    return {
      days: sorted.length,
      dateRange: `${first.date_iso} → ${last.date_iso}`,
      rainyDays,
      nonRainyDays,
      imputedWeatherPct,
      corr,
    }
  }, [state.mergedData, state.kpis])

  const kpiCards = useMemo(() => {
    const pct = (v) => (v === null || v === undefined ? null : `${v}%`)
    const num = (v) => (v === null || v === undefined ? null : v)

    return [
      { label: 'Total Orders', value: num(state.kpis.totalOrders) },
      { label: 'Avg Orders/Day', value: num(state.kpis.avgOrdersPerDay) },
      { label: 'Rainy Day Avg', value: num(state.kpis.rainyDayAvg) },
      { label: 'Non-Rainy Day Avg', value: num(state.kpis.nonRainyDayAvg) },
      { label: 'Rainy Days', value: num(state.kpis.rainyDays) },
      { label: 'Δ Rainy vs Non‑Rainy', value: pct(state.kpis.percentIncrease) },
      { label: 'Imputed Weather', value: pct(state.kpis.imputedWeatherPct) },
      { label: 'Best Weekday', value: state.kpis.bestWeekday },
      { label: 'Temp↔Orders (r)', value: num(state.kpis.tempOrderCorr) },
      { label: 'Max Orders Day', value: state.kpis.maxOrdersDay },
    ]
  }, [state.kpis])

  return (
    <div className="container">
      <h1>Data Weaver</h1>
      <p className="muted">
        Pipeline-first: load, validate, normalize dates, merge, then visualize.
      </p>

      <DataLoader state={state} setState={setState} />

      {state.loading ? <p className="muted">Running pipeline…</p> : null}

      {state.error ? <p className="error">{state.error.message}</p> : null}

      {datasetSummary ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="cardTitle">Dataset Summary</div>
          <div className="grid" style={{ marginTop: 6 }}>
            <div style={{ gridColumn: 'span 4' }}>
              <div className="muted">Days</div>
              <div>{datasetSummary.days}</div>
            </div>
            <div style={{ gridColumn: 'span 8' }}>
              <div className="muted">Range</div>
              <div>{datasetSummary.dateRange}</div>
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <div className="muted">Rainy / Non‑rainy</div>
              <div>
                {datasetSummary.rainyDays ?? 'N/A'} / {datasetSummary.nonRainyDays ?? 'N/A'}
              </div>
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <div className="muted">Imputed Weather</div>
              <div>{datasetSummary.imputedWeatherPct === null ? 'N/A' : `${datasetSummary.imputedWeatherPct}%`}</div>
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <div className="muted">Temp↔Orders (r)</div>
              <div>{datasetSummary.corr === null ? 'N/A' : datasetSummary.corr}</div>
            </div>
          </div>
        </div>
      ) : null}

      {state.warnings?.length ? (
        <div className="card">
          <div className="cardTitle">Warnings</div>
          <ul>
            {state.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid" style={{ marginTop: 12 }}>
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ gridColumn: 'span 4' }}>
            <KPICard label={kpi.label} value={kpi.value} />
          </div>
        ))}
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div style={{ gridColumn: 'span 12' }}>
          <OrdersChart data={state.chartData.ordersOverTime} />
        </div>
        <div style={{ gridColumn: 'span 6' }}>
          <WeatherImpactChart data={state.chartData.weatherImpact} />
        </div>
        <div style={{ gridColumn: 'span 6' }}>
          <TempScatterChart data={state.chartData.tempCorrelation} />
        </div>
      </div>
    </div>
  )
}
