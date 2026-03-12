import { log } from "../log";

export class HttpError extends Error {
  readonly status: number;
  readonly context: string;
  readonly url?: string;

  constructor(opts: { context: string; status: number; url?: string }) {
    super(`${opts.context} failed (${opts.status})`);
    this.name = "HttpError";
    this.status = opts.status;
    this.context = opts.context;
    this.url = opts.url;
  }
}

export async function assertOk(
  response: Response,
  context: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-amzn-requestid") ??
    response.headers.get("x-correlation-id") ??
    undefined;

  log.error(`[chat-api] ${context} failed`, {
    status: response.status,
    url: response.url || undefined,
    requestId,
  });
  throw new HttpError({
    context,
    status: response.status,
    url: response.url || undefined,
  });
}
