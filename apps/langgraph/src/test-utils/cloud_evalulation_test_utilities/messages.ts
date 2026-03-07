export function getLastMessageText(state: {
  messages?: Array<{ content?: unknown }>;
}): string | undefined {
  const messages = state.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const text = last?.content?.toString().trim();
  return text && text.length > 0 ? text : undefined;
}
