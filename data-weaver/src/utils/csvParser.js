function makeError(code, message, details) {
  return { code, message, details }
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

function normalizeHeaderToken(token) {
  return String(token ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
}

function parseCsvLine(line, delimiter) {
  const out = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && ch === delimiter) {
      out.push(current)
      current = ''
      continue
    }

    current += ch
  }

  out.push(current)
  return out
}

function detectDelimiter(lines) {
  const candidates = [',', ';', '\t']
  const sample = lines.slice(0, 10)

  let best = { delimiter: ',', score: -1 }

  for (const delimiter of candidates) {
    const counts = sample.map((l) => parseCsvLine(l, delimiter).length)
    const nonTrivialCounts = counts.filter((c) => c > 1)

    if (nonTrivialCounts.length === 0) continue

    const freq = new Map()
    for (const c of nonTrivialCounts) freq.set(c, (freq.get(c) ?? 0) + 1)

    let modeCount = 0
    let modeFreq = 0
    for (const [c, f] of freq.entries()) {
      if (f > modeFreq) {
        modeFreq = f
        modeCount = c
      }
    }

    const consistency = modeFreq / sample.length
    const score = modeCount * consistency

    if (score > best.score) best = { delimiter, score }
  }

  return best.delimiter
}

function coerceNumber(value, fieldName, rowIndex) {
  if (value === null || value === undefined) return { ok: true, value: null }
  const s = String(value).trim()
  if (s.length === 0) return { ok: true, value: null }

  const normalized = s.replace(/,/g, '')
  const num = Number(normalized)
  if (!Number.isFinite(num)) {
    return {
      ok: false,
      error: makeError('CSV_INVALID_NUMBER', `Invalid number for ${fieldName} at row ${rowIndex + 1}.`, {
        field: fieldName,
        rowIndex,
        value: s,
      }),
    }
  }

  return { ok: true, value: num }
}

function pickColumn(normalizedHeaders, candidates) {
  for (const c of candidates) {
    if (normalizedHeaders.includes(c)) return c
  }
  return null
}

