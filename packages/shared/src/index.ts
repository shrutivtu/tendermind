// Shared TypeScript types used across api, web, and workers

export type NoticeType = 'contract_notice' | 'contract_award_notice' | 'prior_information_notice'

export interface Notice {
  id: string
  type: NoticeType
  title: string
  titleOriginal?: string
  description?: string
  language: string
  country: string
  buyerName?: string
  cpvCodes: string[]
  estimatedValue?: number
  currency?: string
  deadline?: string
  publicationDate: string
  url?: string
}

export interface Award {
  id: string
  noticeId?: string
  awardedValue?: number
  winnerName?: string
  winnerCountry?: string
  buyerName?: string
  buyerCountry?: string
  cpvCodes: string[]
  publicationDate: string
}

export interface CPVCode {
  code: string
  label: string
  parentCode?: string
  level: number
}

export interface CompanyProfile {
  id: string
  sessionId: string
  name?: string
  description: string
  country?: string
  cpvCodes: string[]
  keywords: string[]
}

// Agent streaming event types (SSE)
export type AgentEventType =
  | 'agent_start'
  | 'agent_thinking'
  | 'agent_tool_call'
  | 'agent_tool_result'
  | 'agent_text'
  | 'agent_done'
  | 'error'

export interface AgentEvent {
  type: AgentEventType
  agent: 'scout' | 'analyst' | 'intel' | 'drafter'
  data: string
  timestamp: string
}
