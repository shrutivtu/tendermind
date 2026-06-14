// ECB Exchange Rate Fetcher
// Fetches daily reference rates from the European Central Bank.
// These are official EU rates: 1 EUR = X units of foreign currency.
//
// ECB publishes rates every working day around 16:00 CET:
// https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
//
// Non-eurozone EU countries and their currencies:
//   Poland       POL → PLN
//   Czech Rep.   CZE → CZK
//   Sweden       SWE → SEK
//   Romania      ROU → RON
//   Hungary      HUN → HUF
//   Denmark      DNK → DKK
//   Bulgaria     BGR → BGN (pegged at ~1.9558, ECB still publishes it)

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

// Map ISO alpha-3 country → ISO 4217 currency code
// Countries NOT in this map use EUR
export const COUNTRY_CURRENCY: Record<string, string> = {
  POL: 'PLN',
  CZE: 'CZK',
  SWE: 'SEK',
  ROU: 'RON',
  HUN: 'HUF',
  DNK: 'DKK',
  BGR: 'BGN',
}

export type FxRates = Record<string, number>

// Fallback rates — used when ECB API is unreachable.
// These are approximate mid-2025 rates. Close enough for value display;
// update this object periodically if precision matters.
const FALLBACK_RATES: FxRates = {
  EUR: 1,
  PLN: 4.28,
  CZK: 25.20,
  SEK: 11.02,
  RON: 4.97,
  HUF: 395.0,
  DKK: 7.46,
  BGN: 1.9558,  // fixed peg since 1999
}

export async function fetchECBRates(): Promise<FxRates> {
  console.log('[FX] Fetching daily rates from ECB...')

  try {
    const res = await fetch(ECB_URL, {
      headers: { 'Accept': 'application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(8000),  // 8s timeout
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const xml = await res.text()

    // ECB XML format: <Cube currency="PLN" rate="4.2765"/>
    // Use flexible regex — allow both single and double quotes, optional whitespace
    const rates: FxRates = {
      EUR: 1,
      BGN: 1.9558,  // Bulgarian lev — fixed peg to EUR since 1999, ECB doesn't publish it
    }
    const matches = xml.matchAll(/currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']/g)
    for (const m of matches) {
      rates[m[1]] = parseFloat(m[2])
    }

    const needed = Object.values(COUNTRY_CURRENCY)
    const captured = needed.filter(c => rates[c])

    if (captured.length === 0) {
      throw new Error('XML parsed but no rates found — format may have changed')
    }

    console.log(`[FX] Live ECB rates captured: ${captured.join(', ')}`)
    return rates

  } catch (err) {
    console.warn(`[FX] ECB fetch failed (${err instanceof Error ? err.message : err}). Using fallback rates.`)
    console.warn('[FX] Fallback rates are approximate — update FALLBACK_RATES periodically.')
    return { ...FALLBACK_RATES }
  }
}

// Convert a value in any currency to EUR
// ECB rate = "1 EUR = X units", so: EUR = value / rate
export function toEur(value: number, currency: string, rates: FxRates): number {
  if (currency === 'EUR') return value
  const rate = rates[currency]
  if (!rate) {
    console.warn(`[FX] No rate for ${currency} — storing value unconverted`)
    return value
  }
  return value / rate
}

// Get the currency for a given country (defaults to EUR for eurozone)
export function currencyForCountry(countryAlpha3: string): string {
  return COUNTRY_CURRENCY[countryAlpha3] ?? 'EUR'
}
