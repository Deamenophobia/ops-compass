import { useState } from 'react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { DeclaredGraph } from './DeclaredGraph';
import {
  Content,
  Header,
  Link,
  Page,
  Progress,
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
import { State } from '@ops-compass/operations-common';
import { OperationsLink } from '../OperationsLink';
import { useFeatures } from '../features/FeatureContext';
import { useKubernetesSnapshot } from '../useKubernetesSnapshot';
import {
  catalogPath,
  entityEvidence,
  relatedRefs,
  relationLimit,
} from './model';
import { useDependencyCatalog } from './useDependencyCatalog';
import { useDependencyEvidence } from './useDependencyEvidence';

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2),
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  field: { width: 360, maxWidth: '100%' },
  intro: { background: '#f2edf8' },
  graph: {
    height: 300,
    width: '100%',
    // Keep the upstream label renderer stable: it calls hooks. Hide redundant
    // edge text through CSS on mobile; the legend explains every arrow.
    [theme.breakpoints.down('xs')]: {
      '& g[data-testid="label"]': { display: 'none' },
    },
  },
  related: { borderTop: '1px solid #e1d6ec', paddingBlock: theme.spacing(2) },
  meta: { color: theme.palette.text.secondary, fontSize: 13 },
}));
const colors: Record<State, { background: string; color: string }> = {
  healthy: { background: '#d7f3e3', color: '#164a30' },
  warning: { background: '#fff0cb', color: '#664300' },
  critical: { background: '#ffdde0', color: '#7d1824' },
  unknown: { background: '#e5e9f0', color: '#344256' },
};
const title = (entity: Entity | undefined, ref: string) =>
  entity?.metadata.title ?? entity?.metadata.name ?? ref;

