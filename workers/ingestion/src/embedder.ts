// Embedder
// Generates vector embeddings for notices using OpenAI text-embedding-3-small.
// We embed: title + description + CPV labels (concatenated).
// These vectors power semantic search in the Scout agent.

import OpenAI from 'openai'
import { withRetry } from './retry.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// text-embedding-3-small: 1536 dimensions, cheap ($0.02/1M tokens), fast
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_BATCH = 100  // OpenAI allows up to 2048 per call, we keep it safe

export interface EmbedInput {
  noticeId: string
  text: string  // title + description + CPV labels concatenated
}

export interface EmbedResult {
  noticeId: string
  embedding: number[]
  embeddedText: string
}

// Build the text we embed for a notice
export function buildEmbedText(
  title: string,
  description: string | null,
  cpvLabels: string[]
): string {
  const parts = [
    title,
    description ?? '',
    cpvLabels.length > 0 ? `Categories: ${cpvLabels.join(', ')}` : '',
  ]
  return parts.filter(Boolean).join('\n').slice(0, 8000)  // stay within token limits
}

// Batch embed — process in groups of MAX_BATCH to respect rate limits
export async function batchEmbed(inputs: EmbedInput[]): Promise<EmbedResult[]> {
  const results: EmbedResult[] = []

  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    const batch = inputs.slice(i, i + MAX_BATCH)

    // The SDK retries connection errors, but not mid-body resets
    // ("Invalid response body ... ECONNRESET") — so retry explicitly.
    const response = await withRetry('OpenAI embeddings', () =>
      openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch.map(b => b.text),
      })
    )

    for (let j = 0; j < batch.length; j++) {
      results.push({
        noticeId: batch[j].noticeId,
        embedding: response.data[j].embedding,
        embeddedText: batch[j].text,
      })
    }

    // Brief pause between batches to respect rate limits
    if (i + MAX_BATCH < inputs.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return results
}
