import { z } from "zod";
import { ResearchToolResultSchema } from "../orchestrator/research/contracts";

export const ConfidenceBucketSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceBucket = z.infer<typeof ConfidenceBucketSchema>;

export const ReportSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

export const ReportFactSchema = z.object({
  fact: z.string().min(1),
  final_confidence: z.number().min(0).max(1),
  confidence_bucket: ConfidenceBucketSchema,
  why_confident: z.string().min(1),
  sources: z.array(ReportSourceSchema).min(1),
});

export const VisitedGroupSchema = z.object({
  scope: z.string().min(1),
  angle: z.string().min(1),
  urls: z.array(z.string().url()).min(1),
});

export const ReportGeneratorInputSchema = z.object({
  subject: z.string().min(1),
  research_results: z.array(ResearchToolResultSchema).min(1),
});
export type ReportGeneratorInput = z.infer<typeof ReportGeneratorInputSchema>;

/**
 * Draft is a structured report (no markdown). We render markdown ourselves to:
 * - guarantee hyperlinked citations
 * - avoid invented URLs
 */
export const ReportGeneratorDraftSchema = z.object({
  subject: z.string().min(1),
  executive_summary: z.string().min(1),
  key_facts: z.array(ReportFactSchema).min(1),
  deep_links_and_connections: z.array(ReportFactSchema).default([]),
  visited: z.array(VisitedGroupSchema).min(1),
  open_questions: z.array(z.string().min(1)).default([]),
});
export type ReportGeneratorDraft = z.infer<typeof ReportGeneratorDraftSchema>;

