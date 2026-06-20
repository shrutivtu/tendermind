import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toEur, currencyForCountry, COUNTRY_CURRENCY, fetchECBRates } from '../fx-rates'

// ─── currencyForCountry ───────────────────────────────────────────────────────

describe('currencyForCountry', () => {
  it('maps all known non-eurozone EU countries', () => {
    expect(currencyForCountry('POL')).toBe('PLN')
    expect(currencyForCountry('CZE')).toBe('CZK')
    expect(currencyForCountry('SWE')).toBe('SEK')
    expect(currencyForCountry('ROU')).toBe('RON')
    expect(currencyForCountry('HUN')).toBe('HUF')
    expect(currencyForCountry('DNK')).toBe('DKK')
    expect(currencyForCountry('BGR')).toBe('BGN')
  })

  it('returns EUR for eurozone countries', () => {
    expect(currencyForCountry('DEU')).toBe('EUR')
    expect(currencyForCountry('FRA')).toBe('EUR')
    expect(currencyForCountry('ITA')).toBe('EUR')
    expect(currencyForCountry('ESP')).toBe('EUR')
    expect(currencyForCountry('NLD')).toBe('EUR')
  })

  it('returns EUR for unknown codes', () => {
    expect(currencyForCountry('XXX')).toBe('EUR')
    expect(currencyForCountry('')).toBe('EUR')
  })

  it('COUNTRY_CURRENCY export covers exactly 7 non-eurozone countries', () => {
    expect(Object.keys(COUNTRY_CURRENCY)).toHaveLength(7)
  })
})

// ─── toEur ───────────────────────────────────────────────────────────────────

describe('toEur', () => {
  const rates = {
    EUR: 1,
    PLN: 4.28,
    CZK: 25.20,
    SEK: 11.02,
    RON: 4.97,
    HUF: 395.0,
    DKK: 7.46,
    BGN: 1.9558,
  }

  it('is a no-op for EUR', () => {
    expect(toEur(100, 'EUR', rates)).toBe(100)
    expect(toEur(0, 'EUR', rates)).toBe(0)
    expect(toEur(1_000_000, 'EUR', rates)).toBe(1_000_000)
  })

  it('converts PLN → EUR', () => {
    // 428 PLN ÷ 4.28 = 100 EUR
    expect(toEur(428, 'PLN', rates)).toBeCloseTo(100, 0)
  })

  it('converts CZK → EUR', () => {
    // 2520 CZK ÷ 25.20 = 100 EUR
    expect(toEur(2520, 'CZK', rates)).toBeCloseTo(100, 0)
  })

  it('converts BGN → EUR (fixed peg)', () => {
    // 195.58 BGN ÷ 1.9558 ≈ 100 EUR
    expect(toEur(195.58, 'BGN', rates)).toBeCloseTo(100, 0)
  })

  it('converts HUF → EUR', () => {
    // 39500 HUF ÷ 395 = 100 EUR
    expect(toEur(39500, 'HUF', rates)).toBeCloseTo(100, 0)
  })

  it('returns original value when rate is missing (safe fallback)', () => {
    // Unknown currency — toEur warns and returns value unchanged
    const partialRates = { EUR: 1, PLN: 4.28 }
    expect(toEur(1000, 'SEK', partialRates)).toBe(1000)
    expect(toEur(1000, 'RON', partialRates)).toBe(1000)
  })

  it('handles zero value', () => {
    expect(toEur(0, 'PLN', rates)).toBe(0)
  })

  it('handles large values accurately (real-world notice size)', () => {
    // 47_232_300 RON (the real bug we fixed) should be ~9.5M EUR
    const ronRates = { EUR: 1, RON: 4.97 }
    const eur = toEur(47_232_300, 'RON', ronRates)
    expect(eur).toBeCloseTo(9_503_481, -2) // within ±10k
  })
})

// ─── fetchECBRates ────────────────────────────────────────────────────────────

describe('fetchECBRates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses ECB XML and returns rates including hardcoded BGN', async () => {
    const mockXml = `<?xml version="1.0"?>
      <gesmes:Envelope>
        <Cube>
          <Cube time="2025-06-01">
            <Cube currency="PLN" rate="4.2765"/>
            <Cube currency="CZK" rate="25.189"/>
            <Cube currency="SEK" rate="10.9123"/>
            <Cube currency="RON" rate="4.9678"/>
            <Cube currency="HUF" rate="392.45"/>
            <Cube currency="DKK" rate="7.4601"/>
          </Cube>
        </Cube>
      </gesmes:Envelope>`

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXml,
    } as Response)

    const rates = await fetchECBRates()

    expect(rates.EUR).toBe(1)
    expect(rates.BGN).toBe(1.9558)  // hardcoded peg — never from ECB XML
    expect(rates.PLN).toBeCloseTo(4.2765, 4)
    expect(rates.CZK).toBeCloseTo(25.189, 3)
    expect(rates.RON).toBeCloseTo(4.9678, 4)
  })

  it('returns fallback rates when ECB is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const rates = await fetchECBRates()

    // Should not throw — fallback rates always include the 7 currencies
    expect(rates.EUR).toBe(1)
    expect(rates.BGN).toBe(1.9558)
    expect(rates.PLN).toBeGreaterThan(0)
    expect(rates.CZK).toBeGreaterThan(0)
  })

  it('returns fallback rates when API returns non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    const rates = await fetchECBRates()

    expect(rates.EUR).toBe(1)
    expect(rates.PLN).toBeGreaterThan(0)
  })
})
