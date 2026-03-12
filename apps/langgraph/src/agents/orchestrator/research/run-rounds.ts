import { ResearchToolResultSchema, type ResearchToolResult } from "./contracts";

interface ScopeConfig {
  scope: string;
  angle: string;
}

interface RunRoundsInput {
  subject: string;
  seed_scopes: ScopeConfig[];
  max_rounds: number;
  callResearchAgent: (instructions: string) => Promise<string>;
}

interface RunRoundsOutput {
  rounds_taken: number;
  by_scope: ResearchToolResult[];
  merged_findings: ResearchToolResult["findings"];
  out_of_scope_leads: ResearchToolResult["out_of_scope_leads"];
  suggested_queries: ResearchToolResult["suggested_queries"];
}

function buildInstruction(
  subject: string,
  scope: ScopeConfig,
  round: number,
  previousClaims: string[],
  previousDomains: string[],
  extraQueries?: string[],
): string {
  const obj: Record<string, string> = {
    thread_id: `round${round}:${scope.scope}`,
    scope: scope.scope,
    angle: scope.angle,
    subject: subject,
  };
  if (extraQueries?.length) {
    obj.starting_queries = extraQueries.join("; ");
  }
  if (previousClaims.length > 0 || previousDomains.length > 0) {
    obj.avoid_claims = previousClaims.join("; ");
    obj.avoid_domains = previousDomains.join(", ");
  }
  return JSON.stringify(obj);
}

function normalizeClaim(claim: string): string {
  return claim.trim().toLowerCase().replace(/\s+/g, " ");
}


function dedupeFindings(
  findings: ResearchToolResult["findings"],
): ResearchToolResult["findings"] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = normalizeClaim(f.claim);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runResearchRounds(
  input: RunRoundsInput,
): Promise<RunRoundsOutput> {
  const { subject, seed_scopes, max_rounds, callResearchAgent } = input;

  const allResults: ResearchToolResult[] = [];
  const allClaims: string[] = [];
  const allDomains: string[] = [];
  let roundsTaken = 0;

  for (let round = 1; round <= max_rounds; round++) {
    const scopesToRun =
      round === 1
        ? seed_scopes
        : seed_scopes.filter((s) => {
            const scopeQueries = allResults
              .filter((r) => r.scope === s.scope)
              .flatMap((r) => r.suggested_queries)
              .filter((q) => (q.priority ?? 5) >= 5);
            return scopeQueries.length > 0;
          });

    if (scopesToRun.length === 0) break;

    const extraQueriesByScope = new Map<string, string[]>();
    if (round > 1) {
      for (const s of scopesToRun) {
        const queries = allResults
          .filter((r) => r.scope === s.scope)
          .flatMap((r) => r.suggested_queries)
          .sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5))
          .slice(0, 2)
          .map((q) => q.query);
        extraQueriesByScope.set(s.scope, queries);
      }
    }

    const promises = scopesToRun.map(async (scope) => {
      const instruction = buildInstruction(
        subject,
        scope,
        round,
        allClaims,
        allDomains,
        extraQueriesByScope.get(scope.scope),
      );

      const raw = await callResearchAgent(instruction);
      return ResearchToolResultSchema.parse(JSON.parse(raw));
    });

    const roundResults = await Promise.all(promises);
    roundsTaken = round;

    for (const result of roundResults) {
      allResults.push(result);
      for (const f of result.findings) {
        allClaims.push(normalizeClaim(f.claim));
      }
      for (const url of result.visited_urls) {
        try {
          allDomains.push(new URL(url).hostname);
        } catch (error) {
          void error;
          // skip invalid URLs
        }
      }
    }

    const hasWorthwhileFollowups = roundResults.some(
      (r) =>
        r.suggested_queries.filter((q) => (q.priority ?? 5) >= 5).length > 0,
    );

    if (!hasWorthwhileFollowups) break;
  }

  const mergedFindings = dedupeFindings(allResults.flatMap((r) => r.findings));
  const outOfScopeLeads = allResults.flatMap((r) => r.out_of_scope_leads);
  const suggestedQueries = allResults.flatMap((r) => r.suggested_queries);

  return {
    rounds_taken: roundsTaken,
    by_scope: allResults,
    merged_findings: mergedFindings,
    out_of_scope_leads: outOfScopeLeads,
    suggested_queries: suggestedQueries,
  };
}
