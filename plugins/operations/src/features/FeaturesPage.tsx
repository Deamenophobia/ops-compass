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
  Button,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  Typography,
  makeStyles,
} from '@material-ui/core';
import {
  FeatureState,
  featureDefinitions,
  featurePreset,
} from '@ops-compass/operations-common';
import { CompassMascot } from '../CompassMascot';
import { useFeatures } from './FeatureContext';

const useStyles = makeStyles(theme => ({
  intro: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    background: '#f2edf8',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  card: { padding: theme.spacing(2.5), height: '100%', borderRadius: 20 },
}));
export function FeaturesPage() {
  const classes = useStyles();
  const features = useFeatures();
  const [form, setForm] = useState<FeatureState>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<Error>();
  useEffect(() => {
    if (!form && features.data) setForm(features.data);
  }, [features.data, form]);
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(undefined);
    setNotice('');
    try {
      setForm(await features.save(form.version, form.enabled));
      setNotice('Feature choices saved for this workspace.');
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Unable to save'));
      await features.refresh();
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || !features.data?.canWrite;
  const changed =
    form &&
    features.data &&
    featureDefinitions.some(
      feature =>
        form.enabled[feature.id] !== features.data!.enabled[feature.id],
    );
  const edit = (next: FeatureState) => {
    setForm(next);
    setNotice('');
  };
  return (
    <Page themeId="service">
      <Header
        title="Workspace features"
        subtitle="Keep what you need. Turn the rest on when it becomes useful."
      >
        <CompassMascot size={115} />
      </Header>
      <Content>
        {!form && !features.error && <Progress />}
        {(error || features.error) && (
          <ResponseErrorPanel error={error ?? features.error!} />
        )}
        <Paper className={classes.intro}>
          <Typography variant="h5">Your workspace, your choice</Typography>
          <Typography paragraph>
            Choose your modules, then save. Your choices apply to everyone in
            this workspace. Operations, catalog, docs and settings stay
            available.
          </Typography>
          <Typography paragraph>
            Turning a module off keeps its saved records. Waiting email is
            cancelled and connection tests stop; a request already sent may
            finish.
          </Typography>
          <Typography paragraph>
            Enabled modules use your existing configuration. Notification rules
            and history recording can resume. Set up new connections separately.
          </Typography>
          <Link to="/docs/default/component/ops-compass/guides/features">
            Feature settings guide
          </Link>
        </Paper>
        {notice && (
          <Typography role="status" paragraph>
            {notice}
          </Typography>
        )}
        {features.data && !features.data.canWrite && (
          <Typography paragraph>
            Only a configured workspace owner can change these settings.
          </Typography>
        )}
        {form && (
          <>
            <div className={classes.row}>
              <Button
                disabled={disabled}
                variant="outlined"
                onClick={() => edit({ ...form, enabled: featurePreset(false) })}
              >
                Minimal
              </Button>
              <Button
                disabled={disabled}
                variant="outlined"
                onClick={() => edit({ ...form, enabled: featurePreset(true) })}
              >
                Enable all
              </Button>
              <Button
                disabled={disabled}
                color="primary"
                variant="contained"
                onClick={save}
              >
                Save feature choices
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setNotice('');
                  setError(undefined);
                  try {
                    const saved = await features.refresh();
                    if (saved) setForm(saved);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reload saved choices
              </Button>
              <Typography>
                {Object.values(form.enabled).filter(Boolean).length} of{' '}
                {featureDefinitions.length} optional modules selected
              </Typography>
            </div>
            {changed && (
              <Typography paragraph color="textSecondary">
                Unsaved choices. Select Save feature choices to apply them.
              </Typography>
            )}
            {features.data && features.data.version !== form.version && (
              <Typography role="alert" paragraph>
                Settings changed elsewhere. Reload saved choices before saving.
              </Typography>
            )}
            <Grid container spacing={3}>
              {featureDefinitions.map(feature => (
                <Grid item xs={12} md={6} lg={4} key={feature.id}>
                  <Paper className={classes.card}>
                    <FormControlLabel
                      label={feature.title}
                      control={
                        <Switch
                          inputProps={{ role: 'switch' }}
                          color="primary"
                          checked={form.enabled[feature.id]}
                          disabled={disabled}
                          onChange={(_event, checked) =>
                            edit({
                              ...form,
                              enabled: {
                                ...form.enabled,
                                [feature.id]: checked,
                              },
                            })
                          }
                        />
                      }
                    />
                    <Typography>{feature.description}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Content>
    </Page>
  );
}
