import * as ls from "langsmith/vitest";
import { expect, test } from "vitest";
import { Client } from "langsmith";
import { randomUUID } from "node:crypto";

import { graph as orchestratorAgent } from "../graph/graph";

import { createExperimentNameUTC } from "../../../test-utils/cloud_evalulation_test_utilities/experiment";
import { getLastMessageText } from "../../../test-utils/cloud_evalulation_test_utilities/messages";
import {
  CORRECTNESS_KEY,
  evaluateCorrectness,
} from "../../../shared_evaluators/correctness-evaluator/evaluator";
import { CloudLangsmithClient } from "../../../integrations/langsmith/cloud_langsmith_client";
import { CloudLangsmithTestDatasetFactory } from "../../../test-utils/cloud_evalulation_test_utilities/test_factories/cloud-langsmith-test-dataset-factory";
import { TestDatasetName } from "../../../test-utils/cloud_evalulation_test_utilities/test_factories/cloud-langsmith-test-dataset-registry";

const CORRECTNESS_THRESHOLD = Number(
  process.env.CORRECTNESS_THRESHOLD ?? "0.75",
);

const EXPERIMENT_NAME = createExperimentNameUTC(
  process.env.APP_ENV ?? "unknown",
);

const internalClient = new Client();
const langsmithClient = new CloudLangsmithClient();
const examplesFactory = new CloudLangsmithTestDatasetFactory(langsmithClient);

const exampleIdsForEvaluation = (() => {
  const single = process.env.CLOUD_EXPERIMENT_EXAMPLE_ID;
  const list = process.env.CLOUD_EXPERIMENT_EXAMPLE_IDS;
  const raw = single ?? list;
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
})();

const datasetName = (() => {
  const envVal = process.env.CLOUD_EXPERIMENT_DATASET_NAME;
  if (!envVal) return TestDatasetName.ELILE_AI_EVALS;
  if (!Object.values(TestDatasetName).includes(envVal as TestDatasetName)) {
    throw new Error(
      `Invalid CLOUD_EXPERIMENT_DATASET_NAME: "${envVal}". Valid values: ${Object.values(TestDatasetName).join(", ")}`,
    );
  }
  return envVal as TestDatasetName;
})();

const datasetForEvaluation = await examplesFactory.loadDatasetWithExamples(
  datasetName,
  exampleIdsForEvaluation,
);

const scores: number[] = [];

ls.describe(
  "Orchestrator Agent Evaluation for Correctness",
  () => {
    ls.test.concurrent.each(datasetForEvaluation.examples)(
      "orchestrator example",
      async ({ inputs, referenceOutputs }) => {
        const question = inputs[
          datasetForEvaluation.datasetConfig.inputKey
        ] as string;
        if (!referenceOutputs) {
          throw new Error("Missing reference outputs for this example");
        }
        const expected = referenceOutputs[
          datasetForEvaluation.datasetConfig.referenceKey
        ] as string;

        const state = await orchestratorAgent.invoke(
          { messages: [{ role: "user", content: question }] },
          { configurable: { thread_id: randomUUID() } },
        );
        const output = getLastMessageText(state);

        if (!output) {
          throw new Error("Agent returned no answer");
        }
        expect(output).toBeTruthy();

        const score = await evaluateCorrectness(
          question,
          expected,
          output,
        );
        scores.push(score);

        ls.logFeedback({
          key: CORRECTNESS_KEY,
          score,
        });

        return { [datasetForEvaluation.datasetConfig.referenceKey]: output };
      },
      30 * 60_000, // 30 minute timeout per example
    );

    test("gate", async () => {
      try {
        if (scores.length === 0) {
          throw new Error("No correctness scores recorded");
        }

        const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

        console.log(
          `[GATE] ${CORRECTNESS_KEY} avg=${(avg * 100).toFixed(
            1,
          )}% threshold=${(CORRECTNESS_THRESHOLD * 100).toFixed(0)}%`,
        );

        expect(avg).toBeGreaterThanOrEqual(CORRECTNESS_THRESHOLD);
      } finally {
        await internalClient.flush();
      }
    });
  },
  {
    enableTestTracking: true,
    projectName: EXPERIMENT_NAME,
    testSuiteName: datasetForEvaluation.datasetConfig.datasetName,
    client: internalClient,
  },
);
