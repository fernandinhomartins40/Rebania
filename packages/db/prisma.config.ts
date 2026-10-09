import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://rebania:rebania@localhost:5432/rebania",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
