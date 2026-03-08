import { z } from "zod";

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string().optional(),
});

export const FindingSchema = z.object({
  claim: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceSchema).min(1),
  notes: z.string().optional(),
});

export const SuggestedQuerySchema = z.object({
  query: z.string().min(1),
  reason: z.string().min(1),
  priority: z.number().int().min(0).max(10).optional(),
});

export const OutOfScopeLeadSchema = z.object({
  label: z.string().min(1),
  why_it_matters: z.string().min(1),
  suggested_next_query: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
});

export const ResearchToolResultSchema = z.object({
  thread_id: z.string().min(1),
  scope: z.string().min(1),
  angle: z.string().min(1),
  summary: z.string().min(1),
  findings: z.array(FindingSchema).min(1),
  out_of_scope_leads: z.array(OutOfScopeLeadSchema).default([]),
  suggested_queries: z.array(SuggestedQuerySchema).default([]),
  visited_urls: z.array(z.string().url()).default([]),
});

export type ResearchToolResult = z.infer<typeof ResearchToolResultSchema>;
