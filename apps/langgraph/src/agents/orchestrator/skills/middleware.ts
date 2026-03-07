import { createLoadSkillTool, createSkillsMiddleware } from "../../../skills/index";
import {
  SKILL_CATALOG,
  SKILL_RULES,
  SKILL_SOURCES,
} from "./config";

const loadSkillTool = createLoadSkillTool({
  catalog: SKILL_CATALOG,
  sources: SKILL_SOURCES,
});

export const skillMiddleware = createSkillsMiddleware({
  catalog: SKILL_CATALOG,
  rulesText: SKILL_RULES,
  loadSkillTool,
});
