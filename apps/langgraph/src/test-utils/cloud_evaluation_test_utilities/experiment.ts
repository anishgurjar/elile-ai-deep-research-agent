import { randomUUID } from "node:crypto";

export function createExperimentNameUTC(prefix: string) {
  // Example: "dev_2025-12-30T05-12-09-123Z_1a2b3c4d"
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = randomUUID().slice(0, 8);
  return `${prefix}_${ts}_${nonce}`;
}
