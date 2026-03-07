import { describe, expect, test } from "vitest";

import { FakeLangsmithClient } from "../../integrations/langsmith/fake_langsmith_client";
import { loadQAExamplesOrThrow } from "./langsmith_examples";

describe("loadQAExamplesOrThrow", () => {
  const DATASET_ID = "ds-1";
  const INPUT_KEY = "Question";
  const REF_KEY = "Answer";

  test("loads and normalizes examples from a dataset", async () => {
    const client = new FakeLangsmithClient();
    client.seedExamples([
      {
        datasetId: DATASET_ID,
        id: "ex-1",
        inputs: { [INPUT_KEY]: "Q1", other: "ignored" },
        outputs: { [REF_KEY]: "A1", other: "ignored" },
      },
      {
        datasetId: DATASET_ID,
        id: "ex-2",
        inputs: { [INPUT_KEY]: "Q2" },
        outputs: { [REF_KEY]: "A2" },
      },
    ]);

    const examples = await loadQAExamplesOrThrow({
      client,
      datasetId: DATASET_ID,
      inputKey: INPUT_KEY,
      referenceKey: REF_KEY,
    });

    expect(examples).toEqual([
      {
        id: "ex-1",
        inputs: { [INPUT_KEY]: "Q1" },
        referenceOutputs: { [REF_KEY]: "A1" },
      },
      {
        id: "ex-2",
        inputs: { [INPUT_KEY]: "Q2" },
        referenceOutputs: { [REF_KEY]: "A2" },
      },
    ]);
  });

  test("throws if the dataset has no examples", async () => {
    const client = new FakeLangsmithClient();
    await expect(
      loadQAExamplesOrThrow({
        client,
        datasetId: DATASET_ID,
        inputKey: INPUT_KEY,
        referenceKey: REF_KEY,
      }),
    ).rejects.toThrow(`No examples loaded from dataset ${DATASET_ID}`);
  });

  test("throws if an example is missing expected string input/output values", async () => {
    const client = new FakeLangsmithClient();
    client.seedExamples([
      {
        datasetId: DATASET_ID,
        id: "ex-bad",
        inputs: { [INPUT_KEY]: 123 },
        outputs: { [REF_KEY]: "A" },
      },
    ]);

    await expect(
      loadQAExamplesOrThrow({
        client,
        datasetId: DATASET_ID,
        inputKey: INPUT_KEY,
        referenceKey: REF_KEY,
      }),
    ).rejects.toThrow(
      `Dataset example ex-bad is invalid. Expected inputs["${INPUT_KEY}"] and outputs["${REF_KEY}"].`,
    );
  });

  test("filters to a specific set of exampleIds", async () => {
    const client = new FakeLangsmithClient();
    client.seedExamples([
      {
        datasetId: DATASET_ID,
        id: "ex-1",
        inputs: { [INPUT_KEY]: "Q1" },
        outputs: { [REF_KEY]: "A1" },
      },
      {
        datasetId: DATASET_ID,
        id: "ex-2",
        inputs: { [INPUT_KEY]: "Q2" },
        outputs: { [REF_KEY]: "A2" },
      },
    ]);

    const examples = await loadQAExamplesOrThrow({
      client,
      datasetId: DATASET_ID,
      inputKey: INPUT_KEY,
      referenceKey: REF_KEY,
      exampleIds: ["ex-2"],
    });

    expect(examples).toEqual([
      {
        id: "ex-2",
        inputs: { [INPUT_KEY]: "Q2" },
        referenceOutputs: { [REF_KEY]: "A2" },
      },
    ]);
  });

  test("throws if exampleIds are provided but none exist in the dataset", async () => {
    const client = new FakeLangsmithClient();
    client.seedExamples([
      {
        datasetId: DATASET_ID,
        id: "ex-1",
        inputs: { [INPUT_KEY]: "Q1" },
        outputs: { [REF_KEY]: "A1" },
      },
    ]);

    await expect(
      loadQAExamplesOrThrow({
        client,
        datasetId: DATASET_ID,
        inputKey: INPUT_KEY,
        referenceKey: REF_KEY,
        exampleIds: ["does-not-exist"],
      }),
    ).rejects.toThrow(
      /None of the requested exampleIds were found: does-not-exist/,
    );
  });
});
