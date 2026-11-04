import { randomUUID } from 'node:crypto';
import { DatabaseService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import {
  DEFAULT_WORKSPACE_ID,
  memberRefSchema,
  WorkspaceRecord,
  WorkspaceResource,
  WorkspaceRole,
  workspaceNameSchema,
  workspaceSchema,
} from '@ops-compass/core';

export type CoreDatabase = Awaited<ReturnType<DatabaseService['getClient']>>;

/** Workspace metadata has no dependency on AWS, notifications, or the operations UI. */
export class WorkspaceDirectory {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: CoreDatabase) {}
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => undefined);
    return result;
  }
  async init(administrators: string[]) {
    const admins = [
      ...new Set(administrators.map(value => memberRefSchema.parse(value))),
    ];
    if (!admins.length)
      throw new InputError('Configure an initial workspace administrator.');
    await this.db.migrate.latest({
      tableName: 'ops_core_migrations',
      migrationSource: {
        getMigrations: async () => ['001-workspace-directory'],
        getMigrationName: (name: string) => name,
        getMigration: async () => ({
          up: async (db: CoreDatabase) => {
            await db.schema.createTable('ops_core_workspaces', table => {
              table.string('id').primary();
              table.string('name').notNullable();
              table.integer('version').notNullable().defaultTo(0);
              table.string('createdAt').notNullable();
            });
            await db.schema.createTable('ops_core_members', table => {
              table
                .string('workspaceId')
                .notNullable()
                .references('id')
                .inTable('ops_core_workspaces');
              table.string('userEntityRef').notNullable();
              table.string('role').notNullable();
              table.primary(['workspaceId', 'userEntityRef']);
              table.index(['userEntityRef']);
            });
          },
          down: async () => {
            throw new Error(
              'Restore a verified backup with its matching application version.',
            );
          },
        }),
      },
    });
    await this.db.transaction(async db => {
      if (
        await db('ops_core_workspaces')
          .where({ id: DEFAULT_WORKSPACE_ID })
          .first()
      )
        return;
      await db('ops_core_workspaces').insert({
        id: DEFAULT_WORKSPACE_ID,
        name: 'Personal workspace',
        version: 0,
        createdAt: new Date().toISOString(),
      });
      await db('ops_core_members').insert(
        admins.map(userEntityRef => ({
          workspaceId: DEFAULT_WORKSPACE_ID,
          userEntityRef,
          role: 'admin',
        })),
      );
    });
  }
  async list(): Promise<WorkspaceRecord[]> {
    return (
      await this.db('ops_core_workspaces').orderBy('createdAt').limit(100)
    ).map(row => workspaceSchema.parse(row));
  }
  async get(id: string): Promise<WorkspaceResource | undefined> {
    const row = await this.db('ops_core_workspaces').where({ id }).first();
    if (!row) return undefined;
    const members = await this.db('ops_core_members')
      .where({ workspaceId: id })
      .select('userEntityRef', 'role')
      .orderBy('userEntityRef');
    return { ...workspaceSchema.parse(row), members };
  }
  create(name: string, actor: string) {
    return this.serialize(() =>
      this.db.transaction(async db => {
        if (
          Number(
            (await db('ops_core_workspaces').count({ total: '*' }).first())
              ?.total,
          ) >= 100
        )
          throw new InputError(
            'This installation supports up to 100 workspaces.',
          );
        const workspace: WorkspaceRecord = {
          id: randomUUID(),
          name: workspaceNameSchema.parse(name),
          version: 0,
          createdAt: new Date().toISOString(),
        };
        await db('ops_core_workspaces').insert(workspace);
        await db('ops_core_members').insert({
          workspaceId: workspace.id,
          userEntityRef: memberRefSchema.parse(actor),
          role: 'admin',
        });
        return workspace;
      }),
    );
  }
  private async current(db: CoreDatabase, id: string, version: number) {
    const current = await db('ops_core_workspaces').where({ id }).first();
    if (!current) throw new NotFoundError('Workspace unavailable.');
    if (current.version !== version)
      throw new ConflictError('Workspace changed. Reload before saving.');
    return current;
  }
  rename(id: string, version: number, name: string) {
    return this.serialize(() =>
      this.db.transaction(async db => {
        await this.current(db, id, version);
        await db('ops_core_workspaces')
          .where({ id, version })
          .update({
            name: workspaceNameSchema.parse(name),
            version: version + 1,
          });
      }),
    );
  }
  setMember(
    id: string,
    version: number,
    userEntityRef: string,
    role: WorkspaceRole | null,
  ) {
    return this.serialize(() =>
      this.db.transaction(async db => {
        await this.current(db, id, version);
        const key = {
          workspaceId: id,
          userEntityRef: memberRefSchema.parse(userEntityRef),
        };
        const previous = await db('ops_core_members').where(key).first();
        if (previous?.role === 'admin' && role !== 'admin') {
          const admins = await db('ops_core_members')
            .where({ workspaceId: id, role: 'admin' })
            .count({ total: '*' })
            .first();
          if (Number(admins?.total) <= 1)
            throw new ConflictError(
              'Keep at least one administrator in the workspace.',
            );
        }
        if (role === null) await db('ops_core_members').where(key).delete();
        else
          await db('ops_core_members')
            .insert({ ...key, role })
            .onConflict(['workspaceId', 'userEntityRef'])
            .merge();
        await db('ops_core_workspaces')
          .where({ id, version })
          .update({ version: version + 1 });
      }),
    );
  }
}
