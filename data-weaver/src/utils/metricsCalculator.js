function makeError(code, message, details) {
  return { code, message, details }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function parseIsoToDate(dateIso) {
  const [y, m, d] = dateIso.split('-').map((v) => Number(v))
  return new Date(y, m - 1, d)
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null
  if (p <= 0) return sortedValues[0]
  if (p >= 1) return sortedValues[sortedValues.length - 1]

  const idx = (sortedValues.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedValues[lo]

  const w = idx - lo
  return sortedValues[lo] * (1 - w) + sortedValues[hi] * w
}

function safeAverage(values) {
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) return null
  const sum = finite.reduce((a, b) => a + b, 0)
  return sum / finite.length
}

function computeMovingAverage(values, windowSize) {
  if (values.length < windowSize) return values.map(() => null)

  const out = Array(values.length).fill(null)
  let sum = 0

  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]

    if (i >= windowSize) {
      sum -= values[i - windowSize]
    }

    if (i >= windowSize - 1) {
      out[i] = sum / windowSize
    }
  }

  return out
}

function pearsonCorrelation(xs, ys) {
  const pairs = []
  for (let i = 0; i < xs.length && i < ys.length; i += 1) {
    const x = xs[i]
    const y = ys[i]
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y])
  }

  if (pairs.length < 3) return null

  const n = pairs.length
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n

  let num = 0
  let denX = 0
  let denY = 0
  for (const [x, y] of pairs) {
    const dx = x - meanX
    const dy = y - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  const denom = Math.sqrt(denX * denY)
  if (!Number.isFinite(denom) || denom === 0) return null
  return num / denom
}

function dayOfWeekLabel(dow) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow] ?? String(dow)
}

