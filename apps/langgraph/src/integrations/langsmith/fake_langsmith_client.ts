import { type Example } from "langsmith";
import type { LangsmithClient } from "./types";

type SeedExample = {
  datasetId: string;
  id: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown> | null;
};

/**
 * In-memory fake LangSmith client for unit tests.
 */
export class FakeLangsmithClient implements LangsmithClient {
  private readonly examplesByDatasetId = new Map<string, Partial<Example>[]>();

  seedExamples(examples: SeedExample[]) {
    for (const ex of examples) {
      const list = this.examplesByDatasetId.get(ex.datasetId) ?? [];
      list.push({
        id: ex.id,
        inputs: ex.inputs ?? {},
        outputs: ex.outputs ?? undefined,
      });
      this.examplesByDatasetId.set(ex.datasetId, list);
    }
  }

  async *listExamples(
    params: Parameters<LangsmithClient["listExamples"]>[0],
  ): ReturnType<LangsmithClient["listExamples"]> {
    const list: Partial<Example>[] = [];
    if (params?.datasetId) {
      list.push(...(this.examplesByDatasetId.get(params.datasetId) ?? []));
    }

    for (const ex of list) yield ex as Example;
  }
}
