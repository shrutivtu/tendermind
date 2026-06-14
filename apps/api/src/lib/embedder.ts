// Shared embedding utility for the API layer
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })
  return res.data[0].embedding
}
