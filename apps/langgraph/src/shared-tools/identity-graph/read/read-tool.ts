import { tool } from "langchain";
import { z } from "zod";
import type { ChainLike } from "./cypher-chain";

const IdentityGraphReadSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      "Natural-language question about what is already known in the identity graph",
    ),
  subject: z.string().min(1).describe("The person's name being queried"),
  threadId: z.string().min(1).describe("The current thread/conversation ID"),
  cypher: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional: explicit read-only Cypher query. If provided, the tool will run it directly (after safety checks) instead of auto-retrieval.",
    ),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional parameters for the explicit Cypher query."),
});

export type IdentityGraphReadInput = z.infer<typeof IdentityGraphReadSchema>;

type GraphLike = {
  query: (cypher: string, params?: Record<string, unknown>) => Promise<unknown>;
  close?: () => Promise<void> | void;
};

export interface CreateIdentityGraphReadToolOptions {
  /**
   * Preferred: provide a Neo4jGraph-like instance so this tool can run
   * deterministic Cypher (no LLM-generated queries, no schema procedures).
   */
  createGraph?: () => GraphLike | Promise<GraphLike>;
  /**
   * Legacy fallback: LLM-generated Cypher chain. Kept for compatibility.
   */
  createChain?: () => ChainLike | Promise<ChainLike>;
}

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch (error) {
    void error;
    return String(v);
  }
}

function isNonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function normalizeCypher(cypher: string): string {
  return cypher.replace(/\s+/g, " ").trim();
}

function isSafeReadCypher(cypher: string): boolean {
  const c = normalizeCypher(cypher).toLowerCase();
  // Must be a read query. Allow WITH/OPTIONAL MATCH/RETURN/LIMIT/ORDER BY.
  if (!c.startsWith("match ") && !c.startsWith("optional match ")) return false;

  // Disallow mutations and procedure calls / subqueries.
  const forbidden = [
    " create ",
    " merge ",
    " set ",
    " delete ",
    " detach delete ",
    " remove ",
    " call ",
    " apoc.",
    " load csv ",
    " foreach ",
    " unwind ",
    " periodic commit ",
    " subquery ",
    " union ",
  ];
  return !forbidden.some((kw) => c.includes(kw));
}

function errToMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  try {
    return JSON.stringify(err);
  } catch (error) {
    void error;
    return String(err);
  }
}