export function DependenciesPage() {
  const classes = useStyles();
  const features = useFeatures();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const { search, detail } = useDependencyCatalog(query, selected, revision);
  const evidence = useDependencyEvidence();
  const kubernetes = useKubernetesSnapshot(features.enabled('kubernetes'));
  const entity = detail?.entity;
  const relations = entity ? relatedRefs(entity) : undefined;
  const own = entityEvidence(selected, evidence.overview, evidence.elapsed);
  const graphBounded =
    relations &&
    relations.dependencies.length <= relationLimit &&
    relations.dependents.length <= relationLimit;
  const select = (ref: string) => {
    setSelected(ref);
  };
  const refresh = () => {
    setRevision(value => value + 1);
    void evidence.refresh();
    void kubernetes.refresh();
  };
  const workloadSummary = (ref: string) => {
    if (!kubernetes.data || kubernetes.data.source === 'none') return null;
    const targets = kubernetes.data.targets.filter(
      target => target.entityRef === ref,
    );
    if (!targets.length) return null;
    const pods = targets.flatMap(target => target.pods);
    const incomplete = targets.some(target =>
      Object.values(target.coverage).some(value => value !== 'available'),
    );
    return (
      <Typography className={classes.meta}>
        Kubernetes: {pods.length} observed pods;{' '}
        {pods.filter(pod => pod.status === 'ready').length} ready.
        {kubernetes.data.freshness === 'stale'
          ? ' Current readiness unknown.'
          : ''}
        {incomplete ? ' Coverage incomplete.' : ''}{' '}
        <OperationsLink route="kubernetes">View snapshot</OperationsLink>
      </Typography>
    );
  };
  const relationList = (refs: string[], heading: string, empty: string) => (
    <Paper className={classes.card}>
      <Typography variant="h5" component="h2" gutterBottom>
        {heading} ({refs.length})
      </Typography>
      {!refs.length && <Typography>{empty}</Typography>}
      {refs.slice(0, relationLimit).map(ref => {
        const related = detail?.entities?.get(ref);
        const health = entityEvidence(ref, evidence.overview, evidence.elapsed);
        return (
          <div key={ref} className={classes.related}>
            <div className={classes.row}>
              <Button
                onClick={() => select(ref)}
                aria-label={`Focus ${title(related, ref)}`}
              >
                {title(related, ref)}
              </Button>
              <Chip
                size="small"
                label={`Own checks: ${health.state}`}
                style={colors[health.state]}
              />
            </div>
            <Typography className={classes.meta}>
              {ref} · Declared dependency
            </Typography>
            {!related && (
              <Typography>
                Not registered or not visible in your catalog access.
              </Typography>
            )}
            <Typography className={classes.meta}>
              {health.observations.length} linked check(s).{' '}
              <Link to={catalogPath(ref)}>Catalog details</Link>
            </Typography>
            {workloadSummary(ref)}
          </div>
        );
      })}
      {refs.length > relationLimit && (
        <Typography>
          Showing the first {relationLimit} relationships. Open Catalog Graph
          for further exploration.
        </Typography>
      )}
    </Paper>
  );
  return (
    <Page themeId="tool">
      <Header
        title="Dependencies"
        subtitle="Applications, databases and their declared relationships."
      />
      <Content>
        <Paper className={`${classes.card} ${classes.intro}`}>
          <Typography paragraph>
            Follow a service to its databases, caches and other services. These
            relationships come from the catalog; they are not discovered network
            traffic.
          </Typography>
          <Typography className={classes.meta}>
            The catalog is shared across this installation. Health observations
            belong to the selected workspace.
          </Typography>
          {evidence.overview?.source === 'demo' && (
            <Chip label="Synthetic observations" size="small" />
          )}
        </Paper>
        <div className={classes.row}>
          <TextField
            id="dependency-search"
            label="Search catalog"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className={classes.field}
          />
          <TextField
            id="dependency-entity"
            select
            label="Application or resource"
            value={selected}
            onChange={event => select(event.target.value)}
            className={classes.field}
          >
            <MenuItem value="">Choose an entity</MenuItem>
            {selected &&
              !search?.items.some(
                item => stringifyEntityRef(item) === selected,
              ) && (
                <MenuItem value={selected}>{title(entity, selected)}</MenuItem>
              )}
            {search?.items.map(item => (
              <MenuItem
                key={stringifyEntityRef(item)}
                value={stringifyEntityRef(item)}
              >
                {title(item, stringifyEntityRef(item))} · {item.kind}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={refresh}>
            Refresh
          </Button>
        </div>
        {!search && <Progress />}
        {search?.error && <Typography role="alert">{search.error}</Typography>}
        {search && !search.error && !search.items.length && (
          <Typography role="status">
            No matching applications or resources. Try another search or
            register an entity in the catalog.
          </Typography>
        )}
        {search && search.total > search.items.length && (
          <Typography role="status">
            Showing {search.items.length} of {search.total} catalog matches.
            Narrow the search to find another entity.
          </Typography>
        )}
        {evidence.error && (
          <Typography role="alert" paragraph>
            {evidence.error}
          </Typography>
        )}
        {kubernetes.error && (
          <Typography role="alert" paragraph>
            Kubernetes observations unavailable; any retained workload status is
            unknown.
          </Typography>
        )}
        {!selected && (
          <Typography paragraph>
            Select an application or resource to explore its dependencies.{' '}
            <Link to="/docs/default/component/ops-compass/guides/dependencies">
              Setup guide
            </Link>
          </Typography>
        )}
        {selected && !detail && <Progress />}
        {detail?.error && <Typography role="alert">{detail.error}</Typography>}
        {entity && relations && (
          <>
            <Paper className={classes.card}>
              <div className={classes.row}>
                <Typography variant="h4" component="h2">
                  {title(entity, selected)}
                </Typography>
                <Chip
                  label={`${entity.kind} · ${String(
                    entity.spec?.type ?? 'unspecified',
                  )}`}
                />
                <Chip
                  label={`Own checks: ${own.state}`}
                  style={colors[own.state]}
                />
              </div>
              <Typography className={classes.meta}>
                {selected} ·{' '}
                <Link to={catalogPath(selected)}>Open in catalog</Link>
              </Typography>
              {!own.observations.length && (
                <Typography paragraph>
                  No observations are available for this entity in the current
                  workspace. Its health is unknown.
                </Typography>
              )}
              {own.observations.slice(0, 5).map(item => (
                <Typography key={item.id} paragraph>
                  {item.label}: <strong>{item.state}</strong> ·{' '}
                  {new Date(item.observedAt).toLocaleString()}
                  <br />
                  <span className={classes.meta}>{item.summary}</span>
                </Typography>
              ))}
              {own.observations.length > 5 && (
                <Typography>
                  Showing five of {own.observations.length} checks.
                </Typography>
              )}
              {own.observations.length > 0 && (
                <Typography className={classes.meta}>
                  Source: {evidence.overview?.source}. Status describes these
                  checks only.{' '}
                  <OperationsLink route="root">All observations</OperationsLink>
                </Typography>
              )}
              {workloadSummary(selected)}
            </Paper>
            <Paper className={classes.card}>
              <Typography variant="h5" component="h2">
                Declared dependency map
              </Typography>
              <Typography className={classes.meta} paragraph>
                Arrows point from a consumer to its dependency. Graph colors
                identify entities, not health. Only direct relationships are
                shown. <Link to="/catalog-graph">Open Catalog Graph</Link>
              </Typography>
              {graphBounded &&
              relations.dependencies.length + relations.dependents.length >
                0 ? (
                <DeclaredGraph
                  entity={entity}
                  revision={revision}
                  className={classes.graph}
                />
              ) : (
                <Typography>
                  {graphBounded
                    ? 'No direct dependencies or dependents declared. This does not prove that the service has no external dependencies.'
                    : 'This entity exceeds the embedded map limit. Use the bounded lists below or open Catalog Graph.'}
                </Typography>
              )}
            </Paper>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                {relationList(
                  relations.dependencies,
                  'Depends on',
                  'No dependencies declared.',
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                {relationList(
                  relations.dependents,
                  'Used by',
                  'No dependents declared.',
                )}
              </Grid>
            </Grid>
            <Typography paragraph>
              Potential impact: a problem with this entity may affect its
              declared dependents. Each application keeps its own observed
              status; a dependency failure is not proof that every consumer has
              failed.
            </Typography>
          </>
        )}
      </Content>
    </Page>
  );
}
