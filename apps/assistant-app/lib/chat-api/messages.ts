import {
  LangChainMessage,
  LangGraphCommand,
} from "@assistant-ui/react-langgraph";
import { assertOk } from "./utils";

const STREAM_MODES = ["messages", "updates", "events", "values"] as const;

type StreamEvent = {
  event: string;
  data: unknown;
};

function parseSseChunk(rawChunk: string): StreamEvent | null {
  const lines = rawChunk.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const dataText = dataLines.join("\n");
  if (dataText === "[DONE]") {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataText),
    };
  } catch {
    return {
      event,
      data: dataText,
    };
  }
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = parseSseChunk(buffer.trim());
    if (event) {
      yield event;
    }
  }
}

type MessageParams = {
  threadId: string;
  messages?: LangChainMessage[];
  command?: LangGraphCommand | undefined;
};

export class ChatMessagesClient {
  private get assistantId(): string {
    const id = process.env["NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID"];
    if (!id) {
      throw new Error("NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID is not configured");
    }
    return id;
  }

  async sendMessage(params: MessageParams): Promise<AsyncGenerator<unknown>> {
    const res = await fetch(`/api/threads/${params.threadId}/runs/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: this.assistantId,
        input: params.messages?.length ? { messages: params.messages } : null,
        command: params.command,
        stream_mode: STREAM_MODES,
        config: {},
      }),
    });

    await assertOk(res, "sendMessage");

    if (!res.body) {
      throw new Error("sendMessage failed: missing response stream");
    }

    return parseSseStream(res.body);
  }

  async sendMessageAndWait(params: MessageParams) {
    const res = await fetch(`/api/threads/${params.threadId}/runs/wait`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: this.assistantId,
        input: params.messages?.length ? { messages: params.messages } : null,
        command: params.command,
        stream_mode: ["messages", "updates", "events"],
        config: {},
      }),
    });

    await assertOk(res, "sendMessageAndWait");
    return res.json();
  }
}

const defaultClient = new ChatMessagesClient();

export const sendMessage = defaultClient.sendMessage.bind(defaultClient);
export const sendMessageAndWait = defaultClient.sendMessageAndWait.bind(defaultClient);
