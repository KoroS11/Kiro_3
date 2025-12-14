import { useCallback, useMemo, useState } from 'react'
import { parseCsvText } from '../utils/csvParser.js'
import { normalizeDatesInRows } from '../utils/dateNormalizer.js'
import { mergeOrdersWithWeather } from '../utils/dataMerger.js'
import { calculateMetricsAndCharts } from '../utils/metricsCalculator.js'

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
    reader.readAsText(file)
  })
}

function defaultLocationFromCity(city) {
  const s = String(city ?? '').trim()
  if (!s) return ''
  if (s.toLowerCase() === 'delhi ncr') return 'Delhi'
  return s
}

async function fetchWeatherBulk({ q, dates, delayMs = 0, timeoutMs = 30000, maxConcurrency = 3 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const res = await fetch('/api/weather/bulk-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, dates, delayMs, timeoutMs, maxConcurrency }),
    signal: controller.signal,
  })

  clearTimeout(timer)

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok) {
    const err = json?.error ?? { code: 'WEATHER_FETCH_FAILED', message: 'Failed to fetch weather.' }
    throw err
  }

  return json
}

function chunkArray(arr, size) {
  const safeSize = Math.max(1, Math.floor(size))
  const out = []
  for (let i = 0; i < arr.length; i += safeSize) {
    out.push(arr.slice(i, i + safeSize))
  }
  return out
}

async function fetchWeatherInBatches({ q, dates, onProgress }) {
  const batchSize = 30
  const batches = chunkArray(dates, batchSize)

  const rows = []
  const failures = []

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i]
    onProgress?.({
      phase: 'Fetching weather',
      message: `Fetching weather ${Math.min((i * batchSize) + 1, dates.length)}-${Math.min((i + 1) * batchSize, dates.length)} of ${dates.length} days...`,
      completed: i * batchSize,
      total: dates.length,
    })

    const bulk = await fetchWeatherBulk({
      q,
      dates: batch,
      delayMs: 0,
      timeoutMs: 45000,
      maxConcurrency: 3,
    })

    rows.push(...(bulk.rows ?? []))
    failures.push(...(bulk.failures ?? []))
  }

  onProgress?.({
    phase: 'Fetching weather',
    message: `Weather fetched for ${rows.length}/${dates.length} days.`,
    completed: dates.length,
    total: dates.length,
  })

  return { rows, failures }
}

