import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

let pool: Pool | null = null;

function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required for backend-owned account core persistence.',
    );
  }
  return connectionString;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl:
        process.env.PGSSLMODE?.toLowerCase() === 'disable'
          ? false
          : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values as unknown[]);
}

export async function withDbTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDbPool() {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}
