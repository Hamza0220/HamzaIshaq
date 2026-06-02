import 'dotenv/config';
import { Pool } from 'pg';
import { config } from './infrastructure/config/env';
import { logger } from './shared/utils/logger';
import { createApp } from './app';

// ---------------------------------------------------------------------------
// Verify database connectivity before accepting traffic
// ---------------------------------------------------------------------------

async function checkDatabaseConnection(): Promise<void> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established');
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  // Verify DB is reachable
  await checkDatabaseConnection();

  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        pid: process.pid,
      },
      `Server listening on port ${config.PORT}`,
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
