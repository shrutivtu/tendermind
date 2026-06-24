// Database schema — defined with Drizzle ORM
// Tables are created incrementally as we build each pipeline layer

import { pgTable, text, integer, timestamp, real, uuid, jsonb, index, uniqueIndex, boolean, customType } from 'drizzle-orm/pg-core'

// pgvector support — drizzle-orm@0.30 doesn't export vector natively
// We only ever query this column via raw SQL (<=> operator), so text-like storage is fine
const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${config.dimensions})`,
    fromDriver: (v: string) => v.slice(1, -1).split(',').map(Number),
    toDriver: (v: number[]) => `[${v.join(',')}]`,
  })(name)

// ─── CPV Codes (Common Procurement Vocabulary) ───────────────────────────────
// 9,454 standardised category codes used in all EU tenders
export const cpvCodes = pgTable('cpv_codes', {
  code: text('code').primaryKey(),          // e.g. "72000000"
  label: text('label').notNull(),           // e.g. "IT services: consulting, software development..."
  parentCode: text('parent_code'),          // hierarchical — "72000000" parent of "72200000"
  level: integer('level').notNull(),        // 0 = division, 1 = group, 2 = class, 3 = category
})

// ─── Notices ──────────────────────────────────────────────────────────────────
// Pre-indexed tender notices from TED (ingested every 6 hours)
export const notices = pgTable('notices', {
  id: text('id').primaryKey(),              // TED publication number e.g. "00123456-2024"
  type: text('type').notNull(),             // contract_notice | contract_award_notice | prior_info
  title: text('title').notNull(),           // translated to English
  titleOriginal: text('title_original'),    // original language
  description: text('description'),         // translated summary
  language: text('language').notNull(),     // original language code
  country: text('country').notNull(),       // buyer country ISO code
  buyerName: text('buyer_name'),
  buyerCountry: text('buyer_country'),
  cpvCodes: text('cpv_codes').array(),      // array of CPV codes
  estimatedValue: real('estimated_value'),  // always EUR (converted from original)
  originalValue: real('original_value'),   // raw value in original currency
  currency: text('currency'),              // ISO 4217 e.g. "PLN", "EUR"
  deadline: timestamp('deadline'),          // submission deadline
  publicationDate: timestamp('publication_date').notNull(),
  url: text('url'),                         // link back to TED
  rawData: jsonb('raw_data'),               // full raw JSON for on-demand use
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  countryIdx: index('notices_country_idx').on(table.country),
  deadlineIdx: index('notices_deadline_idx').on(table.deadline),
  pubDateIdx: index('notices_pub_date_idx').on(table.publicationDate),
}))

// ─── Notice Embeddings ────────────────────────────────────────────────────────
// Vector representations for semantic search (pgvector)
export const noticeEmbeddings = pgTable('notice_embeddings', {
  noticeId: text('notice_id').primaryKey().references(() => notices.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1536 }),  // OpenAI text-embedding-3-small
  embeddedText: text('embedded_text'),   // what was embedded (title + desc + cpv labels)
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Awards ──────────────────────────────────────────────────────────────────
// Contract award notices — who won, at what price (Intel agent data)
export const awards = pgTable('awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  noticeId: text('notice_id'),             // related contract notice if known
  awardedValue: real('awarded_value'),     // EUR
  winnerName: text('winner_name'),
  winnerCountry: text('winner_country'),
  buyerName: text('buyer_name'),
  buyerCountry: text('buyer_country'),
  cpvCodes: text('cpv_codes').array(),
  publicationDate: timestamp('publication_date').notNull(),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Users + Organizations ───────────────────────────────────────────────────
// Auth is optional for the public demo flow. Signed-in users get private history,
// saved data, and an organization workspace.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}))

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userOrgIdx: uniqueIndex('organization_members_user_org_idx').on(table.userId, table.organizationId),
}))

// ─── Anonymous Sessions + Usage ───────────────────────────────────────────────
// Lets visitors experience the agent before signup while enforcing hard limits.
export const anonymousSessions = pgTable('anonymous_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstSeenAt: timestamp('first_seen_at').defaultNow(),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
  claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  claimedAt: timestamp('claimed_at'),
})

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  anonymousSessionId: uuid('anonymous_session_id').references(() => anonymousSessions.id, { onDelete: 'cascade' }),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  usageUserIdx: index('usage_events_user_idx').on(table.userId, table.createdAt),
  usageAnonIdx: index('usage_events_anon_idx').on(table.anonymousSessionId, table.createdAt),
  usageIpIdx: index('usage_events_ip_idx').on(table.ipHash, table.createdAt),
}))

// ─── Company Profiles ─────────────────────────────────────────────────────────
// What the user tells us about their company (used for matching)
export const companyProfiles = pgTable('company_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id'),              // legacy browser session field
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  anonymousSessionId: uuid('anonymous_session_id').references(() => anonymousSessions.id, { onDelete: 'set null' }),
  name: text('name'),
  description: text('description').notNull(), // "we build healthcare software for hospitals"
  country: text('country'),
  cpvCodes: text('cpv_codes').array(),        // mapped from description by CPV mapper
  keywords: text('keywords').array(),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Search Sessions ──────────────────────────────────────────────────────────
// One row per Scout+Analyst run. Persists across page reloads.
// Status lifecycle: scout_running → analyst_running → complete | error
export const searchSessions = pgTable('search_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  anonymousSessionId: uuid('anonymous_session_id').references(() => anonymousSessions.id, { onDelete: 'set null' }),
  isPublic: boolean('is_public').notNull().default(false),
  expiresAt: timestamp('expires_at'),
  // Company info (denormalised so historical searches preserve context)
  companyDescription: text('company_description').notNull(),
  countryFilter: text('country_filter'),       // ISO alpha-3 or null = all
  // Pipeline status
  status: text('status').notNull().default('scout_running'),
  //   scout_running   → Scout agent is searching
  //   analyst_running → Scout done, Analyst evaluating
  //   complete        → Both agents finished
  //   error           → Something failed
  errorMessage: text('error_message'),
  // Scout outputs (stored as JSON array of MatchedNotice)
  scoutMatches: jsonb('scout_matches'),        // MatchedNotice[]
  matchCount: integer('match_count').default(0),
  topScore: integer('top_score'),
  // Analyst outputs
  analystSummary: text('analyst_summary'),     // Strategic summary text
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  createdAtIdx: index('sessions_created_at_idx').on(table.createdAt),
  ownerIdx: index('sessions_owner_idx').on(table.organizationId, table.userId, table.anonymousSessionId),
}))

// ─── Tender Evaluations ───────────────────────────────────────────────────────
// One row per tender per session — written by the Analyst agent as it streams.
export const tenderEvaluations = pgTable('tender_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => searchSessions.id, { onDelete: 'cascade' }),
  noticeId: text('notice_id').notNull(),
  recommendation: text('recommendation').notNull(), // pursue | consider | skip
  priority: integer('priority').notNull(),           // 1–5 (5 = highest)
  winProbability: text('win_probability').notNull(), // high | medium | low
  estimatedEffort: text('estimated_effort').notNull(),// low | medium | high
  risks: text('risks').array(),
  strengths: text('strengths').array(),
  keyRequirement: text('key_requirement'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  sessionIdx: index('evaluations_session_idx').on(table.sessionId),
}))
