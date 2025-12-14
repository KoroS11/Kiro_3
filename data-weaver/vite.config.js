import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      if (!data) return resolve(null)
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWeatherDay({ key, q, dt, timeoutMs = 15000 }) {
  const url = new URL('https://api.weatherapi.com/v1/history.json')
  url.searchParams.set('key', key)
  url.searchParams.set('q', q)
  url.searchParams.set('dt', dt)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
  } catch (e) {
    clearTimeout(timer)
    const code = e?.name === 'AbortError' ? 'WEATHERAPI_TIMEOUT' : 'WEATHERAPI_FETCH_FAILED'
    return {
      ok: false,
      error: {
        code,
        message: `WeatherAPI request failed for ${dt}.`,
        details: String(e),
      },
    }
  }

  clearTimeout(timer)
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

function weatherApiProxyPlugin({ getKey }) {
  const route = '/api/weather/bulk-history'

  const cacheTtlMs = 24 * 60 * 60 * 1000
  const cache = new Map()

  function cacheKey(q, dt) {
    return `${String(q).trim().toLowerCase()}|${String(dt).trim()}`
  }

  function getCached(q, dt) {
    const k = cacheKey(q, dt)
    const entry = cache.get(k)
    if (!entry) return null
    if (Date.now() - entry.ts > cacheTtlMs) {
      cache.delete(k)
      return null
    }
    return entry.row
  }

  function setCached(q, dt, row) {
    cache.set(cacheKey(q, dt), { ts: Date.now(), row })
  }

  async function runWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length)
    let idx = 0

    const runners = Array.from({ length: concurrency }, async () => {
      while (idx < items.length) {
        const current = idx
        idx += 1
        results[current] = await worker(items[current], current)
      }
    })

    await Promise.all(runners)
    return results
  }

  async function handler(req, res, next) {
    try {
      if (!req.url?.startsWith(route)) return next()
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }))
        return
      }

      const key = getKey()
      if (!key) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'WEATHERAPI_KEY_MISSING', message: 'WEATHERAPI_KEY is not set on the server.' },
          })
        )
        return
      }

      const body = await readJsonBody(req)
      const q = body?.q
      const dates = body?.dates
      const delayMs = Number.isFinite(body?.delayMs) ? body.delayMs : 0
      const timeoutMs = Number.isFinite(body?.timeoutMs) ? body.timeoutMs : 15000
      const maxConcurrency = Number.isFinite(body?.maxConcurrency) ? body.maxConcurrency : 3

      if (!q || !Array.isArray(dates) || dates.length === 0) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'BAD_REQUEST', message: 'Body must include q and dates[].' },
          })
        )
        return
      }

      const cleanedDates = Array.from(
        new Set(
          dates
            .map((d) => String(d ?? '').trim())
            .filter(Boolean)
        )
      )

      if (cleanedDates.length === 0) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'BAD_REQUEST', message: 'dates[] must contain at least one non-empty date string.' },
          })
        )
        return
      }

      if (cleanedDates.length > 400) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'TOO_MANY_DATES', message: 'Too many dates requested in one call (max 400).' },
          })
        )
        return
      }

      const safeConcurrency = Math.min(6, Math.max(1, Math.floor(maxConcurrency)))

      const rows = []
      const failures = []

      const cachedRows = []
      const toFetch = []
      for (const dt of cleanedDates) {
        const cached = getCached(q, dt)
        if (cached) cachedRows.push(cached)
        else toFetch.push(dt)
      }

      rows.push(...cachedRows)

      await runWithConcurrency(toFetch, safeConcurrency, async (dt, i) => {
        const result = await fetchWeatherDay({ key, q, dt, timeoutMs })

        if (!result.ok) failures.push({ dt, error: result.error })
        else {
          rows.push(result.row)
          setCached(q, dt, result.row)
        }

        if (delayMs > 0 && i < toFetch.length - 1) await sleep(delayMs)
      })

      res.statusCode = failures.length ? 207 : 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, rows, failures }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: String(e) } }))
    }
  }

  return {
    name: 'weatherapi-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  const configDir = path.dirname(fileURLToPath(new URL(import.meta.url)))

  // loadEnv reads .env, .env.local, .env.[mode], etc from the provided root.
  // Using prefix '' loads all variables (not just VITE_*) for server-side usage.
  const env = loadEnv(mode, configDir, '')
  const keyFromEnvFile = env.WEATHERAPI_KEY

  return {
    root: configDir,
    plugins: [
      react(),
      weatherApiProxyPlugin({
        getKey: () => process.env.WEATHERAPI_KEY || keyFromEnvFile,
      }),
    ],
  }
})
