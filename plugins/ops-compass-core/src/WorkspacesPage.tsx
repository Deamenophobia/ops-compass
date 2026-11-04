import { useEffect, useState } from 'react';
import {
  Content,
  Header,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import {
  WorkspaceResource,
  WorkspaceRecord,
  WorkspaceRole,
} from '@ops-compass/core';
import { useWorkspaces } from './WorkspaceContext';

export function WorkspacesPage() {
  const { data, error, selectedId, select, refresh, request } = useWorkspaces();
  const current = data?.items.find(item => item.id === selectedId);
  const [detail, setDetail] = useState<WorkspaceResource>();
  const [failure, setFailure] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [member, setMember] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('user');
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    if (current?.role === 'admin')
      request<WorkspaceResource>(`/${selectedId}`)
        .then(result => {
          if (active) {
            setDetail(result);
            setName(result.name);
          }
        })
        .catch(cause => {
          if (active) setFailure(cause);
        });
    return () => {
      active = false;
    };
  }, [request, selectedId, current?.role, current?.version]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(undefined);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause : new Error('Workspace update failed'),
      );
    } finally {
      setBusy(false);
    }
  };
  const updateMember = (
    userEntityRef: string,
    nextRole: WorkspaceRole | null,
  ) =>
    run(async () => {
      if (!detail) return;
      setDetail(
        await request(`/${selectedId}/members`, {
          version: detail.version,
          userEntityRef,
          role: nextRole,
        }),
      );
      setMember('');
    });
  return (
    <Page themeId="service">
      <Header
        title="Workspaces"
        subtitle="A calm place for each set of services and the people who care for them."
      />
      <Content>
        {(failure || error) && (
          <ResponseErrorPanel error={(failure || error)!} />
        )}
        {!data && !error && <Progress />}
        {data && (
          <>
            <Box mb={3}>
              <Chip
                label={`${data.profile === 'team' ? 'Team' : 'Personal'} mode`}
              />
              <Typography paragraph>
                Operational records, feature choices and connection references
                belong to the selected workspace. The service catalog and
                handbook are shared across this installation.
              </Typography>
            </Box>
            <Paper
              style={{ padding: 24, marginBottom: 24, background: '#f2edf8' }}
            >
              <Typography variant="h5">Your workspaces</Typography>
              {!data.items.length && (
                <Typography>
                  No workspace membership yet. Create a workspace or ask its
                  administrator to add your identity: {data.userEntityRef}.
                </Typography>
              )}
              {data.items.map(item => (
                <Box
                  key={item.id}
                  display="flex"
                  alignItems="center"
                  flexWrap="wrap"
                  gridGap={12}
                  mt={2}
                >
                  <Typography>{item.name}</Typography>
                  <Chip
                    size="small"
                    label={item.role === 'admin' ? 'Administrator' : 'User'}
                  />
                  <Button
                    disabled={busy || selectedId === item.id}
                    onClick={() => select(item.id)}
                  >
                    {selectedId === item.id ? 'Selected' : 'Select workspace'}
                  </Button>
                </Box>
              ))}
              {data.canCreate && (
                <Box mt={3} display="flex" flexWrap="wrap" gridGap={16}>
                  <TextField
                    id="core-workspace-new"
                    label="New workspace name"
                    value={newName}
                    onChange={event => setNewName(event.target.value)}
                    inputProps={{ maxLength: 80 }}
                  />
                  <Button
                    color="primary"
                    variant="contained"
                    disabled={busy || !newName.trim()}
                    onClick={() =>
                      run(async () => {
                        const created = await request<WorkspaceRecord>('', {
                          name: newName,
                        });
                        await refresh();
                        setNewName('');
                        select(created.id);
                      })
                    }
                  >
                    Create workspace
                  </Button>
                </Box>
              )}
            </Paper>
            {current && (
              <Paper style={{ padding: 24, marginBottom: 24 }}>
                <Typography variant="h5">{current.name}</Typography>
                <Typography
                  color="textSecondary"
                  paragraph
                  style={{ overflowWrap: 'anywhere' }}
                >
                  Workspace ID: {selectedId}
                </Typography>
                <Link to="/features">Choose enabled features</Link>
                {current.role !== 'admin' && (
                  <Typography paragraph>
                    Your administrator manages workspace settings and
                    memberships. You can use enabled features and record work.
                  </Typography>
                )}
                {detail && current.role === 'admin' && (
                  <>
                    <Box mt={3} display="flex" flexWrap="wrap" gridGap={16}>
                      <TextField
                        id="core-workspace-name"
                        label="Workspace name"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        inputProps={{ maxLength: 80 }}
                      />
                      <Button
                        disabled={
                          busy || !name.trim() || name.trim() === detail.name
                        }
                        onClick={() =>
                          run(async () => {
                            setDetail(
                              await request(`/${selectedId}`, {
                                version: detail.version,
                                name,
                              }),
                            );
                          })
                        }
                      >
                        Save name
                      </Button>
                    </Box>
                    {data.profile === 'team' && (
                      <>
                        <Box mt={4}>
                          <Typography variant="h6">Members</Typography>
                          <Typography paragraph>
                            Add an existing Backstage identity. Every workspace
                            must retain an administrator.
                          </Typography>
                        </Box>
                        {detail.members.map(item => (
                          <Box
                            key={item.userEntityRef}
                            mb={2}
                            display="flex"
                            flexWrap="wrap"
                            alignItems="center"
                            gridGap={16}
                          >
                            <Typography>{item.userEntityRef}</Typography>
                            <TextField
                              select
                              id={`core-role-${item.userEntityRef}`}
                              label={`Role for ${item.userEntityRef}`}
                              value={item.role}
                              disabled={busy}
                              onChange={event =>
                                updateMember(
                                  item.userEntityRef,
                                  event.target.value as WorkspaceRole,
                                )
                              }
                            >
                              <MenuItem value="user">User</MenuItem>
                              <MenuItem value="admin">Administrator</MenuItem>
                            </TextField>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                updateMember(item.userEntityRef, null)
                              }
                            >
                              Remove member
                            </Button>
                          </Box>
                        ))}
                        <Box display="flex" flexWrap="wrap" gridGap={16}>
                          <TextField
                            id="core-workspace-member"
                            label="Member identity"
                            placeholder="user:default/alex"
                            value={member}
                            onChange={event => setMember(event.target.value)}
                          />
                          <TextField
                            select
                            id="core-member-role"
                            label="New member role"
                            value={role}
                            onChange={event =>
                              setRole(event.target.value as WorkspaceRole)
                            }
                          >
                            <MenuItem value="user">User</MenuItem>
                            <MenuItem value="admin">Administrator</MenuItem>
                          </TextField>
                          <Button
                            disabled={busy || !member.trim()}
                            onClick={() => updateMember(member.trim(), role)}
                          >
                            Add member
                          </Button>
                        </Box>
                      </>
                    )}
                  </>
                )}
              </Paper>
            )}
          </>
        )}
      </Content>
    </Page>
  );
}
