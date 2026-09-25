import { useState } from 'react';
import { Content, Header, Link, Page } from '@backstage/core-components';
import {
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CloudQueueIcon from '@material-ui/icons/CloudQueue';
import ComputerIcon from '@material-ui/icons/Computer';
import {
  ConnectionSetup,
  ConnectionDraft,
  connectionDraftSchema,
  prepareConnection,
} from '@ops-compass/operations-common';
import { CompassMascot } from './CompassMascot';
import { SavedConnections } from './connections/SavedConnections';

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  intro: { background: '#f2edf8', border: '1px solid #e1d6ec' },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  fields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
    [theme.breakpoints.down('xs')]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  code: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: 13,
    padding: theme.spacing(2),
    background: '#f5f6f8',
    borderRadius: 12,
  },
  target: {
    border: '1px solid #ddd8e4',
    borderRadius: 16,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}));
const emptyTarget = () => ({
  id: '',
  sshAlias: '',
  label: '',
  entityRef: '',
  environment: '',
  region: '',
  checkDocker: false,
  minimumRunning: '1',
});
type Target = ReturnType<typeof emptyTarget>;

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ConnectionsPage() {
  const classes = useStyles();
  const [kind, setKind] = useState<'aws' | 'ssh'>('aws');
  const [account, setAccount] = useState('');
  const [regions, setRegions] = useState('');
  const [profile, setProfile] = useState('');
  const [directory, setDirectory] = useState('');
  const [targets, setTargets] = useState<Target[]>([emptyTarget()]);
  const [setup, setSetup] = useState<ConnectionSetup>();
  const [preparedDraft, setPreparedDraft] = useState<ConnectionDraft>();
  const [errors, setErrors] = useState<string[]>([]);
  // Editing invalidates an export so a previously reviewed target is never reused.
  const edit = (change: () => void) => {
    change();
    setSetup(undefined);
    setPreparedDraft(undefined);
    setErrors([]);
  };
  const changeTarget = (index: number, value: Partial<Target>) =>
    edit(() =>
      setTargets(current =>
        current.map((target, i) =>
          i === index ? { ...target, ...value } : target,
        ),
      ),
    );
  const prepare = () => {
    const result = connectionDraftSchema.safeParse(
      kind === 'aws'
        ? {
            kind,
            expectedAccountId: account,
            regions: regions
              .split(',')
              .map(r => r.trim())
              .filter(Boolean),
            profile,
            snapshotDirectory: directory,
          }
        : {
            kind,
            snapshotDirectory: directory,
            targets: targets.map(t => ({
              ...t,
              minimumRunning: t.checkDocker ? Number(t.minimumRunning) : 1,
            })),
          },
    );
    if (!result.success) {
      setErrors(
        result.error.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`,
        ),
      );
      setSetup(undefined);
      setPreparedDraft(undefined);
      return;
    }
    setErrors([]);
    setSetup(prepareConnection(result.data));
    setPreparedDraft(result.data);
  };
  const loadProfile = (draft?: ConnectionDraft) => {
    setKind(draft?.kind ?? 'aws');
    setDirectory(draft?.snapshotDirectory ?? '');
    setAccount(draft?.kind === 'aws' ? draft.expectedAccountId : '');
    setRegions(draft?.kind === 'aws' ? draft.regions.join(', ') : '');
    setProfile(draft?.kind === 'aws' ? draft.profile : '');
    setTargets(
      draft?.kind === 'ssh'
        ? draft.targets.map(target => ({
            ...target,
            minimumRunning: String(target.minimumRunning),
          }))
        : [emptyTarget()],
    );
    setErrors([]);
    setPreparedDraft(draft);
    setSetup(draft ? prepareConnection(draft) : undefined);
  };
  return (
    <Page themeId="tool">
      <Header
        title="Connections"
        subtitle="Bring your own cloud. Give your services a little home."
      >
        <CompassMascot size={110} />
      </Header>
      <Content>
        <Paper className={`${classes.card} ${classes.intro}`}>
          <div className={classes.row}>
            <Typography variant="h5">Connect your infrastructure</Typography>
            <Chip label="Drafting makes no connection" />
          </div>
          <Typography paragraph>
            Choose a source, describe your targets, then download your private
            configuration. Your credentials stay with your AWS CLI or SSH
            client.
          </Typography>
          <Typography>
            Unsaved drafts stay in this page; reloading clears them. Saved
            profiles are retained in this workspace. Demo tests and evidence
            remain synthetic.
          </Typography>
        </Paper>
        <SavedConnections draft={preparedDraft} onLoad={loadProfile} />
        <Paper className={classes.card}>
          <Typography variant="h5" gutterBottom>
            1. Choose a source
          </Typography>
          <div className={classes.row}>
            <Button
              variant={kind === 'aws' ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<CloudQueueIcon />}
              aria-pressed={kind === 'aws'}
              onClick={() => edit(() => setKind('aws'))}
            >
              AWS account inventory
            </Button>
            <Button
              variant={kind === 'ssh' ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<ComputerIcon />}
              aria-pressed={kind === 'ssh'}
              onClick={() => edit(() => setKind('ssh'))}
            >
              Linux servers over SSH
            </Button>
          </div>
          <Typography>
            {kind === 'aws'
              ? 'Read EC2 instances in the regions you choose. The collector checks the expected account with STS before querying EC2. Inventory does not establish application health.'
              : 'Read root disk usage and optional Docker counts on Linux hosts, including VMs from other cloud providers. This is an SSH connection, not native Azure or Google Cloud account discovery.'}
          </Typography>
          <Typography paragraph>
            {kind === 'aws'
              ? 'Requires Python and AWS CLI on the collector machine, with an authenticated profile or workload identity and ec2:DescribeInstances access. Configure SSO or a role with your administrator; this page does not create permissions.'
              : 'Requires Python and SSH on the collector machine, Python 3 on each host, an existing SSH alias and a verified host key. Docker counts also require Docker read access. No host agent is installed.'}
          </Typography>
          <Link to="/docs/default/component/ops-compass/guides/cloudwatch">
            For existing CloudWatch alarms, use the alarm connection guide
          </Link>
        </Paper>
        <Paper className={classes.card}>
          <Typography variant="h5" gutterBottom>
            2. Describe your connection
          </Typography>
          {kind === 'aws' ? (
            <div className={classes.fields}>
              <TextField
                id="connection-account"
                label="Expected AWS account ID"
                value={account}
                onChange={e => edit(() => setAccount(e.target.value))}
                inputProps={{ maxLength: 12 }}
                helperText="12 digits; the collector refuses a different account."
              />
              <TextField
                id="connection-regions"
                label="AWS regions"
                value={regions}
                onChange={e => edit(() => setRegions(e.target.value))}
                placeholder="eu-west-1, us-east-1"
                helperText="Comma-separated region codes, up to 20."
              />
              <TextField
                id="connection-profile"
                label="AWS profile (optional)"
                value={profile}
                onChange={e => edit(() => setProfile(e.target.value))}
                helperText="A profile name only. Blank uses the CLI credential chain."
              />
            </div>
          ) : (
            <>
              {targets.map((target, index) => (
                <div
                  className={classes.target}
                  key={index}
                  role="group"
                  aria-label={`Server ${index + 1}`}
                >
                  <div className={classes.row}>
                    <Typography variant="h6">Server {index + 1}</Typography>
                    <Button
                      disabled={targets.length === 1}
                      onClick={() =>
                        edit(() =>
                          setTargets(current =>
                            current.filter((_, i) => i !== index),
                          ),
                        )
                      }
                    >
                      Remove server {index + 1}
                    </Button>
                  </div>
                  <div className={classes.fields}>
                    <TextField
                      id={`connection-host-${index}-id`}
                      label="Server ID"
                      value={target.id}
                      onChange={e =>
                        changeTarget(index, { id: e.target.value })
                      }
                      helperText="Unique ID: letters, numbers and hyphens."
                    />
                    <TextField
                      id={`connection-host-${index}-alias`}
                      label="SSH alias"
                      value={target.sshAlias}
                      onChange={e =>
                        changeTarget(index, { sshAlias: e.target.value })
                      }
                      helperText="An alias already configured in your SSH client."
                    />
                    <TextField
                      id={`connection-host-${index}-label`}
                      label="Display name"
                      value={target.label}
                      onChange={e =>
                        changeTarget(index, { label: e.target.value })
                      }
                    />
                    <TextField
                      id={`connection-host-${index}-entity`}
                      label="Catalog entity reference"
                      value={target.entityRef}
                      onChange={e =>
                        changeTarget(index, { entityRef: e.target.value })
                      }
                      placeholder="resource:default/my-server"
                    />
                    <TextField
                      id={`connection-host-${index}-environment`}
                      label="Environment"
                      value={target.environment}
                      onChange={e =>
                        changeTarget(index, { environment: e.target.value })
                      }
                      placeholder="development"
                    />
                    <TextField
                      id={`connection-host-${index}-region`}
                      label="Region or location"
                      value={target.region}
                      onChange={e =>
                        changeTarget(index, { region: e.target.value })
                      }
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={target.checkDocker}
                          onChange={e =>
                            changeTarget(index, {
                              checkDocker: e.target.checked,
                            })
                          }
                          color="primary"
                        />
                      }
                      label="Include Docker counts"
                    />
                    {target.checkDocker && (
                      <TextField
                        id={`connection-host-${index}-minimum`}
                        label="Minimum running containers"
                        type="number"
                        value={target.minimumRunning}
                        onChange={e =>
                          changeTarget(index, {
                            minimumRunning: e.target.value,
                          })
                        }
                        inputProps={{ min: 1, max: 10000 }}
                      />
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outlined"
                disabled={targets.length >= 20}
                onClick={() =>
                  edit(() => setTargets(current => [...current, emptyTarget()]))
                }
              >
                Add server
              </Button>
            </>
          )}
          <div className={classes.fields}>
            <TextField
              id="connection-directory"
              label="Snapshot directory on portal backend"
              value={directory}
              onChange={e => edit(() => setDirectory(e.target.value))}
              placeholder="/srv/ops-compass/private"
              helperText="Absolute path where the backend will read collected files. Windows drive paths are also accepted."
            />
          </div>
          <Typography paragraph>
            Use the private directory inside your checkout for a local setup.
            For separate machines or containers, arrange a private file copy or
            volume mount to this directory.
          </Typography>
          <Button variant="contained" color="primary" onClick={prepare}>
            Prepare setup
          </Button>
          {errors.length > 0 && (
            <div role="alert">
              <Typography>Please correct the connection details:</Typography>
              <ul>
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </Paper>
        {setup && (
          <Paper className={classes.card}>
            <Typography variant="h5" gutterBottom>
              3. Review and download
            </Typography>
            <Typography paragraph>
              Prepared locally. No configuration has been installed and no
              server has been contacted.
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6">Collector configuration</Typography>
                <pre className={classes.code}>{setup.collectorJson}</pre>
                <Button
                  variant="outlined"
                  onClick={() =>
                    download(setup.collectorFilename, setup.collectorJson)
                  }
                >
                  Download collector configuration
                </Button>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6">Portal configuration</Typography>
                <pre className={classes.code}>{setup.portalJson}</pre>
                <Button
                  variant="outlined"
                  onClick={() =>
                    download(
                      'app-config.connections.local.yaml',
                      setup.portalJson,
                    )
                  }
                >
                  Download portal configuration
                </Button>
              </Grid>
            </Grid>
            <Typography variant="h6">4. Collect and verify</Typography>
            <Typography paragraph>
              Save the collector file in private/ and the portal file at the
              repository root. Run the command below from the root using your
              own authenticated collector machine. If necessary, copy its output
              to the snapshot directory you chose.
            </Typography>
            <pre className={classes.code}>{setup.command}</pre>
            <Typography paragraph>
              Use main for real connections. Start with the explicit overlay
              below, then check the source, collection time and coverage in{' '}
              {kind === 'aws' ? 'AWS inventory' : 'Operations'}. Preparing a
              file does not verify access; errors or stale evidence must be
              resolved before relying on the result.
            </Typography>
            <pre className={classes.code}>
              node .yarn/releases/yarn-4.13.0.cjs start --config app-config.yaml
              --config app-config.connections.local.yaml
            </pre>
            <Typography paragraph>
              The overlay configures this observation source. Merge it with your
              existing private configuration if you already use another source.
              Keep downloaded files private.
            </Typography>
            <div className={classes.row}>
              <Link to={kind === 'aws' ? '/inventory' : '/'}>
                View collected evidence
              </Link>
              <Link to="/docs/default/component/ops-compass/guides/connections">
                Full connection manual
              </Link>
            </div>
          </Paper>
        )}
      </Content>
    </Page>
  );
}
