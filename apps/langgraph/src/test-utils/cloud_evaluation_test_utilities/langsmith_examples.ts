import type { KVMap } from "langsmith/schemas";
import type { LangsmithClient } from "../../integrations/langsmith/types";

export type EvalExample = {
  id?: string;
  inputs: KVMap;
  referenceOutputs: KVMap;
};

export async function loadQAExamplesOrThrow(params: {
  client: LangsmithClient;
  datasetId: string;
  inputKey: string;
  referenceKey: string;
  /**
   * Optional list of LangSmith example IDs to include.
   * If provided, all other examples in the dataset will be skipped.
   */
  exampleIds?: string[];
}): Promise<EvalExample[]> {
  const { client, datasetId, inputKey, referenceKey, exampleIds } = params;
  const examples: EvalExample[] = [];

  const exampleIdSet =
    exampleIds && exampleIds.length > 0
      ? new Set(exampleIds.map((s) => s.trim()).filter(Boolean))
      : undefined;

  for await (const ex of client.listExamples({ datasetId })) {
    if (exampleIdSet && !exampleIdSet.has(ex.id)) {
      continue;
    }

    const question = ex.inputs?.[inputKey];
    const answer = ex.outputs?.[referenceKey];

    if (typeof question !== "string" || typeof answer !== "string") {
      throw new Error(
        `Dataset example ${ex.id} is invalid. Expected inputs["${inputKey}"] and outputs["${referenceKey}"].`,
      );
    }

    examples.push({
      id: ex.id,
      inputs: { [inputKey]: question },
      referenceOutputs: { [referenceKey]: answer },
    });
  }

  if (examples.length === 0) {
    if (exampleIdSet) {
      throw new Error(
        `No examples loaded from dataset ${datasetId}. None of the requested exampleIds were found: ${[
          ...exampleIdSet,
        ].join(", ")}`,
      );
    }
    throw new Error(`No examples loaded from dataset ${datasetId}`);
  }

  return examples;
}
