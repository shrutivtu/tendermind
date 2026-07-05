// Retry helper for flaky network calls (OpenAI, TED, Find a Tender).
// CI runners hit transient ECONNRESET / "fetch failed" errors; a couple of
// backed-off retries turns those from failed runs into log noise.

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === attempts) break
      const cause = (err as { cause?: { code?: string } })?.cause?.code
      const detail = err instanceof Error ? err.message : String(err)
      const delayMs = 1000 * 2 ** (attempt - 1)
      console.warn(
        `  ⚠️  ${label} failed (attempt ${attempt}/${attempts}): ${detail}${cause ? ` [${cause}]` : ''} — retrying in ${delayMs / 1000}s`
      )
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}
