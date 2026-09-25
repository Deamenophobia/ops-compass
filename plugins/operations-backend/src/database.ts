import { DatabaseService } from '@backstage/backend-plugin-api';

export type Database = Awaited<ReturnType<DatabaseService['getClient']>>;
