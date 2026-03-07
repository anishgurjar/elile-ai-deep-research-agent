export enum TestDatasetName {
  ELILE_AI_EVALS = "Elie AI Evals",
}

export interface DatasetConfig {
  datasetId: string;
  datasetName: TestDatasetName;
  inputKey: string;
  referenceKey: string;
}

export const DATASET_REGISTRY: Record<TestDatasetName, DatasetConfig> = {
  [TestDatasetName.ELILE_AI_EVALS]: {
    datasetId: "567b23c0-14eb-49c1-864f-45ea2f8dfd37",
    datasetName: TestDatasetName.ELILE_AI_EVALS,
    inputKey: "Question",
    referenceKey: "Answer",
  },
};
