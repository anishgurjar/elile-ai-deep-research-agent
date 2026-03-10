import { describe, expect, test } from "vitest";
import neo4j from "neo4j-driver";

describe("neo4j readonly user", () => {
  test("can read but cannot write", async () => {
    const uri = process.env.ELILEAI_NEO4J_READ_URI ?? "bolt://localhost:7687";
    const user =
      process.env.ELILEAI_NEO4J_READ_USERNAME ?? "neo4j_read";
    const pass =
      process.env.ELILEAI_NEO4J_READ_PASSWORD ?? "neo4j_read_dev";

    const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
    const session = driver.session();
    try {
      // Ensure we're connected; otherwise a network failure could masquerade as "readonly works".
      await driver.getServerInfo();

      await expect(
        session.run("CREATE (n:ShouldNotWrite {id: 'x'}) RETURN n"),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/permission|write|authorized|denied/i),
      });
    } finally {
      await session.close();
      await driver.close();
    }
  });
});