async function deterministicRead(
  graph: GraphLike,
  input: IdentityGraphReadInput,
) {
  const q = input.subject.trim();
  const qLower = q.toLowerCase();
  const tokens = qLower
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 8);

  const cypherFindPerson = `
MATCH (p:Person)
WHERE (
  $q <> "" AND (
    toLower(coalesce(p.id, "")) CONTAINS $q
    OR toLower(coalesce(p.name, "")) CONTAINS $q
    OR toLower(coalesce(p.full_name, "")) CONTAINS $q
    OR $q CONTAINS toLower(coalesce(p.id, ""))
    OR $q CONTAINS toLower(coalesce(p.name, ""))
    OR $q CONTAINS toLower(coalesce(p.full_name, ""))
  )
)
OR (
  size($tokens) > 0 AND any(t IN $tokens WHERE
    toLower(coalesce(p.id, "")) CONTAINS t
    OR toLower(coalesce(p.name, "")) CONTAINS t
    OR toLower(coalesce(p.full_name, "")) CONTAINS t
  )
)
RETURN id(p) AS nodeId, labels(p) AS labels, properties(p) AS props
LIMIT 5`.trim();

  const cypherFindAny = `
MATCH (n)
WHERE (
  $q <> "" AND (
    toLower(coalesce(n.id, "")) CONTAINS $q
    OR toLower(coalesce(n.name, "")) CONTAINS $q
    OR $q CONTAINS toLower(coalesce(n.id, ""))
    OR $q CONTAINS toLower(coalesce(n.name, ""))
  )
)
OR (
  size($tokens) > 0 AND any(t IN $tokens WHERE
    toLower(coalesce(n.id, "")) CONTAINS t
    OR toLower(coalesce(n.name, "")) CONTAINS t
  )
)
RETURN id(n) AS nodeId, labels(n) AS labels, properties(n) AS props
LIMIT 5`.trim();

  const matchesPerson = (await graph.query(cypherFindPerson, {
    q: qLower,
    tokens,
  })) as
    | unknown
    | null;

  const matches = isNonEmptyArray(matchesPerson)
    ? matchesPerson
    : ((await graph.query(cypherFindAny, { q: qLower, tokens })) as unknown);

  const matchList = isNonEmptyArray(matches) ? matches : [];

  // Choose best match: exact case-insensitive match on common name fields if present,
  // otherwise prefer the candidate that matches the most tokens.
  const pickBest = () => {
    const candidates = matchList as Array<Record<string, unknown>>;
    const exact = candidates.find((m) => {
      const props = (m.props ?? {}) as Record<string, unknown>;
      const id = typeof props.id === "string" ? props.id : "";
      const name = typeof props.name === "string" ? props.name : "";
      const full = typeof props.full_name === "string" ? props.full_name : "";
      return (
        id.toLowerCase() === qLower ||
        name.toLowerCase() === qLower ||
        full.toLowerCase() === qLower
      );
    });
    if (exact) return exact;

    const score = (m: Record<string, unknown>) => {
      const props = (m.props ?? {}) as Record<string, unknown>;
      const id = typeof props.id === "string" ? props.id.toLowerCase() : "";
      const name = typeof props.name === "string" ? props.name.toLowerCase() : "";
      const full = typeof props.full_name === "string" ? props.full_name.toLowerCase() : "";
      const hay = `${id} ${name} ${full}`.trim();
      if (!hay || tokens.length === 0) return 0;
      return tokens.reduce((sum, t) => sum + (hay.includes(t) ? 1 : 0), 0);
    };

    return candidates
      .slice()
      .sort((a, b) => score(b) - score(a))[0];
  };

  const best = pickBest();
  const nodeId = best ? Number((best as Record<string, unknown>).nodeId) : NaN;

  if (!best || !Number.isFinite(nodeId)) {
    return {
      isEmpty: true,
      payload: {
        subject: input.subject,
        matches: [],
        note: "No candidate nodes matched the subject string.",
      },
      cypher: [cypherFindPerson, cypherFindAny],
    };
  }

  const cypherNeighborhood = `
MATCH (p)
WHERE id(p) = $nodeId
OPTIONAL MATCH (p)-[r]-(related)
RETURN labels(p) AS labels,
       properties(p) AS node,
       collect(DISTINCT {
         relationship: type(r),
         direction: CASE WHEN startNode(r) = p THEN "out" ELSE "in" END,
         relProps: properties(r),
         relatedLabels: labels(related),
         relatedNode: properties(related)
       })[0..150] AS connections`.trim();

  const neighborhood = (await graph.query(cypherNeighborhood, { nodeId })) as unknown;

  const payload = {
    subject: input.subject,
    selected: best,
    neighborhood: neighborhood,
    matches: matchList,
    question: input.question,
  };

  const neighborhoodText = toText(neighborhood);
  const isEmpty =
    matchList.length === 0 ||
    !neighborhoodText ||
    neighborhoodText.includes("No data in graph");

  return {
    isEmpty,
    payload,
    cypher: [cypherFindPerson, cypherFindAny, cypherNeighborhood],
  };
}

