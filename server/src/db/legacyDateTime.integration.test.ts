import { describe, it, expect, beforeAll } from "vitest";
import prisma from "./client";
import { deleteExpiredNotes } from "../tasks/deleteExpiredNotes";

/**
 * Regression test for the Prisma 4 -> 7 DateTime storage change.
 *
 * Prisma 4's Rust engine stored DateTime columns as INTEGER epoch milliseconds.
 * Prisma 7 reaches SQLite through the better-sqlite3 driver adapter, which stores
 * *and binds* DateTime as ISO-8601 TEXT. SQLite orders values by storage class
 * before value, and INTEGER always sorts before TEXT -- so after the upgrade every
 * legacy row satisfied `expire_time <= <now as text>` and the periodic cleanup
 * purged the entire table on its first tick.
 *
 * migrations/20260911120000_datetime_integer_to_text converts the legacy rows.
 * This test reproduces the hazard directly: a row written with the old INTEGER
 * representation and an expiry far in the future must survive cleanup.
 */
describe("legacy INTEGER DateTime rows", () => {
  const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const legacyId = "legacy-integer-datetime-note";

  beforeAll(async () => {
    await prisma.encryptedNote.deleteMany({ where: { id: legacyId } });
  });

  it("are not purged by the cleanup task once migrated", async () => {
    // Write the row the way Prisma 4 did: raw INTEGER epoch milliseconds.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EncryptedNote"
         (id, insert_time, expire_time, ciphertext, hmac, iv, crypto_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      legacyId,
      Date.now(),
      FUTURE.getTime(),
      "bGVnYWN5",
      "bGVnYWN5",
      null,
      "v2"
    );

    const storedAs = await prisma.$queryRawUnsafe<{ t: string }[]>(
      `SELECT typeof(expire_time) AS t FROM "EncryptedNote" WHERE id = ?`,
      legacyId
    );
    expect(storedAs[0].t).toBe("integer");

    // Apply the same conversion the migration does.
    await prisma.$executeRawUnsafe(
      `UPDATE "EncryptedNote"
          SET expire_time = strftime('%Y-%m-%dT%H:%M:%f', expire_time / 1000.0, 'unixepoch') || '+00:00',
              insert_time = strftime('%Y-%m-%dT%H:%M:%f', insert_time / 1000.0, 'unixepoch') || '+00:00'
        WHERE typeof(expire_time) = 'integer' AND id = ?`,
      legacyId
    );

    await deleteExpiredNotes();

    const note = await prisma.encryptedNote.findUnique({ where: { id: legacyId } });
    expect(note).not.toBeNull();
    // And the timestamp survived the conversion intact (to the millisecond).
    expect(note?.expire_time.getTime()).toBe(FUTURE.getTime());
  });

  it("would be purged WITHOUT the conversion -- documents the hazard", async () => {
    const hazardId = "legacy-integer-datetime-unmigrated";
    await prisma.encryptedNote.deleteMany({ where: { id: hazardId } });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EncryptedNote"
         (id, insert_time, expire_time, ciphertext, hmac, iv, crypto_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      hazardId,
      Date.now(),
      FUTURE.getTime(),
      "bGVnYWN5",
      "bGVnYWN5",
      null,
      "v2"
    );

    // No conversion this time: the raw INTEGER compares as less-than any TEXT.
    const matched = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*) AS n FROM "EncryptedNote"
        WHERE id = ? AND expire_time <= strftime('%Y-%m-%dT%H:%M:%f', 'now') || '+00:00'`,
      hazardId
    );
    expect(Number(matched[0].n)).toBe(1);

    await prisma.encryptedNote.deleteMany({ where: { id: hazardId } });
  });
});
