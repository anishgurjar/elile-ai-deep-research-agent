export type SkillContentMap = Readonly<Record<string, string>>;

export interface SkillSources {
  global: SkillContentMap;
  local?: SkillContentMap;
}

export function resolveSkill(skillName: string, sources: SkillSources): string | null {
  if (sources.local?.[skillName] !== undefined) return sources.local[skillName];
  if (sources.global[skillName] !== undefined) return sources.global[skillName];
  return null;
}

export function listAvailableSkills(sources: SkillSources): string[] {
  const local = sources.local ? Object.keys(sources.local) : [];
  const global = Object.keys(sources.global);
  return [...new Set([...local, ...global])];
}