export function parseCsvText(text, options = {}) {
  const sourceName = options.sourceName ?? 'unknown'
  const warnings = []

  if (typeof text !== 'string') {
    return { ok: false, error: makeError('CSV_EMPTY', 'CSV content is empty.') }
  }

  const cleaned = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!cleaned) {
    return { ok: false, error: makeError('CSV_EMPTY', 'CSV content is empty.') }
  }

  const rawLines = cleaned.split('\n').map((l) => l.trimEnd())
  const lines = rawLines.filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return { ok: false, error: makeError('CSV_EMPTY', 'CSV must include a header and at least one row.') }
  }

  if (lines.length - 1 < 7) {
    return {
      ok: false,
      error: makeError('CSV_TOO_FEW_ROWS', 'CSV must have at least 7 data rows.', { rows: lines.length - 1 }),
    }
  }

  const delimiter = detectDelimiter(lines)
  const headerFields = parseCsvLine(lines[0], delimiter).map((h) => h.trim())

  const normalizedHeaders = []
  const headerToIndex = new Map()
  const seen = new Map()

  headerFields.forEach((h, idx) => {
    const base = normalizeHeaderToken(h)
    const next = (seen.get(base) ?? 0) + 1
    seen.set(base, next)
    const name = next === 1 ? base : `${base}_${next}`
    normalizedHeaders.push(name)
    headerToIndex.set(name, idx)
  })

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i], delimiter)
    if (fields.length !== headerFields.length) {
      warnings.push(`Row ${i + 1} has ${fields.length} columns; expected ${headerFields.length}.`)
    }

    const row = {}
    for (let c = 0; c < normalizedHeaders.length; c += 1) {
      const key = normalizedHeaders[c]
      const raw = fields[c] ?? ''
      const trimmed = String(raw).trim()
      row[key] = trimmed.length ? trimmed : null
    }

    rows.push(row)
  }

  const requiredBySource = {
    orders: {
      date: ['date', 'order_placed_at', 'order_placed_at_1'],
      total_orders: ['total_orders', 'order_count', 'orders', 'total'],
      order_id: ['order_id'],
    },
    weather: {
      date: ['date'],
      temperature_c: ['temperature_c', 'temperature', 'temp'],
      rainfall_mm: ['rainfall_mm', 'rainfall', 'precipitation', 'precip'],
      humidity_pct: ['humidity_pct', 'humidity'],
      rain_duration_minutes: ['rain_duration_minutes', 'rain_duration', 'duration_minutes', 'duration'],
    },
  }

  const schema = requiredBySource[sourceName]
  if (!schema) {
    return {
      ok: false,
      error: makeError('CSV_UNKNOWN_SCHEMA', `Unknown CSV schema: ${sourceName}.`),
    }
  }

  const canonicalColumnMap = {}
  for (const canonical of Object.keys(schema)) {
    canonicalColumnMap[canonical] = pickColumn(normalizedHeaders, schema[canonical])
  }

  const missing = []
  if (!canonicalColumnMap.date) missing.push('date')

  if (sourceName === 'orders') {
    const hasCount = Boolean(canonicalColumnMap.total_orders)
    const hasId = Boolean(canonicalColumnMap.order_id)
    if (!hasCount && !hasId) missing.push('total_orders (or order_id to infer counts)')
  }
  if (sourceName === 'weather') {
    if (!canonicalColumnMap.temperature_c) missing.push('temperature')
    if (!canonicalColumnMap.rainfall_mm) missing.push('rainfall')
  }

  if (missing.length) {
    return {
      ok: false,
      error: makeError(
        'MISSING_REQUIRED_COLUMN',
        `Missing required columns for ${sourceName}: ${missing.join(', ')}.`,
        {
          detectedHeaders: normalizedHeaders,
        }
      ),
    }
  }

  const canonicalRows = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]

    if (sourceName === 'orders') {
      const date = r[canonicalColumnMap.date]
      let coercedOrdersValue = null

      if (canonicalColumnMap.total_orders) {
        const ordersValue = r[canonicalColumnMap.total_orders]
        const coercedOrders = coerceNumber(ordersValue, 'total_orders', i)
        if (!coercedOrders.ok) return { ok: false, error: coercedOrders.error }
        coercedOrdersValue = coercedOrders.value
      } else if (canonicalColumnMap.order_id) {
        // Raw exports often have one row per order.
        // If order_id exists but no count column, infer total_orders = 1.
        coercedOrdersValue = 1
        if (i === 0) {
          warnings.push(
            `No total_orders column found in ${sourceName}; inferring total_orders=1 per row using order_id.`
          )
        }
      }

      canonicalRows.push({
        ...r,
        date,
        total_orders: coercedOrdersValue,
      })
    }

    if (sourceName === 'weather') {
      const date = r[canonicalColumnMap.date]
      const temperatureValue = r[canonicalColumnMap.temperature_c]
      const rainfallValue = r[canonicalColumnMap.rainfall_mm]
      const humidityValue = canonicalColumnMap.humidity_pct ? r[canonicalColumnMap.humidity_pct] : null
      const durationValue = canonicalColumnMap.rain_duration_minutes
        ? r[canonicalColumnMap.rain_duration_minutes]
        : null

      const temp = coerceNumber(temperatureValue, 'temperature_c', i)
      if (!temp.ok) return { ok: false, error: temp.error }

      const rain = coerceNumber(rainfallValue, 'rainfall_mm', i)
      if (!rain.ok) return { ok: false, error: rain.error }

      const humidity = coerceNumber(humidityValue, 'humidity_pct', i)
      if (!humidity.ok) return { ok: false, error: humidity.error }

      const duration = coerceNumber(durationValue, 'rain_duration_minutes', i)
      if (!duration.ok) return { ok: false, error: duration.error }

      canonicalRows.push({
        ...r,
        date,
        temperature_c: temp.value,
        rainfall_mm: rain.value,
        humidity_pct: humidity.value,
        rain_duration_minutes: duration.value,
      })
    }
  }

  return {
    ok: true,
    delimiter,
    headers: normalizedHeaders,
    rows: canonicalRows,
    warnings,
  }
}
