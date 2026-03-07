import { Client } from "langsmith";
import { LangsmithClient } from "./types";

export class CloudLangsmithClient implements LangsmithClient {
  private readonly client: Client;

  constructor(client: Client = new Client()) {
    this.client = client;
  }

  listExamples(params: Parameters<Client["listExamples"]>[0]) {
    return this.client.listExamples(params);
  }
}
