export default function TempScatterChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="card cardElevate">
        <div className="cardTitle">Temperature vs Orders</div>
        <div className="muted">No data loaded yet.</div>
      </div>
    )
  }

  const points = data
    .map((d) => ({
      x: Number(d.temperature_c),
      y: Number(d.total_orders),
      rainy: Boolean(d.is_rainy),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  const width = 900
  const height = 220
  const padding = 28

  if (points.length === 0) {
    return (
      <div className="card cardElevate">
        <div className="cardTitle">Temperature vs Orders</div>
        <div className="muted">No numeric temperature/order points.</div>
      </div>
    )
  }

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const xSpan = Math.max(1e-6, maxX - minX)
  const ySpan = Math.max(1, maxY - minY)

  const xFor = (x) => padding + ((x - minX) / xSpan) * (width - padding * 2)
  const yFor = (y) => height - padding - ((y - minY) / ySpan) * (height - padding * 2)

  // Simple least-squares regression line y = a + b x
  const n = points.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    const dx = p.x - meanX
    sxx += dx * dx
    sxy += dx * (p.y - meanY)
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = meanY - slope * meanX

  const yAtMinX = intercept + slope * minX
  const yAtMaxX = intercept + slope * maxX

  const corr = (() => {
    let num = 0
    let denX = 0
    let denY = 0
    for (const p of points) {
      const dx = p.x - meanX
      const dy = p.y - meanY
      num += dx * dy
      denX += dx * dx
      denY += dy * dy
    }
    const denom = Math.sqrt(denX * denY)
    if (!Number.isFinite(denom) || denom === 0) return null
    return num / denom
  })()

  return (
    <div className="card cardElevate">
      <div className="cardTitle">Temperature vs Orders</div>

      <div className="muted">
        Points: {points.length}. Pearson r: {corr === null ? 'N/A' : Math.round(corr * 1000) / 1000}
      </div>

      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Temperature vs orders scatter">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chartAxis" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chartAxis" />

        <line
          x1={xFor(minX)}
          y1={yFor(yAtMinX)}
          x2={xFor(maxX)}
          y2={yFor(yAtMaxX)}
          className="chartLine dashed draw"
        />

        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={xFor(p.x)}
            cy={yFor(p.y)}
            r={p.rainy ? 3.4 : 2.4}
            className={p.rainy ? 'chartPoint rainy' : 'chartPoint'}
          />
        ))}

        <text x={padding} y={padding - 10} className="chartLabel">{Math.round(maxY)}</text>
        <text x={padding} y={height - 10} className="chartLabel">{Math.round(minY)}</text>
        <text x={width - padding - 90} y={height - 10} className="chartLabel">{Math.round(minX)}°C</text>
        <text x={width - padding - 90} y={padding - 10} className="chartLabel">{Math.round(maxX)}°C</text>
      </svg>

      <div className="muted" style={{ marginTop: 8 }}>
        Dashed line is a simple trend line. Larger dots: rainy days.
      </div>
    </div>
  )
}
