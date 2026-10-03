import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../config/env';
import { NEON_SCHEMA_SQL } from './postgres.schema';

export const POSTGRES_POOL = Symbol('POSTGRES_POOL');

export function createPgPool(databaseUrl: string): Pool {
  const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const connectionString = databaseUrl.replace(/([?&])sslmode=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  return new Pool({
    connectionString,
    max: 3,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [AppConfig],
      useFactory: async (config: AppConfig): Promise<Pool | null> => {
        if (config.dataDriver !== 'postgres') return null;
        const pool = createPgPool(config.databaseUrl);
        await pool.query(NEON_SCHEMA_SQL);
        return pool;
      },
    },
  ],
  exports: [POSTGRES_POOL],
})
export class PostgresModule {}
