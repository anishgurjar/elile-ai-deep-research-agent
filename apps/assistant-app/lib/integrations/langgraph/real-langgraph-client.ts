import { Client } from "@langchain/langgraph-sdk";
import type { LangGraphClient, RunRequestBody, StreamEvent } from "./types";

export class RealLangGraphClient implements LangGraphClient {
  private readonly client: Client;

  private static resolveBaseUrl(): string {
    const baseUrl =
      process.env["LANGGRAPH_API_URL"] ?? process.env["NEXT_PUBLIC_LANGGRAPH_API_URL"];
    if (!baseUrl) {
      throw new Error("LANGGRAPH_API_URL is not configured");
    }
    return baseUrl;
  }

  constructor(params: { userToken: string }) {
    const baseUrl = RealLangGraphClient.resolveBaseUrl();
    const apiKey = process.env["LANGCHAIN_API_KEY"];
    const headers: Record<string, string> = {
      Authorization: `Bearer ${params.userToken}`,
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    this.client = new Client({
      apiUrl: baseUrl,
      defaultHeaders: headers,
    });
  }

  createThread(body: Parameters<Client["threads"]["create"]>[0]) {
    return this.client.threads.create(body);
  }

  searchThreads(body: Parameters<Client["threads"]["search"]>[0]) {
    return this.client.threads.search(body);
  }

  getThread(threadId: string) {
    return this.client.threads.get(threadId);
  }

  updateThread(threadId: string, body: Parameters<Client["threads"]["update"]>[1]) {
    return this.client.threads.update(threadId, body);
  }

  getThreadState(threadId: string) {
    return this.client.threads.getState(threadId);
  }

  async streamRun(
    threadId: string,
    body: RunRequestBody,
  ): Promise<AsyncGenerator<StreamEvent>> {
    return this.client.runs.stream(threadId, body.assistant_id, {
      input: body.input,
      command: body.command,
      streamMode: body.stream_mode,
      config: body.config,
    }) as AsyncGenerator<StreamEvent>;
  }

  waitRun(threadId: string, body: RunRequestBody) {
    return this.client.runs.wait(threadId, body.assistant_id, {
      input: body.input,
      command: body.command,
      config: body.config,
    });
  }

  cancelRun(threadId: string, runId: string): Promise<void> {
    return this.client.runs.cancel(threadId, runId);
  }
}
