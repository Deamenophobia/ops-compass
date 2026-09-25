import { useEffect, useRef, useState } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import {
  AgentContext,
  AgentRequest,
  agentContextSchema,
} from '@ops-compass/operations-common';
import { CompassMascot } from './CompassMascot';

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  intro: { background: '#eef5ee', border: '1px solid #d7e5db' },
  prompts: { background: '#fff3e7', border: '1px solid #eadccd' },
  artwork: {
    flexShrink: 0,
    marginLeft: theme.spacing(3),
    [theme.breakpoints.down('xs')]: { display: 'none' },
  },
  row: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: theme.spacing(2),
  },
  input: { minWidth: 180, flex: '1 1 180px', maxWidth: '100%' },
  code: {
    overflow: 'auto',
    maxHeight: 420,
    padding: theme.spacing(2),
    background: theme.palette.background.default,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    borderRadius: 16,
    border: '1px dashed #d7c9e1',
  },
}));

export function AgentPage() {
  const classes = useStyles();
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [endpoint, setEndpoint] = useState('');
  const [intent, setIntent] = useState<AgentRequest['intent']>('incident');
  const [observationId, setObservationId] = useState('');
  const [context, setContext] = useState<AgentContext>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeRequest = useRef<AbortController>();

  useEffect(() => {
    let mounted = true;
    discovery
      .getBaseUrl('mcp-actions')
      .then(url => {
        if (mounted) setEndpoint(`${url}/v1`);
      })
      .catch(() => {
        if (mounted)
          setError(new Error('Could not discover the MCP endpoint.'));
      });
    return () => {
      mounted = false;
      activeRequest.current?.abort();
    };
  }, [discovery]);

  async function preview() {
    // A preview is one captured evidence bundle. Never keep it visible after a
    // failed refresh, or silently replace it while someone is copying citations.
    setContext(undefined);
    setError(undefined);
    setCopied(false);
    setLoading(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const base = await discovery.getBaseUrl('operations');
      const query = new URLSearchParams({ intent });
      if (observationId.trim())
        query.set('observationId', observationId.trim());
      const response = await fetchApi.fetch(`${base}/agent/context?${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 404)
          throw new Error(
            'Observation not found. Use an ID from the Operations page or leave the field empty.',
          );
        if (response.status === 400)
          throw new Error(
            'Use an observation ID containing lowercase letters, numbers and hyphens.',
          );
        throw new Error(
          'Evidence unavailable. No earlier preview is retained; check the source and your sign-in.',
        );
      }
      setContext(agentContextSchema.parse(await response.json()));
    } catch (cause) {
      setError(
        new Error(
          cause instanceof Error ? cause.message : 'Could not prepare context.',
        ),
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <Page themeId="tool">
      <Header
        title="Agent access"
        subtitle="A helpful starting point for your AI, with real sources to follow."
      >
        <div className={classes.artwork}>
          <CompassMascot size={150} />
        </div>
      </Header>
      <Content>
        <Paper className={`${classes.card} ${classes.intro}`}>
          <Typography variant="h5" gutterBottom>
            Connect an AI to useful evidence
          </Typography>
          <Typography>
            Read health checks and runbooks, then ask your AI client to explain
            an incident or draft a worklog with citations. No model training or
            model API key is needed by this portal.
          </Typography>
          <div className={classes.row}>
            <Chip label="Read-only tools" />
            <Chip label="MCP + HTTP API" />
            <Chip label="Model supplied by your client" />
          </div>
        </Paper>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Paper className={classes.card}>
              <Typography variant="h6" gutterBottom>
                Preview agent context
              </Typography>
              <Typography color="textSecondary">
                This assembles facts and an outline. It does not generate an AI
                answer or record work as completed. Review the data before
                sharing it with a model provider.
              </Typography>
              <div className={classes.row}>
                <TextField
                  id="agent-intent"
                  className={classes.input}
                  select
                  label="Purpose"
                  value={intent}
                  disabled={loading}
                  onChange={e => {
                    setIntent(e.target.value as AgentRequest['intent']);
                    setContext(undefined);
                    setCopied(false);
                  }}
                >
                  <MenuItem value="incident">Explain an incident</MenuItem>
                  <MenuItem value="worklog">Draft a worklog</MenuItem>
                </TextField>
                <TextField
                  id="agent-observation"
                  label="Observation ID (optional)"
                  className={classes.input}
                  value={observationId}
                  disabled={loading}
                  helperText="Leave empty for all configured checks"
                  onChange={e => {
                    setObservationId(e.target.value);
                    setContext(undefined);
                    setCopied(false);
                  }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={preview}
                  disabled={loading}
                >
                  Generate preview
                </Button>
              </div>
              {loading && <Progress />}
              {error && <ResponseErrorPanel error={error} />}
              {context && (
                <div aria-live="polite">
                  <div className={classes.row}>
                    <Chip label={`Source: ${context.overview.source}`} />
                    <Chip label={`State: ${context.overview.overall}`} />
                    <Chip
                      label={`${context.overview.counts.unknown} unknown`}
                    />
                  </div>
                  <Typography paragraph>
                    Captured at {context.overview.evaluatedAt}. This preview is
                    a snapshot; generate it again before relying on changing
                    health.
                  </Typography>
                  <Typography variant="h6">Suggested outline</Typography>
                  <ul>
                    {context.draftOutline.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <Typography variant="h6">Evidence and references</Typography>
                  <ul>
                    {context.citations.map(c => (
                      <li key={c.id}>
                        <Link to={c.href}>{c.title}</Link> — {c.id}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          JSON.stringify(context, null, 2),
                        );
                        setCopied(true);
                      } catch {
                        setError(
                          new Error(
                            'Clipboard unavailable. Select and copy the preview text below.',
                          ),
                        );
                      }
                    }}
                  >
                    {copied ? 'Copied context' : 'Copy context JSON'}
                  </Button>
                  <pre className={classes.code} aria-label="Agent context JSON">
                    {JSON.stringify(context, null, 2)}
                  </pre>
                </div>
              )}
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper className={classes.card}>
              <Typography variant="h6" gutterBottom>
                Connect through MCP
              </Typography>
              <Typography>
                Use a Streamable HTTP MCP client and a scoped local bearer
                token. The setup guide includes a launcher that creates the
                local connection file.
              </Typography>
              <pre className={classes.code}>
                {endpoint || 'Discovering endpoint…'}
              </pre>
              <Typography variant="subtitle1">Available tools</Typography>
              <ul>
                <li>
                  <code>operations.get-overview</code> — observations and
                  freshness
                </li>
                <li>
                  <code>operations.get-runbook</code> — health or email
                  checklist
                </li>
                <li>
                  <code>operations.prepare-context</code> — cited incident or
                  worklog context
                </li>
              </ul>
              <Link to="/docs/default/component/ops-compass/guides/agent-access/">
                Agent setup guide
              </Link>
              <Typography paragraph>
                The optional model client fetches this evidence through MCP and
                writes a cited draft locally. It checks freshness and citation
                IDs; you review the claims before saving a worklog. Model
                credentials belong to your client, and training is not required.
              </Typography>
              <Link to="/docs/default/component/ops-compass/guides/ai-client/">
                Run the model client and evidence evaluations
              </Link>
            </Paper>
            <Paper className={`${classes.card} ${classes.prompts}`}>
              <Typography variant="h6" gutterBottom>
                A few conversation starters
              </Typography>
              <Typography paragraph>
                “Which checks need attention? Cite their timestamps and
                distinguish stale evidence from active warnings.”
              </Typography>
              <Typography>
                “Prepare a worklog draft from the observed facts. Leave actions
                and verification blank when the tools have no evidence.”
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
}
