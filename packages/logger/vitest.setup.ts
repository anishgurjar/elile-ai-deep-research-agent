import path from "path";
import { fileURLToPath } from "url";
import { loadTestEnv } from "@elileai/shared-testing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadTestEnv(__dirname);