export function calculateMetricsAndCharts(mergedRows, options = {}) {
  const warnings = []
  const rainThresholdMm = Number.isFinite(options.rainThresholdMm) ? options.rainThresholdMm : 1

  if (!Array.isArray(mergedRows) || mergedRows.length === 0) {
    return { ok: false, error: makeError('MERGE_NO_ROWS', 'No merged data to calculate metrics.') }
  }

  const rows = [...mergedRows].sort((a, b) => (a.date_iso < b.date_iso ? -1 : a.date_iso > b.date_iso ? 1 : 0))

  const temperatures = rows
    .map((r) => r.temperature_c)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)

  const p25 = percentile(temperatures, 0.25)
  const p75 = percentile(temperatures, 0.75)

  if (rows.length < 7) warnings.push('Dataset is shorter than 7 days; some metrics may be unstable.')

  const ordersSeries = rows.map((r) => Number(r.total_orders))
  const movingAvg7 = computeMovingAverage(ordersSeries, 7)

  const enriched = rows.map((r, idx) => {
    const rainfall = Number(r.rainfall_mm)
    const isRainy = Number.isFinite(rainfall) ? rainfall > rainThresholdMm : false

    const dt = parseIsoToDate(r.date_iso)
    const dayOfWeek = dt.getDay()

    let tempCategory = null
    if (Number.isFinite(r.temperature_c) && p25 !== null && p75 !== null) {
      if (r.temperature_c < p25) tempCategory = 'cold'
      else if (r.temperature_c > p75) tempCategory = 'hot'
      else tempCategory = 'moderate'
    }

    return {
      ...r,
      is_rainy: isRainy,
      day_of_week: dayOfWeek,
      temp_category: tempCategory,
      moving_avg_7: movingAvg7[idx],
    }
  })

  const totalOrders = enriched.reduce((sum, r) => sum + (Number.isFinite(r.total_orders) ? Number(r.total_orders) : 0), 0)
  const avgOrdersPerDay = totalOrders / enriched.length

  const imputedCount = enriched.reduce((n, r) => n + (r.imputed_weather ? 1 : 0), 0)
  const imputedPct = enriched.length ? imputedCount / enriched.length : 0

  const maxOrdersRow = enriched.reduce(
    (best, r) => (!best || (Number.isFinite(r.total_orders) && r.total_orders > best.total_orders) ? r : best),
    null
  )
  const minOrdersRow = enriched.reduce(
    (best, r) => (!best || (Number.isFinite(r.total_orders) && r.total_orders < best.total_orders) ? r : best),
    null
  )

  const hottestRow = enriched.reduce(
    (best, r) => (!best || (Number.isFinite(r.temperature_c) && r.temperature_c > best.temperature_c) ? r : best),
    null
  )
  const coldestRow = enriched.reduce(
    (best, r) => (!best || (Number.isFinite(r.temperature_c) && r.temperature_c < best.temperature_c) ? r : best),
    null
  )

  const rainyOrders = enriched.filter((r) => r.is_rainy).map((r) => r.total_orders)
  const nonRainyOrders = enriched.filter((r) => !r.is_rainy).map((r) => r.total_orders)

  const rainyDayAvg = safeAverage(rainyOrders)
  const nonRainyDayAvg = safeAverage(nonRainyOrders)

  const rainyDays = rainyOrders.length
  const nonRainyDays = nonRainyOrders.length

  let percentIncrease = null
  if (nonRainyDayAvg !== null && nonRainyDayAvg !== 0 && rainyDayAvg !== null) {
    percentIncrease = (rainyDayAvg - nonRainyDayAvg) / nonRainyDayAvg
  }

  const kpis = {
    totalOrders: Math.round(totalOrders),
    avgOrdersPerDay: Math.round(avgOrdersPerDay * 100) / 100,
    rainyDayAvg: rainyDayAvg === null ? null : Math.round(rainyDayAvg * 100) / 100,
    nonRainyDayAvg: nonRainyDayAvg === null ? null : Math.round(nonRainyDayAvg * 100) / 100,
    percentIncrease: percentIncrease === null ? null : Math.round(percentIncrease * 10000) / 100,
    rainyDays,
    nonRainyDays,
    imputedWeatherPct: Math.round(imputedPct * 10000) / 100,
    maxOrdersDay: maxOrdersRow ? `${maxOrdersRow.date_iso} (${maxOrdersRow.total_orders})` : null,
    minOrdersDay: minOrdersRow ? `${minOrdersRow.date_iso} (${minOrdersRow.total_orders})` : null,
    hottestDay: hottestRow && Number.isFinite(hottestRow.temperature_c) ? `${hottestRow.date_iso} (${Math.round(hottestRow.temperature_c * 10) / 10}°C)` : null,
    coldestDay: coldestRow && Number.isFinite(coldestRow.temperature_c) ? `${coldestRow.date_iso} (${Math.round(coldestRow.temperature_c * 10) / 10}°C)` : null,
  }

  const dowBuckets = Array.from({ length: 7 }, () => ({ count: 0, sumOrders: 0 }))
  for (const r of enriched) {
    const dow = r.day_of_week
    if (dow < 0 || dow > 6) continue
    if (!Number.isFinite(r.total_orders)) continue
    dowBuckets[dow].count += 1
    dowBuckets[dow].sumOrders += Number(r.total_orders)
  }

  const dayOfWeek = dowBuckets.map((b, dow) => ({
    dow,
    label: dayOfWeekLabel(dow),
    count: b.count,
    avg_orders: b.count ? b.sumOrders / b.count : null,
  }))

  const bestDow = dayOfWeek
    .filter((d) => Number.isFinite(d.avg_orders))
    .sort((a, b) => b.avg_orders - a.avg_orders)[0]
  const bestWeekday = bestDow ? `${bestDow.label} (${Math.round(bestDow.avg_orders * 100) / 100})` : null

  const tempXs = enriched.map((r) => (Number.isFinite(r.temperature_c) ? Number(r.temperature_c) : null))
  const orderYs = enriched.map((r) => (Number.isFinite(r.total_orders) ? Number(r.total_orders) : null))
  const tempOrderCorr = pearsonCorrelation(tempXs, orderYs)
  const tempOrderCorrRounded = tempOrderCorr === null ? null : Math.round(tempOrderCorr * 1000) / 1000
  kpis.bestWeekday = bestWeekday
  kpis.tempOrderCorr = tempOrderCorrRounded

  const chartData = {
    ordersOverTime: enriched.map((r) => ({
      date_iso: r.date_iso,
      total_orders: r.total_orders,
      is_rainy: r.is_rainy,
      moving_avg_7: r.moving_avg_7,
    })),
    weatherImpact: {
      rainyAvg: kpis.rainyDayAvg,
      nonRainyAvg: kpis.nonRainyDayAvg,
      percentDifference: kpis.percentIncrease,
      rainyDays: kpis.rainyDays,
      nonRainyDays: kpis.nonRainyDays,
    },
    tempCorrelation: enriched.map((r) => ({
      date_iso: r.date_iso,
      temperature_c: r.temperature_c,
      total_orders: r.total_orders,
      is_rainy: r.is_rainy,
    })),
    dayOfWeek,
    tempOrderCorr: tempOrderCorrRounded,
    tempBuckets: {
      p25,
      p75,
    },
  }

  return { ok: true, kpis, chartData, warnings }
}
