-- These statements run only on first initialization of the postgres_data volume.
-- The main database is created via POSTGRES_DB (docker-compose.yml).
-- This script only ensures the test database exists.

SELECT 'CREATE DATABASE elileai_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'elileai_test')\gexec
