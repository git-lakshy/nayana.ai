// Shared API response types for the nayana.ai backend (FastAPI v2).

export type Plan = "guest" | "free" | "pro" | "team" | "enterprise" | "admin";

export interface Identity {
  kind: "guest" | "user" | "api_key";
  user_id: number | null;
  org_id: number | null;
  role: string;
  plan: Plan;
  is_guest: boolean;
  features: string[];
  guest_scans_used: number;
  guest_scan_limit: number;
  guest_scans_remaining: number;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
}

export interface AuthOrg {
  id: number;
  slug: string;
  plan: Plan;
}

export interface AuthResponse {
  user: AuthUser;
  org: AuthOrg;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface GuestStatus {
  is_guest: boolean;
  scans_used: number;
  scan_limit: number;
  scans_remaining: number;
  features: string[];
  plan: Plan;
  cta: string | null;
}

export interface Scan {
  id: number;
  root_url: string;
  root_url_normalized?: string;
  status: "running" | "completed" | "failed" | string;
  pages_found?: number;
  pages_crawled?: number;
  chunks_count?: number;
  error?: string | null;
  created_at?: string;
  finished_at?: string | null;
  config?: {
    max_pages?: number;
    max_depth?: number;
    per_host_delay_ms?: number;
  } | null;
  page_type_breakdown?: { page_type: string; n: number }[];
}

export interface GuestQuota {
  scans_used: number;
  scan_limit: number;
  scans_remaining: number;
}

export interface CrawlResponse {
  status: string;
  scan: Scan;
  guest_quota?: GuestQuota;
}

export interface PageRow {
  id: number;
  scan_id: number;
  url: string;
  title: string | null;
  description?: string | null;
  page_type: string;
  http_status?: number;
  word_count?: number;
  json_ld_count?: number;
  outlinks_count?: number;
  chunk_count?: number;
}

export interface ChunkRow {
  id: number;
  scan_id: number;
  page_id: number;
  heading?: string | null;
  preview?: string | null;
  word_count?: number;
  ordinal?: number;
  content_hash?: string;
}

export interface Gap {
  id?: number;
  kind?: string;
  question?: string;
  description?: string;
  severity?: "high" | "medium" | "low" | string;
  pages_affected?: number;
  page_urls?: string[];
  fix_type?: string;
}

export interface Fix {
  id: number;
  scan_id: number;
  gap_id?: number | null;
  fix_type: string;
  title: string;
  severity?: string;
  target_page?: string | null;
  status: "pending" | "applied" | "dismissed" | string;
  diff?: string | null;
  content?: string | null;
  created_at?: string;
  applied_at?: string | null;
}

export interface ScoreBreakdown {
  overall: number;
  coverage: number;
  accuracy: number;
  attribution: number;
  confidence: number;
}

export interface ProviderSummary {
  total_answers: number;
  errors: number;
  avg_confidence?: number;
  avg_attribution?: number;
  avg_hedge_rate?: number;
  brand_mention_rate?: number;
  domain_citation_rate?: number;
  competitor_mention_rate?: number;
  refusal_rate?: number;
  avg_accuracy?: number;
}

export interface TestSummary {
  scan_id: number;
  question_count: number;
  per_provider: Record<string, ProviderSummary>;
}

export interface Question {
  id: number;
  scan_id: number;
  question: string;
  intent?: string | null;
}

export interface Answer {
  id: number;
  scan_id: number;
  question_id: number;
  provider: string;
  answer_text: string | null;
  error?: string | null;
  confidence?: number | null;
  attribution?: number | null;
  hedge_rate?: number | null;
  accuracy?: number | null;
  has_brand_mention?: number;
  has_domain_citation?: number;
  has_competitor_mention?: number;
  is_refusal?: number;
  question?: string;
}

export interface TestRunResult {
  status: string;
  scan_id: number;
  providers: string[];
  questions_generated: number;
  answers_generated: number;
  errors: string[];
}

export interface DomainRow {
  domain: string;
  latest_score?: number | null;
  scan_count?: number;
  last_scanned?: string;
  trend?: number[];
}

export interface HistoryPoint {
  scan_id: number;
  date: string;
  score: number;
  fixes_applied?: number;
}

export interface DomainHistory {
  domain: string;
  points: HistoryPoint[];
  per_provider?: Record<string, number>;
}

export interface SovResult {
  scan_id: number;
  competitor_scan_id: number;
  own_domain: string;
  competitor_domain: string;
  own_share: number;
  competitor_share: number;
  battleground?: {
    question: string;
    per_provider: Record<string, { own: boolean; competitor: boolean }>;
  }[];
  radar?: Record<string, { own: number; competitor: number }>;
  fixes_available?: number;
}

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  created_at?: string;
  last_used_at?: string | null;
  expires_at?: string | null;
}

export interface ProviderAuthStatus {
  provider: string;
  authenticated: boolean;
  session_valid?: boolean;
  detail?: string | null;
}

export interface ApiErrorShape {
  code?: string;
  message?: string;
  feature?: string;
  cta?: string;
  scans_used?: number;
  limit?: number;
}
