import { Client } from "langsmith";

/**
 * Minimal LangSmith client surface area used by our eval utilities.
 * Keep this small so we can easily provide a fake client in unit tests.
 */
export interface LangsmithClient {
  listExamples(
    params: Parameters<Client["listExamples"]>[0],
  ): ReturnType<Client["listExamples"]>;
}
