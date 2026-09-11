import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 reads the connection string from here instead of from the
// `datasource` block in schema.prisma. This is CLI-side only (migrate, studio);
// at runtime the URL goes to the driver adapter in src/db/client.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});
