import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })
const r = await sql`SELECT source, COUNT(*)::int AS total, COUNT(description)::int AS with_desc FROM notices GROUP BY source`
console.table(r)
const e = await sql`SELECT COUNT(*)::int AS embeddings FROM notice_embeddings`
console.log('embeddings:', e[0].embeddings)
await sql.end()
