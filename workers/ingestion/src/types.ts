// Shared types for the multi-source ingestion pipeline.
// Each data source (EU TED, UK Find a Tender, …) implements SourceAdapter:
// it fetches raw notices, normalizes them into NormalizedNotice, and yields
// them in batches. The pipeline (pipeline.ts) handles everything after that —
// upserting notices, building embed text, and storing embeddings.

import type { FxRates } from './fx-rates.js'

export interface NormalizedNotice {
  id: string
  type: string
  title: string
  titleOriginal: string | null
  description: string | null
  language: string
  country: string                 // ISO 3166-1 alpha-3
  buyerName: string | null
  buyerCountry: string | null
  cpvCodes: string[]
  estimatedValue: number | null   // always EUR (converted at ingestion)
  originalValue: number | null    // raw value in original currency
  currency: string | null         // original currency code e.g. "PLN", "GBP"
  deadline: Date | null
  publicationDate: Date
  url: string
  rawData: unknown
}

export interface SourceContext {
  daysBack: number
  fxRates: FxRates
  /** Stop after this many pages — used for cheap smoke tests. 0 = no limit. */
  maxPages: number
}

export interface SourceAdapter {
  /** Value written to notices.source — 'ted' | 'find-tender' */
  name: string
  /** Human-readable label for logs */
  label: string
  /** Yields batches of normalized notices, handling pagination internally. */
  fetchBatches(ctx: SourceContext): AsyncGenerator<NormalizedNotice[]>
}
