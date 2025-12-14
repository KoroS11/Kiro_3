export default function OrdersChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="card cardElevate">
        <div className="cardTitle">Orders Over Time</div>
        <div className="muted">No data loaded yet.</div>
      </div>
    )
  }

  const width = 900
  const height = 220
  const padding = 28

  const ys = data.map((d) => Number(d.total_orders)).filter((v) => Number.isFinite(v))
  const maxY = Math.max(...ys, 1)
  const minY = Math.min(...ys, 0)
  const ySpan = Math.max(1, maxY - minY)

  const xForIndex = (i) => {
    if (data.length === 1) return padding
    return padding + (i / (data.length - 1)) * (width - padding * 2)
  }

  const yForValue = (v) => {
    const t = (v - minY) / ySpan
    return height - padding - t * (height - padding * 2)
  }

  const linePath = data
    .map((d, i) => {
      const y = Number(d.total_orders)
      if (!Number.isFinite(y)) return null
      const x = xForIndex(i)
      const yy = yForValue(y)
      return `${i === 0 ? 'M' : 'L'} ${x} ${yy}`
    })
    .filter(Boolean)
    .join(' ')

  const maPath = data
    .map((d, i) => {
      const y = Number(d.moving_avg_7)
      if (!Number.isFinite(y)) return null
      const x = xForIndex(i)
      const yy = yForValue(y)
      return `${y === null ? '' : i === 0 ? 'M' : 'L'} ${x} ${yy}`
    })
    .filter(Boolean)
    .join(' ')

  const first = data[0]
  const last = data[data.length - 1]

  return (
    <div className="card cardElevate">
      <div className="cardTitle">Orders Over Time</div>
      <div className="muted">
        {first?.date_iso} → {last?.date_iso} ({data.length} days)
      </div>

      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Orders over time">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chartAxis" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chartAxis" />

        <path d={linePath} fill="none" className="chartLine draw" pathLength="1" />
        {maPath ? <path d={maPath} fill="none" className="chartLine dashed" pathLength="1" /> : null}

        {data.map((d, i) => {
          const y = Number(d.total_orders)
          if (!Number.isFinite(y)) return null
          const x = xForIndex(i)
          const yy = yForValue(y)
          const r = d.is_rainy ? 3.6 : 2.4
          return <circle key={d.date_iso} cx={x} cy={yy} r={r} className={d.is_rainy ? 'chartPoint rainy' : 'chartPoint'} />
        })}

        <text x={padding} y={padding - 10} className="chartLabel">max {Math.round(maxY)}</text>
        <text x={padding} y={height - 10} className="chartLabel">min {Math.round(minY)}</text>
      </svg>

      <div className="muted" style={{ marginTop: 8 }}>
        Solid: daily orders. Dashed: 7-day moving average. Larger dots: rainy days.
      </div>
    </div>
  )
}
