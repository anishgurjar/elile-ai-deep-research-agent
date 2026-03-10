import { z } from "zod";

export const PlannerGoalSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
});

export const PlannerSeedScopeSchema = z.object({
  scope: z.string().min(1),
  angle: z.string().min(1),
});

export const PlannerCandidateSchema = z.object({
  label: z.string().min(1),
  why: z.string().min(1),
  sources: z
    .array(z.object({ url: z.string().min(1), title: z.string().optional() }))
    .min(1),
});

export const PlannerToolResultSchema = z.object({
  subject: z.string().min(1),
  status: z.enum([
    "needs_disambiguation",
    "has_existing_graph",
    "needs_followups",
    "ready",
  ]),
  goals: z.array(PlannerGoalSchema),
  seed_scopes: z.array(PlannerSeedScopeSchema),
  questions: z.array(z.string()),
  candidates: z.array(PlannerCandidateSchema).optional().default([]),
});

export type PlannerToolResult = z.infer<typeof PlannerToolResultSchema>;
