function makeError(code, message, details) {
  return { code, message, details }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toIsoDateFromDate(dt) {
  return `${String(dt.getFullYear()).padStart(4, '0')}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

function parseIsoToDate(dateIso) {
  const [y, m, d] = dateIso.split('-').map((v) => Number(v))
  return new Date(y, m - 1, d)
}

function addDays(dateIso, deltaDays) {
  const dt = parseIsoToDate(dateIso)
  dt.setDate(dt.getDate() + deltaDays)
  return toIsoDateFromDate(dt)
}

function aggregateOrdersDaily(orderRows) {
  const byDate = new Map()

  for (const r of orderRows) {
    const dateIso = r?.date_iso
    const value = r?.total_orders

    if (!dateIso) continue

    const orders = Number(value)
    if (!Number.isFinite(orders)) continue

    byDate.set(dateIso, (byDate.get(dateIso) ?? 0) + orders)
  }

  const dates = Array.from(byDate.keys()).sort()
  const rows = dates.map((d) => ({ date_iso: d, total_orders: byDate.get(d) }))

  return rows
}

function aggregateWeatherDaily(weatherRows) {
  const acc = new Map()

  for (const r of weatherRows) {
    const dateIso = r?.date_iso
    if (!dateIso) continue

    const temperature = r?.temperature_c
    const rainfall = r?.rainfall_mm
    const humidity = r?.humidity_pct

    const bucket = acc.get(dateIso) ?? {
      countTemp: 0,
      sumTemp: 0,
      sumRain: 0,
      countHumidity: 0,
      sumHumidity: 0,
    }

    if (Number.isFinite(temperature)) {
      bucket.countTemp += 1
      bucket.sumTemp += Number(temperature)
    }

    if (Number.isFinite(rainfall)) {
      bucket.sumRain += Number(rainfall)
    }

    if (Number.isFinite(humidity)) {
      bucket.countHumidity += 1
      bucket.sumHumidity += Number(humidity)
    }

    acc.set(dateIso, bucket)
  }

  const byDate = new Map()
  for (const [dateIso, b] of acc.entries()) {
    if (b.countTemp === 0) continue
    byDate.set(dateIso, {
      date_iso: dateIso,
      temperature_c: b.sumTemp / b.countTemp,
      rainfall_mm: b.sumRain,
      humidity_pct: b.countHumidity ? b.sumHumidity / b.countHumidity : null,
    })
  }

  return byDate
}

function findNearestWeather(dateIso, weatherByDate, maxGapDays) {
  if (weatherByDate.has(dateIso)) {
    return { ok: true, weather: weatherByDate.get(dateIso), imputed: false }
  }

  for (let offset = 1; offset <= maxGapDays; offset += 1) {
    const prev = addDays(dateIso, -offset)
    if (weatherByDate.has(prev)) {
      return { ok: true, weather: weatherByDate.get(prev), imputed: true }
    }

    const next = addDays(dateIso, offset)
    if (weatherByDate.has(next)) {
      return { ok: true, weather: weatherByDate.get(next), imputed: true }
    }
  }

  return { ok: false }
}

export function mergeOrdersWithWeather(orderRows, weatherRows, options = {}) {
  const warnings = []
  const maxGapDays = Number.isFinite(options.maxGapDays) ? options.maxGapDays : 3

  const dailyOrders = aggregateOrdersDaily(orderRows)
  const weatherByDate = aggregateWeatherDaily(weatherRows)

  const merged = []

  for (const o of dailyOrders) {
    const dateIso = o.date_iso

    const nearest = findNearestWeather(dateIso, weatherByDate, maxGapDays)
    if (!nearest.ok) {
      warnings.push(`Weather could not be imputed for ${dateIso} within ${maxGapDays} days. Dropping row.`)
      continue
    }

    const w = nearest.weather

    merged.push({
      date_iso: dateIso,
      total_orders: o.total_orders,
      temperature_c: w.temperature_c,
      rainfall_mm: w.rainfall_mm,
      humidity_pct: w.humidity_pct,
      imputed_weather: nearest.imputed,
    })
  }

  merged.sort((a, b) => (a.date_iso < b.date_iso ? -1 : a.date_iso > b.date_iso ? 1 : 0))

  if (merged.length === 0) {
    return {
      ok: false,
      error: makeError('MERGE_NO_ROWS', 'Merge produced no rows. Check date normalization and imputation rules.'),
    }
  }

  return { ok: true, rows: merged, warnings }
}
