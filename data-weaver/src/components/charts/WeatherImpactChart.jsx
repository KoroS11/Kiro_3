export default function WeatherImpactChart({ data }) {
  if (!data) {
    return (
      <div className="card cardElevate">
        <div className="cardTitle">Weather Impact Comparison</div>
        <div className="muted">No data loaded yet.</div>
      </div>
    )
  }

  const rainyAvg = Number(data.rainyAvg)
  const nonRainyAvg = Number(data.nonRainyAvg)
  const max = Math.max(
    Number.isFinite(rainyAvg) ? rainyAvg : 0,
    Number.isFinite(nonRainyAvg) ? nonRainyAvg : 0,
    1
  )

  const width = 900
  const height = 140
  const padding = 18
  const barMaxW = width - padding * 2 - 120
  const wFor = (v) => (Number.isFinite(v) ? (v / max) * barMaxW : 0)

  const pct = data.percentDifference
  const pctText = pct === null || pct === undefined ? 'N/A' : `${pct}%`

  return (
    <div className="card cardElevate">
      <div className="cardTitle">Weather Impact Comparison</div>

      <div className="muted">
        Rain threshold: &gt; 1mm. Δ rainy vs non-rainy: {pctText}
      </div>

      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rainy vs non-rainy comparison">
        <text x={padding} y={32} className="chartLabel">Rainy days ({data.rainyDays ?? 0})</text>
        <rect x={160} y={18} width={wFor(rainyAvg)} height={18} className="chartBar" />
        <text x={160 + wFor(rainyAvg) + 8} y={32} className="chartLabel">{Number.isFinite(rainyAvg) ? rainyAvg : 'N/A'}</text>

        <text x={padding} y={80} className="chartLabel">Non-rainy ({data.nonRainyDays ?? 0})</text>
        <rect x={160} y={66} width={wFor(nonRainyAvg)} height={18} className="chartBar dashed" />
        <text x={160 + wFor(nonRainyAvg) + 8} y={80} className="chartLabel">{Number.isFinite(nonRainyAvg) ? nonRainyAvg : 'N/A'}</text>
      </svg>
    </div>
  )
}
