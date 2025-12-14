function makeError(code, message, details) {
  return { code, message, details }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toIsoDateFromParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

function isValidYmd(year, month, day) {
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

function parseIsoDate(raw) {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(raw)
  if (!m) return null

  const [y, mo, d] = raw.split('-').map((v) => Number(v))
  if (!isValidYmd(y, mo, d)) return null
  return { family: 'iso', date_iso: toIsoDateFromParts(y, mo, d) }
}

function parseIsoTimestamp(raw) {
  const looksLikeIsoTs = /^\d{4}-\d{2}-\d{2}T/.test(raw)
  if (!looksLikeIsoTs) return null

  const dt = new Date(raw)
  if (!Number.isFinite(dt.getTime())) return null

  const year = dt.getFullYear()
  const month = dt.getMonth() + 1
  const day = dt.getDate()

  return { family: 'iso', date_iso: toIsoDateFromParts(year, month, day) }
}

function parseMonthNameDate(raw) {
  const s = String(raw).trim()
  if (!s) return null

  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }

  // Some exports include a time prefix: "11:38 PM, September 10 2024".
  // Some include a comma before year: "September 10, 2024".
  // Prefer removing only the leading time prefix (first comma) while preserving the rest.
  const afterFirstComma = s.includes(',') ? s.split(',').slice(1).join(',').trim() : s
  const candidate = afterFirstComma || s
  const m = /^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/.exec(candidate)
  if (!m) return null

  const monthToken = m[1].toLowerCase()
  const month = monthMap[monthToken]
  if (!month) return null

  const day = Number(m[2])
  const year = Number(m[3])
  if (!isValidYmd(year, month, day)) return { family: 'invalid' }

  return { family: 'month_name', date_iso: toIsoDateFromParts(year, month, day) }
}

function parseSlashDate(raw) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  if (!m) return null

  const a = Number(m[1])
  const b = Number(m[2])
  const year = Number(m[3])

  if (a < 1 || a > 31 || b < 1 || b > 31) return { family: 'invalid' }

  const isDmy = a > 12 && b <= 12
  const isMdy = b > 12 && a <= 12

  if (!isDmy && !isMdy) {
    return { family: 'ambiguous' }
  }

  const day = isDmy ? a : b
  const month = isDmy ? b : a

  if (!isValidYmd(year, month, day)) return { family: 'invalid' }

  return {
    family: isDmy ? 'dmy' : 'mdy',
    date_iso: toIsoDateFromParts(year, month, day),
  }
}

function addDaysIso(dateIso, deltaDays) {
  const [y, m, d] = dateIso.split('-').map((v) => Number(v))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return toIsoDateFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

export function normalizeDatesInRows(rows, options) {
  const dateKey = options?.dateKey ?? 'date'
  const sourceName = options?.sourceName ?? 'unknown'
  const onMissingDate = options?.onMissingDate ?? 'error'
  const warnings = []

  if (!Array.isArray(rows)) {
    return { ok: false, error: makeError('DATE_INVALID', 'Rows must be an array.') }
  }

  const families = new Set()
  const normalized = []

  let droppedMissing = 0

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const raw = row?.[dateKey]

    if (raw === null || raw === undefined || String(raw).trim().length === 0) {
      if (onMissingDate === 'drop') {
        droppedMissing += 1
        continue
      }

      return {
        ok: false,
        error: makeError('DATE_INVALID', `Missing date at row ${i + 1} in ${sourceName}.`, {
          rowIndex: i,
        }),
      }
    }

    const s = String(raw).trim()

    const parsed = parseIsoDate(s) ?? parseIsoTimestamp(s) ?? parseMonthNameDate(s) ?? parseSlashDate(s)
    if (!parsed) {
      return {
        ok: false,
        error: makeError('DATE_INVALID', `Unrecognized date format at row ${i + 1} in ${sourceName}.`, {
          rowIndex: i,
          value: s,
        }),
      }
    }

    if (parsed.family === 'ambiguous') {
      return {
        ok: false,
        error: makeError('DATE_AMBIGUOUS', `Ambiguous date at row ${i + 1} in ${sourceName}.`, {
          rowIndex: i,
          value: s,
        }),
      }
    }

    if (parsed.family === 'invalid') {
      return {
        ok: false,
        error: makeError('DATE_INVALID', `Invalid date at row ${i + 1} in ${sourceName}.`, {
          rowIndex: i,
          value: s,
        }),
      }
    }

    families.add(parsed.family)

    normalized.push({
      ...row,
      date_raw: s,
      date_iso: parsed.date_iso,
    })
  }

  if (droppedMissing > 0) {
    warnings.push(`Dropped ${droppedMissing} rows in ${sourceName} due to missing dates.`)
  }

  const distinctFamilies = Array.from(families)
  const effectiveFamilies = new Set(distinctFamilies.map((f) => (f === 'iso' ? 'iso' : f)))

  if (effectiveFamilies.size > 1) {
    return {
      ok: false,
      error: makeError(
        'DATE_MIXED_FORMATS',
        `Mixed date formats detected in ${sourceName}. Use a single format per file.`,
        {
          families: Array.from(effectiveFamilies),
        }
      ),
    }
  }

  const dateSet = new Set(normalized.map((r) => r.date_iso))
  if (dateSet.size < 7) {
    warnings.push(`Only ${dateSet.size} distinct dates found in ${sourceName}. Some metrics may be limited.`)
  }

  const sortedDates = Array.from(dateSet).sort()
  if (sortedDates.length >= 2) {
    const min = sortedDates[0]
    const max = sortedDates[sortedDates.length - 1]

    const missing = []
    let cursor = min
    while (cursor < max) {
      cursor = addDaysIso(cursor, 1)
      if (cursor < max && !dateSet.has(cursor)) missing.push(cursor)
    }

    if (missing.length) {
      const preview = missing.slice(0, 5).join(', ')
      warnings.push(`Detected ${missing.length} missing dates between ${min} and ${max}. Example: ${preview}`)
    }
  }

  return { ok: true, rows: normalized, warnings }
}
