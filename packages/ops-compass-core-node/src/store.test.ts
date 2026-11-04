import knex from 'knex';
import { WorkspaceDirectory } from './store';

const owner = 'user:default/owner';
const colleague = 'user:default/colleague';
let db: ReturnType<typeof knex>;
let directory: WorkspaceDirectory;
beforeEach(async () => {
  db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  directory = new WorkspaceDirectory(db);
  await directory.init([owner]);
});
afterEach(async () => {
  await db.destroy();
});

it('preserves names and removed bootstrap memberships across restart', async () => {
  await directory.setMember('personal', 0, colleague, 'admin');
  await directory.setMember('personal', 1, owner, null);
  await directory.rename('personal', 2, 'My services');
  await new WorkspaceDirectory(db).init([owner]);
  expect(await directory.get('personal')).toMatchObject({
    name: 'My services',
    version: 3,
    members: [{ userEntityRef: colleague, role: 'admin' }],
  });
});

it('rejects concurrent stale updates and protects the final administrator', async () => {
  await expect(
    directory.setMember('personal', 0, owner, 'user'),
  ).rejects.toThrow('at least one administrator');
  await expect(directory.setMember('personal', 0, owner, null)).rejects.toThrow(
    'at least one administrator',
  );
  const outcomes = await Promise.allSettled([
    directory.rename('personal', 0, 'First edit'),
    directory.rename('personal', 0, 'Second edit'),
  ]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(
    1,
  );
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(
    1,
  );
  expect((await directory.get('personal'))?.version).toBe(1);
});

it('assigns the creator only to a new workspace and does not copy personal members', async () => {
  const workspace = await directory.create('Shared services', colleague);
  expect(workspace.id).not.toBe('personal');
  expect((await directory.get(workspace.id))?.members).toEqual([
    { userEntityRef: colleague, role: 'admin' },
  ]);
  expect((await directory.get('personal'))?.members).toEqual([
    { userEntityRef: owner, role: 'admin' },
  ]);
});
