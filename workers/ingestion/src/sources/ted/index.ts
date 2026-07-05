// EU TED source adapter.
// Paginates the TED REST API v3 (page numbers), normalizes each page,
// and yields batches to the shared pipeline.

import {
  searchNotices,
  buildRecentNoticesQuery,
  NOTICE_FIELDS,
} from './client.js'
import { normalizeNotice } from './normalizer.js'
import type { NormalizedNotice, SourceAdapter } from '../../types.js'

export const tedSource: SourceAdapter = {
  name: 'ted',
  label: 'EU (TED)',

  async *fetchBatches({ daysBack, fxRates, maxPages }) {
    const query = buildRecentNoticesQuery(daysBack)
    let page = 1

    while (true) {
      const response = await searchNotices({
        query,
        fields: NOTICE_FIELDS,
        page,
        limit: 100,
      })
      if (response.notices.length === 0) break

      yield response.notices
        .map(r => normalizeNotice(r, fxRates))
        .filter(Boolean) as NormalizedNotice[]

      const totalPages = Math.ceil(response.totalNoticeCount / 100)
      if (page >= totalPages) break
      if (maxPages > 0 && page >= maxPages) break
      page++

      // Polite delay between pages
      await new Promise(r => setTimeout(r, 300))
    }
  },
}
