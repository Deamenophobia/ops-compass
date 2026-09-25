import { makeStyles } from '@material-ui/core';
import {
  Deployment,
  NotificationSettings,
  OperationDocument,
  Service,
  Workspace,
  evidenceAge,
} from '@ops-compass/operations-common';

export const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    minWidth: 0,
  },
  intro: {
    padding: theme.spacing(3),
    background: '#f2edf8',
    marginBottom: theme.spacing(3),
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(2),
  },
  meta: {
    color: theme.palette.text.secondary,
    fontSize: 13,
    overflowWrap: 'anywhere',
  },
  title: { marginBottom: theme.spacing(2) },
  field: { minWidth: 180, maxWidth: '100%' },
  table: {
    width: '100%',
    minWidth: 720,
    borderCollapse: 'collapse',
    '& th, & td': {
      textAlign: 'left',
      padding: theme.spacing(1.5),
      borderBottom: '1px solid #e5dfe9',
      verticalAlign: 'top',
      overflowWrap: 'anywhere',
    },
  },
  scroll: { overflowX: 'auto' },
  tabs: { marginBottom: theme.spacing(3) },
  code: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    background: '#faf7f2',
    borderRadius: 14,
    padding: theme.spacing(2),
    maxHeight: 350,
    overflow: 'auto',
  },
  notice: {
    background: '#eef5ee',
    padding: theme.spacing(2),
    borderRadius: 14,
    marginBottom: theme.spacing(2),
  },
  bar: {
    height: 20,
    borderRadius: 20,
    background: '#eee6f5',
    overflow: 'hidden',
    margin: '12px 0',
  },
  artwork: { [theme.breakpoints.down('xs')]: { display: 'none' } },
}));

// Share the module order with backend admission and frontend navigation.
export { workspaceFeatures as tabs } from '@ops-compass/operations-common';

export const emptySettings: NotificationSettings = {
  provider: 'disabled',
  recipient: '',
  sender: '',
  automatic: false,
};

export function date(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}

export function catalogLink(service: Service) {
  const [kind, ref] = service.entityRef.split(':');
  const [namespace, name] = ref.split('/');
  return `/catalog/${namespace}/${kind}/${name}`;
}

export function download(document: OperationDocument) {
  const url = URL.createObjectURL(
    new Blob([document.markdown], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${document.id}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function workspaceTitle(source: Workspace['source']) {
  if (source === 'demo') return 'Demo workspace';
  if (source === 'none') return 'Your workspace is ready to connect';
  return 'Your operations workspace';
}

export function heartbeatText(service: Service) {
  if (!service.heartbeat) return 'Not configured';
  return evidenceAge(
    service.heartbeat.lastSeenAt,
    service.heartbeat.maxAgeSeconds,
  ) === 'current'
    ? 'Heartbeat current'
    : 'Unknown · no recent heartbeat';
}

export function versionText(
  service: Service,
  latest: Deployment,
  maxAgeSeconds: number,
) {
  if (
    evidenceAge(latest.observedAt, 3600) !== 'current' ||
    !service.containers.length ||
    service.containers.some(
      c =>
        !c.revision || evidenceAge(c.observedAt, maxAgeSeconds) !== 'current',
    )
  ) {
    return 'Version comparison unknown: collect current runtime revisions.';
  }
  const matches = service.containers.every(
    c =>
      c.revision &&
      (latest.sha.startsWith(c.revision) || c.revision.startsWith(latest.sha)),
  );
  return matches
    ? 'Runtime commits match the latest pipeline commit.'
    : 'Version difference: a runtime commit differs from the latest pipeline.';
}

export function certificateText(service: Service) {
  if (!service.certificate) return 'Not configured';
  const certificate = service.certificate;
  if (
    !certificate.expiresAt ||
    evidenceAge(certificate.checkedAt, 86400) !== 'current'
  ) {
    return 'Certificate status unknown; collect a current TLS check.';
  }
  const remaining = Date.parse(certificate.expiresAt) - Date.now();
  return `${certificate.hostname} · ${Math.ceil(
    remaining / 86400000,
  )} days until expiry${remaining < 14 * 86400000 ? ' · Needs attention' : ''}`;
}
