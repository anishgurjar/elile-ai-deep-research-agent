export async function assertOk(response: Response, context: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  console.error(`[chat-api] ${context} failed`, {
    status: response.status,
    body: body.slice(0, 500),
  });
  throw new Error(`${context} failed (${response.status})`);
}
