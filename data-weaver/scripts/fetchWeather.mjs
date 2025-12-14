import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { parseCsvText } from '../src/utils/csvParser.js'
import { normalizeDatesInRows } from '../src/utils/dateNormalizer.js'

function usage() {
  return [
    'Usage:',
    '  node scripts/fetchWeather.mjs --orders <orders.csv> --out <weather.csv> --q <location> [--delayMs 1100]',
    '',
    'Environment:',
    '  WEATHERAPI_KEY must be set (recommended).',
    '',
    'Notes:',
    '  - Uses WeatherAPI History endpoint per date.',
    '  - Writes daily-level CSV: date,temperature,rainfall,humidity',
  ].join('\n')
}

function parseArgs(argv) {
  const args = {
    orders: null,
    out: null,
    q: null,
    delayMs: 1100,
    key: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--orders') args.orders = argv[++i] ?? null
    else if (a === '--out') args.out = argv[++i] ?? null
    else if (a === '--q') args.q = argv[++i] ?? null
    else if (a === '--delayMs') args.delayMs = Number(argv[++i] ?? 1100)
    else if (a === '--key') args.key = argv[++i] ?? null
    else if (a === '--help' || a === '-h') args.help = true
  }

  return args
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows) {
  const header = ['date', 'temperature', 'rainfall', 'humidity']
  const lines = [header.join(',')]

  for (const r of rows) {
    lines.push([
      csvEscape(r.date),
      csvEscape(r.temperature),
      csvEscape(r.rainfall),
      csvEscape(r.humidity),
    ].join(','))
  }

  return lines.join('\n') + '\n'
}

async function fetchWeatherDay({ key, q, dt }) {
  const url = new URL('https://api.weatherapi.com/v1/history.json')
  url.searchParams.set('key', key)
  url.searchParams.set('q', q)
  url.searchParams.set('dt', dt)

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      error: {
        code: 'WEATHERAPI_HTTP_ERROR',
        message: `WeatherAPI request failed for ${dt} (HTTP ${res.status}).`,
        details: body.slice(0, 500),
      },
    }
  }

  const json = await res.json()

  const day = json?.forecast?.forecastday?.[0]?.day
  if (!day) {
    return {
      ok: false,
      error: {
        code: 'WEATHERAPI_BAD_RESPONSE',
        message: `WeatherAPI response missing day forecast for ${dt}.`,
      },
    }
  }

  const temperature = day.avgtemp_c
  const rainfall = day.totalprecip_mm
  const humidity = day.avghumidity

  if (!Number.isFinite(temperature) || !Number.isFinite(rainfall) || !Number.isFinite(humidity)) {
    return {
      ok: false,
      error: {
        code: 'WEATHERAPI_BAD_VALUES',
        message: `WeatherAPI response had invalid numeric values for ${dt}.`,
        details: { temperature, rainfall, humidity },
      },
    }
  }

  return {
    ok: true,
    row: {
      date: dt,
      temperature,
      rainfall,
      humidity,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    process.exit(0)
  }

  const key = process.env.WEATHERAPI_KEY || args.key
  if (!key) {
    console.error('Missing WEATHERAPI_KEY environment variable.')
    console.error('Set WEATHERAPI_KEY or pass --key (not recommended).')
    console.error('')
    console.error(usage())
    process.exit(1)
  }

  if (!args.orders || !args.out || !args.q) {
    console.error('Missing required arguments.')
    console.error('')
    console.error(usage())
    process.exit(1)
  }

  const ordersPath = path.resolve(args.orders)
  const outPath = path.resolve(args.out)

  const ordersText = await readFile(ordersPath, 'utf8')

  const parsedOrders = parseCsvText(ordersText, { sourceName: 'orders' })
  if (!parsedOrders.ok) {
    console.error(parsedOrders.error)
    process.exit(1)
  }

  const normalizedOrders = normalizeDatesInRows(parsedOrders.rows, {
    dateKey: 'date',
    sourceName: 'orders',
  })

  if (!normalizedOrders.ok) {
    console.error(normalizedOrders.error)
    process.exit(1)
  }

  const uniqueDates = Array.from(new Set(normalizedOrders.rows.map((r) => r.date_iso))).sort()
  if (uniqueDates.length === 0) {
    console.error('No dates found in orders after normalization.')
    process.exit(1)
  }

  console.log(`Fetching weather for ${uniqueDates.length} dates for location: ${args.q}`)

  const rows = []
  const failures = []

  for (let i = 0; i < uniqueDates.length; i += 1) {
    const dt = uniqueDates[i]
    const result = await fetchWeatherDay({ key, q: args.q, dt })

    if (!result.ok) {
      failures.push({ dt, error: result.error })
      console.warn(`Failed for ${dt}: ${result.error.message}`)
    } else {
      rows.push(result.row)
      console.log(`OK ${dt}`)
    }

    if (i < uniqueDates.length - 1) await sleep(args.delayMs)
  }

  if (failures.length) {
    console.warn(`Completed with ${failures.length} failures.`)
  }

  const csv = toCsv(rows)
  await writeFile(outPath, csv, 'utf8')

  console.log(`Wrote ${rows.length} rows to: ${outPath}`)

  if (failures.length) {
    process.exitCode = 2
  }
}

await main()
