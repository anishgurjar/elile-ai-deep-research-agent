function extractTextFromContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    const t = content.trim();
    return t.length > 0 ? t : undefined;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => extractTextFromContent(part))
      .filter((p): p is string => Boolean(p));
    const joined = parts.join("").trim();
    return joined.length > 0 ? joined : undefined;
  }

  if (content && typeof content === "object") {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === "string") {
      const t = maybeText.trim();
      return t.length > 0 ? t : undefined;
    }

    const maybeContent = (content as { content?: unknown }).content;
    if (maybeContent !== undefined) {
      return extractTextFromContent(maybeContent);
    }
  }

  return undefined;
}

export function getLastMessageText(state: {
  messages?: Array<{ content?: unknown }>;
}): string | undefined {
  const messages = state.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];

    const extracted = extractTextFromContent(msg?.content);
    if (extracted) return extracted;

    // Fallback: keep prior behavior for any custom message types with a useful toString().
    const text = msg?.content?.toString?.().trim?.();
    if (typeof text === "string" && text.length > 0) return text;
  }

  return undefined;
}
