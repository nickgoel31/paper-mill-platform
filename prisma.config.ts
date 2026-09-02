import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL || "file:./prisma/dev.db",
  },
  // Used by `prisma migrate` / `prisma db push` / `prisma studio` locally.
  adapter: () =>
    Promise.resolve(
      new PrismaBetterSQLite3({
        url: process.env.DATABASE_URL || "file:./prisma/dev.db",
      }),
    ),
});
