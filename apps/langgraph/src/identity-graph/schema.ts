import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import type { GraphDocument } from "@langchain/community/graphs/document";
import { createLogger } from "@elileai/logger";

export interface ExistingSchema {
  nodeLabels: string[];
  relationshipTypes: string[];
}

const INTERNAL_LABELS = ["__Entity__", "Document", "Bloom_Perspective", "Bloom_Scene"];
const logger = createLogger("langgraph").child("identity-graph").child("schema");

/**
 * Queries Neo4j for existing node labels and relationship types.
 * Falls back to empty arrays if the graph is empty or the query fails.
 */
export async function fetchExistingSchema(
  graph: Pick<Neo4jGraph, "query">,
): Promise<ExistingSchema> {
  try {
    const labelResult = await graph.query<{ label: string }>(
      "CALL db.labels() YIELD label RETURN label",
    );
    const relResult = await graph.query<{ type: string }>(
      "CALL db.relationshipTypes() YIELD relationshipType AS type RETURN type",
    );

    return {
      nodeLabels: (labelResult ?? [])
        .map((r) => r.label)
        .filter((l) => !INTERNAL_LABELS.includes(l)),
      relationshipTypes: (relResult ?? []).map((r) => r.type),
    };
  } catch (error) {
    logger.warn("Failed to fetch existing schema; falling back to empty", {
      error:
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message)
          : String(error),
    });
    return { nodeLabels: [], relationshipTypes: [] };
  }
}

/**
 * Builds a ChatPromptTemplate for LLMGraphTransformer that includes
 * existing schema types so the LLM prefers reusing them.
 */
export function buildSchemaAwarePrompt(schema: ExistingSchema): ChatPromptTemplate {
  const existingSection =
    schema.nodeLabels.length > 0 || schema.relationshipTypes.length > 0
      ? `
## 5. Existing Graph Schema
The knowledge graph already contains these types. REUSE them whenever they fit — do NOT create variants or synonyms.

${schema.nodeLabels.length > 0 ? `**Existing node labels:** ${schema.nodeLabels.join(", ")}` : "**No existing node labels yet.**"}
${schema.relationshipTypes.length > 0 ? `**Existing relationship types:** ${schema.relationshipTypes.join(", ")}` : "**No existing relationship types yet.**"}

If a new type is genuinely needed and nothing above fits, you may create one, but follow the casing conventions strictly.
`
      : `
## 5. Existing Graph Schema
The graph is empty. You are establishing the initial schema — choose types carefully.
`;

  const systemPrompt = `
# Knowledge Graph Extraction

## 1. Overview
You are extracting structured information from text to build an identity-focused knowledge graph about people.
Capture as much relevant information as possible without sacrificing accuracy. Do not add anything not explicitly stated in the text.

- **Nodes** represent entities (people, organizations, roles, locations, etc.)
- **Relationships** represent connections between entities.

## 2. Node Labeling Conventions
- **PascalCase only**: Person, Organization, Role, Location, Event, Award (NOT "person", "PERSON", "Social_Media")
- **Use elementary types**: Always prefer "Person" over "Mathematician" or "Scientist". Prefer "Organization" over "University" or "Company".
- **Node IDs**: Use the most complete human-readable name found in the text (e.g. "Ada Lovelace" not "Ada" or "Lovelace"). Never use integers.

## 3. Relationship Conventions
- **UPPER_SNAKE_CASE only**: ASSOCIATED_WITH, HAS_ROLE, LOCATED_IN (NOT "associated_with", "Associated With", "hasRole")
- **Use general, timeless types**: Prefer "HAS_ROLE" over "BECAME_PROFESSOR". Prefer "ASSOCIATED_WITH" over "WORKED_AT_IN_2019".

## 4. Coreference Resolution
If an entity is mentioned multiple times by different names or pronouns (e.g. "John Doe", "Joe", "he"), always use the most complete identifier as the node ID throughout.
${existingSection}
## 6. Strict Compliance
- Reuse existing types before creating new ones.
- Follow casing conventions exactly (PascalCase nodes, UPPER_SNAKE_CASE relationships).
- Only extract what is explicitly stated in the text.
`;

  return ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    [
      "human",
      "Extract entities and relationships from the following text. Use the correct format. Do not include explanations.\n\nInput: {input}",
    ],
  ]);
}

function toPascalCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toUpperSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

/**
 * Finds a case-insensitive match in existing types, or normalizes to the
 * target casing convention if no match is found.
 */
function matchOrNormalize(
  value: string,
  existing: string[],
  normalizeFn: (s: string) => string,
): string {
  const match = existing.find((e) => e.toLowerCase() === value.toLowerCase());
  if (match) return match;
  return normalizeFn(value);
}

/**
 * Post-processes extracted graph documents to normalize casing and
 * align with existing schema types.
 */
export function normalizeGraphDocuments(
  graphDocuments: GraphDocument[],
  schema: ExistingSchema,
): GraphDocument[] {
  for (const doc of graphDocuments) {
    for (const node of doc.nodes) {
      node.type = matchOrNormalize(node.type, schema.nodeLabels, toPascalCase);
      if (typeof node.id === "string") {
        node.id = node.id.trim();
      }
    }
    for (const rel of doc.relationships) {
      rel.type = matchOrNormalize(rel.type, schema.relationshipTypes, toUpperSnakeCase);
      rel.source.type = matchOrNormalize(rel.source.type, schema.nodeLabels, toPascalCase);
      rel.target.type = matchOrNormalize(rel.target.type, schema.nodeLabels, toPascalCase);
      if (typeof rel.source.id === "string") rel.source.id = rel.source.id.trim();
      if (typeof rel.target.id === "string") rel.target.id = rel.target.id.trim();
    }
  }
  return graphDocuments;
}
