import type { LangsmithClient } from "../../../integrations/langsmith/types";
import { loadQAExamplesOrThrow } from "../langsmith_examples";
import {
  DATASET_REGISTRY,
  DatasetConfig,
  TestDatasetName,
} from "./cloud-langsmith-test-dataset-registry";

interface LangsmithDatasetForEvaluation {
  examples: Awaited<ReturnType<typeof loadQAExamplesOrThrow>>;
  datasetConfig: DatasetConfig;
}

export class CloudLangsmithTestDatasetFactory {
  constructor(private readonly client: LangsmithClient) {}

  async loadDatasetWithExamples(
    datasetName: TestDatasetName,
    exampleIds?: string[],
  ): Promise<LangsmithDatasetForEvaluation> {
    const examplesForEvaluation = await loadQAExamplesOrThrow({
      client: this.client,
      datasetId: DATASET_REGISTRY[datasetName].datasetId,
      inputKey: DATASET_REGISTRY[datasetName].inputKey,
      referenceKey: DATASET_REGISTRY[datasetName].referenceKey,
      exampleIds,
    });

    return {
      datasetConfig: DATASET_REGISTRY[datasetName],
      examples: examplesForEvaluation,
    };
  }
}
