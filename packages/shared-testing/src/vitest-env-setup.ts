import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Load environment variables for Vitest tests.
 *
 * This function loads `.env.test` for both local development and CI runs, without
 * overriding variables that are already set by the environment.
 *
 * Strategy:
 * 1. Load project-level .env.test first (project-specific vars, if exists)
 * 2. Load root-level .env.test second (shared vars, won't override existing)
 *
 * @param projectDir - The __dirname of the calling project (use fileURLToPath for ESM)
 * @param monorepoRoot - Optional override for monorepo root (defaults to 2 levels up)
 */
export function loadTestEnv(
  projectDir: string,
  monorepoRoot?: string
): void {
  const root = monorepoRoot ?? path.resolve(projectDir, "../..");

  // Project-level env (if exists)
  const projectEnvPath = path.join(projectDir, ".env.test");
  if (fs.existsSync(projectEnvPath)) {
    dotenv.config({ path: projectEnvPath, override: true });
  }

  // Root-level env (shared vars, won't override)
  dotenv.config({ path: path.join(root, ".env.test"), override: true });
}
