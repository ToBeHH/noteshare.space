import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

if (process.env.UNIT_TEST === "TRUE") {
  throw Error("Database operations must be mocked in unit tests.");
}

// Prisma 7 has no built-in query engine: the database is reached through a
// driver adapter, which is what removed the old native-engine/OpenSSL coupling.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL as string,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
