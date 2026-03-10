import type { Skill } from "../../../skills/index";
import type { SkillSources } from "../../../skills/registry";

import retrievalProtocol from "./retrieval-protocol/SKILL";
import topicAnalysis from "./topic-analysis/SKILL";
import outputContract from "../../../skills/shared_skills/output-contract/SKILL";
import identityGraphSchema from "../../../skills/shared_skills/identity-graph-schema/SKILL";
import identityGraphRetrieval from "../../../skills/shared_skills/identity-graph-retrieval/SKILL";

export const SKILL_CATALOG: Skill[] = [
  {
    name: "retrieval-protocol",
    description:
      "How to reason through questions in a structured, grounded way using available knowledge and sources.",
  },
  {
    name: "topic-analysis",
    description:
      "Use when a question requires detailed analysis of a specific topic, including calculations, documentation, or step-by-step evaluation.",
  },
  {
    name: "output-contract",
    description:
      "Strict response formats — answer vs request more info. Never mix modes.",
  },
  {
    name: "identity-graph-schema",
    description:
      "Conventions for identity graph entities and relationships — casing, dedup, naming.",
  },
  {
    name: "identity-graph-retrieval",
    description:
      "Graph-first planning — always query the identity graph before launching web research.",
  },
];

export const SKILL_SOURCES: SkillSources = {
  global: {
    "output-contract": outputContract,
    "identity-graph-schema": identityGraphSchema,
    "identity-graph-retrieval": identityGraphRetrieval,
  },
  local: {
    "retrieval-protocol": retrievalProtocol,
    "topic-analysis": topicAnalysis,
  },
};

export const SKILL_RULES = `\
- Before answering any question (if not already loaded in this thread): load_skill("retrieval-protocol") and load_skill("output-contract")
- Before researching a person: load_skill("identity-graph-retrieval") — always query the graph before web research
- If the question requires detailed topic-specific analysis: load_skill("topic-analysis")`;
