import { z } from "zod";

export const SkillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().min(1),
});

export type Skill = z.infer<typeof SkillSchema>;