export function createIdentityGraphReadTool(
  options: CreateIdentityGraphReadToolOptions = {},
) {
  return tool(
    async (input: IdentityGraphReadInput) => {
      if (!options.createGraph && !options.createChain) {
        return [
          "Identity graph read skipped: not configured.",
          {
            tool: "identity_graph_read",
            skipped: true,
            subject: input.subject,
          },
        ] as const;
      }

      // Preferred: deterministic graph query path (more reliable than LLM-generated Cypher).
      if (options.createGraph) {
        let graph: GraphLike;
        try {
          graph = await options.createGraph();
        } catch (err: unknown) {
          const msg = errToMessage(err);
          return [
            `Identity graph read failed during setup: ${msg}`,
            { tool: "identity_graph_read", error: msg, subject: input.subject },
          ] as const;
        }

        try {
          if (input.cypher) {
            if (!isSafeReadCypher(input.cypher)) {
              return [
                "Identity graph query rejected: unsafe Cypher (read-only MATCH queries only). Proceed with web research or use the built-in graph retrieval mode.",
                {
                  tool: "identity_graph_read",
                  subject: input.subject,
                  threadId: input.threadId,
                  cypher: input.cypher,
                  rejected: true,
                },
              ] as const;
            }

            const started = Date.now();
            const raw = await graph.query(input.cypher, input.params ?? {});
            const payload = {
              subject: input.subject,
              question: input.question,
              cypher: input.cypher,
              params: input.params ?? {},
              result: raw,
            };
            const answer = toText(payload);
            const isEmpty =
              raw == null ||
              (Array.isArray(raw) && raw.length === 0) ||
              answer.includes("No data in graph");

            const content = isEmpty
              ? `No existing knowledge found for "${input.subject}" in the identity graph. Proceed with web research.`
              : `Graph knowledge for "${input.subject}" (raw data from Neo4j):\n${answer}`;

            return [
              content,
              {
                tool: "identity_graph_read",
                subject: input.subject,
                threadId: input.threadId,
                cypher: [input.cypher],
                note: "Read-only — enforced by Neo4j DB role (idgraph_readonly)",
                ms: Date.now() - started,
              },
            ] as const;
          }

          const { isEmpty, payload, cypher } = await deterministicRead(graph, input);
          const answer = toText(payload);

          const content = isEmpty
            ? `No existing knowledge found for "${input.subject}" in the identity graph. Proceed with web research.`
            : `Graph knowledge for "${input.subject}" (raw data from Neo4j):\n${answer}`;

          return [
            content,
            {
              tool: "identity_graph_read",
              subject: input.subject,
              threadId: input.threadId,
              cypher,
              note: "Read-only — enforced by Neo4j DB role (idgraph_readonly)",
            },
          ] as const;
        } catch (err: unknown) {
          const msg = errToMessage(err);
          return [
            `Identity graph query failed: ${msg}. Proceed with web research instead.`,
            { tool: "identity_graph_read", error: msg, subject: input.subject },
          ] as const;
        } finally {
          try {
            await graph.close?.();
          } catch (error) {
            void error;
            // Best-effort cleanup — do not fail the tool output.
          }
        }
      }

      // Fallback: legacy chain path.
      if (!options.createChain) {
        return [
          "Identity graph read skipped: chain not configured.",
          {
            tool: "identity_graph_read",
            skipped: true,
            subject: input.subject,
          },
        ] as const;
      }

      let chain: ChainLike;
      try {
        chain = await options.createChain();
      } catch (err: unknown) {
        const msg = errToMessage(err);
        return [
          `Identity graph read failed during setup: ${msg}`,
          { tool: "identity_graph_read", error: msg, subject: input.subject },
        ] as const;
      }

      let result: Record<string, unknown>;
      try {
        const query = `${input.question}\n\nSubject: ${input.subject}`;
        result = await chain.invoke({ query });
      } catch (err: unknown) {
        const msg = errToMessage(err);
        return [
          `Identity graph query failed: ${msg}. The graph may be empty or the generated Cypher was invalid. Proceed with web research instead.`,
          { tool: "identity_graph_read", error: msg, subject: input.subject },
        ] as const;
      } finally {
        try {
          await chain.close?.();
        } catch (error) {
          void error;
          // Best-effort cleanup — do not fail the tool output.
        }
      }

      const rawResult = result.result;
      const answer = typeof rawResult === "string"
        ? rawResult
        : JSON.stringify(rawResult, null, 2);
      const intermediateSteps = result.intermediateSteps as
        | Array<Record<string, unknown>>
        | undefined;

      const cypher =
        intermediateSteps?.[0]?.query ??
        "no cypher returned";

      const isEmpty = !rawResult
        || (Array.isArray(rawResult) && rawResult.length === 0)
        || answer.includes("No data in graph");

      const content = isEmpty
        ? `No existing knowledge found for "${input.subject}" in the identity graph. Proceed with web research.`
        : `Graph knowledge for "${input.subject}" (raw data from Neo4j):\n${answer}`;

      return [
        content,
        {
          tool: "identity_graph_read",
          subject: input.subject,
          threadId: input.threadId,
          cypher,
          note: "Read-only — enforced by Neo4j DB role (idgraph_readonly)",
        },
      ] as const;
    },
    {
      name: "identity_graph_read",
      description:
        "Query the identity graph to find what is already known about a person BEFORE doing new web research. Uses a read-only Neo4j connection. Pass a natural-language question, the subject name, and thread ID.",
      schema: IdentityGraphReadSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
