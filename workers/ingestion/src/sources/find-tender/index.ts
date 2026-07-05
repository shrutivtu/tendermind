// UK Find a Tender source adapter.
// Paginates the OCDS release-package API (cursor in links.next), normalizes
// each page, and yields batches to the shared pipeline.

import { fetchReleasePackage, isoTimestamp, type FTRelease } from './client.js'
import { normalizeRelease } from './normalizer.js'
import type { NormalizedNotice, SourceAdapter } from '../../types.js'

export const findTenderSource: SourceAdapter = {
  name: 'find-tender',
  label: 'UK (Find a Tender)',

  async *fetchBatches({ daysBack, fxRates, maxPages }) {
    const updatedFrom = isoTimestamp(daysBack)
    let cursor: string | undefined
    let page = 1

    while (true) {
      const pkg = await fetchReleasePackage({
        updatedFrom,
        stages: 'tender',   // active opportunities only
        limit: 100,
        cursor,
      })

      const releases: FTRelease[] = pkg.releases ?? []
      if (releases.length === 0) break

      yield releases
        .map(r => normalizeRelease(r, fxRates))
        .filter(Boolean) as NormalizedNotice[]

      // Pagination: cursor token lives in the links.next URL
      const nextUrl = pkg.links?.next
      if (!nextUrl) break
      const nextCursor = new URL(nextUrl).searchParams.get('cursor')
      if (!nextCursor) break
      if (maxPages > 0 && page >= maxPages) break

      cursor = nextCursor
      page++

      // Polite delay between pages
      await new Promise(r => setTimeout(r, 500))
    }
  },
}
