-- Convert legacy INTEGER (epoch-millisecond) DateTime values to the ISO-8601 TEXT
-- representation that Prisma 7 uses.
--
-- Prisma 4 stored DateTime columns as INTEGER epoch milliseconds via its Rust
-- query engine. Prisma 7 reaches SQLite through the better-sqlite3 driver adapter,
-- which stores and *binds* DateTime as ISO-8601 TEXT ("2026-10-11T08:25:13.298+00:00").
--
-- SQLite compares values across storage classes by class order: INTEGER always
-- sorts before TEXT. So after the upgrade every legacy row satisfied
-- `expire_time <= <now as text>`, and the periodic cleanup task purged the entire
-- table on its first tick. Any date filter would be wrong in the same way.
--
-- typeof() guards make this idempotent and safe to run on an already-converted
-- database: rows already stored as TEXT are left alone.

UPDATE "EncryptedNote"
SET "expire_time" = strftime('%Y-%m-%dT%H:%M:%f', "expire_time" / 1000.0, 'unixepoch') || '+00:00'
WHERE typeof("expire_time") = 'integer';

UPDATE "EncryptedNote"
SET "insert_time" = strftime('%Y-%m-%dT%H:%M:%f', "insert_time" / 1000.0, 'unixepoch') || '+00:00'
WHERE typeof("insert_time") = 'integer';

UPDATE "event"
SET "time" = strftime('%Y-%m-%dT%H:%M:%f', "time" / 1000.0, 'unixepoch') || '+00:00'
WHERE typeof("time") = 'integer';
