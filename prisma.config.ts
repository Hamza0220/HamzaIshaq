import 'dotenv/config';
import path from 'path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join('src', 'infrastructure', 'database', 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join('src', 'infrastructure', 'database', 'prisma', 'migrations'),
  },
  // DATABASE_URL is only needed at runtime (migrate/query), not at generate time
  ...(process.env['DATABASE_URL']
    ? { datasource: { url: process.env['DATABASE_URL'] } }
    : {}),
});
