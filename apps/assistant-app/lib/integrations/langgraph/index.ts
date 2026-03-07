import type { LangGraphClient } from "./types";
import { RealLangGraphClient } from "./real-langgraph-client";

export type {
  CreateThreadRequest,
  LangGraphClient,
  RunRequestBody,
  SearchThreadsRequest,
  StreamEvent,
  UpdateThreadRequest,
} from "./types";
export { RealLangGraphClient } from "./real-langgraph-client";

export function createLangGraphClient(userToken: string): LangGraphClient {
  return new RealLangGraphClient({ userToken });
}
