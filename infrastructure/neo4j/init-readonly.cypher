CREATE ROLE idgraph_readonly IF NOT EXISTS;
GRANT ACCESS ON DATABASE neo4j TO idgraph_readonly;
GRANT MATCH {*} ON GRAPH neo4j NODES * TO idgraph_readonly;
GRANT MATCH {*} ON GRAPH neo4j RELATIONSHIPS * TO idgraph_readonly;
GRANT SHOW CONSTRAINT ON DATABASE neo4j TO idgraph_readonly;
GRANT SHOW INDEX ON DATABASE neo4j TO idgraph_readonly;
GRANT EXECUTE PROCEDURE apoc.meta.* ON DBMS TO idgraph_readonly;

CREATE USER neo4j_read IF NOT EXISTS SET PASSWORD 'neo4j_read_dev' CHANGE NOT REQUIRED;
GRANT ROLE idgraph_readonly TO neo4j_read;