export default function DataLoader({ state, setState }) {
  const [ordersFile, setOrdersFile] = useState(null)
  const [weatherFile, setWeatherFile] = useState(null)
  const [location, setLocation] = useState('Delhi')
  const [autoFetchWeather, setAutoFetchWeather] = useState(true)
  const [runProgress, setRunProgress] = useState(null)
  const [weatherTest, setWeatherTest] = useState({
    loading: false,
    message: null,
    details: null,
  })

  const canRun = useMemo(() => {
    if (!ordersFile) return false
    if (weatherFile) return true
    if (!autoFetchWeather) return false
    return Boolean(String(location).trim())
  }, [ordersFile, weatherFile, autoFetchWeather, location])

  const canTestWeather = useMemo(() => {
    return Boolean(ordersFile && autoFetchWeather && String(location).trim() && !state.loading)
  }, [ordersFile, autoFetchWeather, location, state.loading])

  const onLoad = useCallback(
    async (ordersFileArg, weatherFileArg) => {
      if (!ordersFileArg) {
        setState((s) => ({
          ...s,
          error: { code: 'FILE_NOT_SELECTED', message: 'Select an orders CSV file.' },
        }))
        return
      }

      if (!weatherFileArg && !(autoFetchWeather && String(location).trim())) {
        setState((s) => ({
          ...s,
          error: {
            code: 'WEATHER_SOURCE_MISSING',
            message: 'Provide a weather CSV or enable auto-fetch with a location.',
          },
        }))
        return
      }

      setRunProgress({ phase: 'Starting', message: 'Reading files...', completed: 0, total: 0 })
      setState((s) => ({ ...s, loading: true, error: null, warnings: [] }))

      try {
        const ordersText = await readFileAsText(ordersFileArg)

        const parsedOrders = parseCsvText(ordersText, { sourceName: 'orders' })
        if (!parsedOrders.ok) throw parsedOrders.error

        let parsedWeather = null
        if (weatherFileArg) {
          const weatherText = await readFileAsText(weatherFileArg)
          parsedWeather = parseCsvText(weatherText, { sourceName: 'weather' })
          if (!parsedWeather.ok) throw parsedWeather.error
        }

        const inferredCity = parsedOrders.rows?.[0]?.city
        const inferredLocation = defaultLocationFromCity(inferredCity)
        if (inferredLocation && location === 'Delhi') {
          setLocation(inferredLocation)
        }

        const normalizedOrders = normalizeDatesInRows(parsedOrders.rows, {
          dateKey: 'date',
          sourceName: 'orders',
          onMissingDate: 'drop',
        })
        if (!normalizedOrders.ok) throw normalizedOrders.error

        let normalizedWeather = null
        let fetchFailures = []

        if (parsedWeather) {
          setRunProgress({ phase: 'Normalizing', message: 'Normalizing weather dates...', completed: 0, total: 0 })
          normalizedWeather = normalizeDatesInRows(parsedWeather.rows, {
            dateKey: 'date',
            sourceName: 'weather',
          })
          if (!normalizedWeather.ok) throw normalizedWeather.error
        } else {
          const uniqueDates = Array.from(new Set(normalizedOrders.rows.map((r) => r.date_iso))).sort()
          const q = String(location).trim()
          setRunProgress({
            phase: 'Fetching weather',
            message: `Fetching weather for ${uniqueDates.length} unique days...`,
            completed: 0,
            total: uniqueDates.length,
          })

          const bulk = await fetchWeatherInBatches({
            q,
            dates: uniqueDates,
            onProgress: (p) => setRunProgress(p),
          })

          fetchFailures = bulk.failures ?? []

          const apiWeatherRows = (bulk.rows ?? []).map((r) => ({
            date: r.date,
            temperature_c: r.temperature,
            rainfall_mm: r.rainfall,
            humidity_pct: r.humidity,
          }))

          const normalizedApiWeather = normalizeDatesInRows(apiWeatherRows, {
            dateKey: 'date',
            sourceName: 'weather',
          })
          if (!normalizedApiWeather.ok) throw normalizedApiWeather.error

          normalizedWeather = {
            ok: true,
            rows: normalizedApiWeather.rows,
            warnings: [
              ...(normalizedApiWeather.warnings ?? []),
              ...(fetchFailures.length
                ? [`Weather fetch failed for ${fetchFailures.length} dates; those days may be dropped.`]
                : []),
            ],
          }
        }

        setRunProgress({ phase: 'Merging', message: 'Merging orders with weather...', completed: 0, total: 0 })
        const merged = mergeOrdersWithWeather(normalizedOrders.rows, normalizedWeather.rows)
        if (!merged.ok) throw merged.error

        console.log('Merged dataset sample:', merged.rows.slice(0, 5))

        setRunProgress({ phase: 'Metrics', message: 'Calculating KPIs...', completed: 0, total: 0 })
        const metrics = calculateMetricsAndCharts(merged.rows)
        if (!metrics.ok) throw metrics.error

        setState((s) => ({
          ...s,
          rawOrders: parsedOrders.rows,
          rawWeather: parsedWeather ? parsedWeather.rows : normalizedWeather.rows,
          mergedData: merged.rows,
          kpis: metrics.kpis,
          chartData: metrics.chartData,
          warnings: [
            ...(parsedOrders.warnings ?? []),
            ...(parsedWeather?.warnings ?? []),
            ...(normalizedOrders.warnings ?? []),
            ...(normalizedWeather.warnings ?? []),
            ...(merged.warnings ?? []),
            ...(metrics.warnings ?? []),
          ],
          loading: false,
          error: null,
        }))

        setRunProgress(null)
      } catch (err) {
        const errorObj = typeof err === 'object' && err ? err : { code: 'UNKNOWN', message: String(err) }
        const code = errorObj.code ?? 'UNKNOWN'
        const message = errorObj.message ?? 'Unexpected error'

        setState((s) => ({
          ...s,
          loading: false,
          error: { code, message },
        }))

        setRunProgress(null)
      }
    },
    [setState, autoFetchWeather, location]
  )

  const onOrdersChange = useCallback(
    (e) => {
      const f = e.target.files?.[0] ?? null
      setOrdersFile(f)
    },
    []
  )

  const onWeatherChange = useCallback(
    (e) => {
      const f = e.target.files?.[0] ?? null
      setWeatherFile(f)
    },
    []
  )

  const onRun = useCallback(() => {
    void onLoad(ordersFile, weatherFile)
  }, [onLoad, ordersFile, weatherFile])

  const onTestWeather = useCallback(async () => {
    if (!ordersFile) return
    setWeatherTest({ loading: true, message: null, details: null })

    try {
      const ordersText = await readFileAsText(ordersFile)
      const parsedOrders = parseCsvText(ordersText, { sourceName: 'orders' })
      if (!parsedOrders.ok) throw parsedOrders.error

      const normalizedOrders = normalizeDatesInRows(parsedOrders.rows, {
        dateKey: 'date',
        sourceName: 'orders',
        onMissingDate: 'drop',
      })
      if (!normalizedOrders.ok) throw normalizedOrders.error

      const uniqueDates = Array.from(new Set(normalizedOrders.rows.map((r) => r.date_iso))).sort()
      const testDate = uniqueDates[uniqueDates.length - 1]
      if (!testDate) {
        setWeatherTest({
          loading: false,
          message: 'No valid dates found in orders to test weather fetch.',
          details: null,
        })
        return
      }

      const q = String(location).trim()
      const bulk = await fetchWeatherBulk({ q, dates: [testDate], delayMs: 0 })
      const row = bulk?.rows?.[0]

      if (!row) {
        setWeatherTest({
          loading: false,
          message: 'Weather test failed: no data returned.',
          details: bulk?.failures?.[0] ?? null,
        })
        return
      }

      setWeatherTest({
        loading: false,
        message: `Weather test OK for ${testDate} (${q}).`,
        details: row,
      })
    } catch (err) {
      const e = typeof err === 'object' && err ? err : { code: 'UNKNOWN', message: String(err) }
      const msg = e.message ?? 'Weather test failed.'
      setWeatherTest({ loading: false, message: msg, details: e })
    }
  }, [ordersFile, location])

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="cardTitle">Orders CSV</div>
          <input id="ordersFile" type="file" accept=".csv,text/csv" onChange={onOrdersChange} />
        </div>
        <div>
          <div className="cardTitle">Weather CSV</div>
          <input id="weatherFile" type="file" accept=".csv,text/csv" onChange={onWeatherChange} />
        </div>
        <div>
          <div className="cardTitle">Location (for auto weather)</div>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Delhi"
          />
          <div className="row" style={{ marginTop: 6 }}>
            <label>
              <input
                type="checkbox"
                checked={autoFetchWeather}
                onChange={(e) => setAutoFetchWeather(e.target.checked)}
              />
              Auto-fetch weather
            </label>
          </div>
        </div>
        <div className="muted">
          {state.loading ? 'Loading and validating...' : 'Load orders, then optionally weather.'}
        </div>
        <button disabled={!canRun || state.loading} onClick={onRun}>
          Run
        </button>
        <button disabled={!canTestWeather || weatherTest.loading} onClick={onTestWeather}>
          {weatherTest.loading ? 'Testing...' : 'Test Weather'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Tip: sample files are available at public/sample-data.
      </p>
      <p className="muted">
        Auto-fetch uses the dev-server proxy. Set WEATHERAPI_KEY in data-weaver/.env and restart dev server.
      </p>

      {runProgress?.message ? (
        <div className="muted" style={{ marginTop: 10 }}>
          {runProgress.message}
        </div>
      ) : null}

      {weatherTest.message ? (
        <div style={{ marginTop: 10 }}>
          <div className={weatherTest.details?.code ? 'error' : 'muted'}>{weatherTest.message}</div>
          {weatherTest.details ? (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(weatherTest.details, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
