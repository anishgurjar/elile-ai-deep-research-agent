import { expect } from "vitest";

interface ProxyMatcherOptions {
  method?: string;
}

expect.extend({
  toProxyToLangGraphWithAuthorization(
    received: unknown[],
    expectedPath: string,
    options?: ProxyMatcherOptions,
  ) {
    const [url, init] = (received ?? []) as [
      unknown,
      Record<string, unknown> | undefined,
    ];
    const urlStr = String(url);
    const baseUrl =
      process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? "https://api.langgraph.com";
    const expectedUrl = `${baseUrl}${expectedPath}`;

    if (urlStr !== expectedUrl) {
      return {
        pass: false,
        message: () =>
          `Expected fetch URL to be ${expectedUrl}, received ${urlStr}`,
      };
    }

    const headers = init?.headers as Record<string, string> | undefined;
    const auth = headers?.Authorization ?? headers?.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return {
        pass: false,
        message: () =>
          `Expected Authorization header with Bearer token, got ${String(auth)}`,
      };
    }

    if (options?.method) {
      const method = init?.method as string | undefined;
      if (method !== options.method) {
        return {
          pass: false,
          message: () =>
            `Expected HTTP method ${options.method}, got ${String(method)}`,
        };
      }
    }

    return {
      pass: true,
      message: () =>
        `Expected call not to proxy to ${expectedUrl} with authorization`,
    };
  },
});

declare module "vitest" {
  interface Assertion<T> {
    toProxyToLangGraphWithAuthorization(
      path: string,
      options?: ProxyMatcherOptions,
    ): T;
  }
  interface AsymmetricMatchersContaining {
    toProxyToLangGraphWithAuthorization(
      path: string,
      options?: ProxyMatcherOptions,
    ): void;
  }
}
