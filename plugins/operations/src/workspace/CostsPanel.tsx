import { Link } from '@backstage/core-components';
import { Button, Paper, TextField, Typography } from '@material-ui/core';
import { date } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function CostsPanel({ model }: { model: WorkspaceModel }) {
  const {
    classes,
    api,
    tab,
    data,
    amount,
    setAmount,
    currency,
    setCurrency,
    canWrite,
    run,
    budget,
    budgetLimit,
    budgetCurrent,
  } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'costs' && (
        <>
          <Paper className={classes.card}>
            <Typography variant="h5" className={classes.title}>
              Monthly AWS cost awareness
            </Typography>
            {!budget ? (
              <Typography>
                {data.costs.status === 'unavailable'
                  ? 'AWS budget source unavailable. Spending is unknown.'
                  : 'Connect a named monthly AWS cost budget to see actual and forecast spending.'}
              </Typography>
            ) : (
              <>
                <Typography variant="h6">{budget.name}</Typography>
                <Typography>
                  Actual:{' '}
                  {budgetCurrent && budget.actual !== null
                    ? `${budget.actual.toFixed(2)} ${budget.currency}`
                    : 'Unknown'}{' '}
                  · Forecast:{' '}
                  {budgetCurrent && budget.forecast !== null
                    ? `${budget.forecast.toFixed(2)} ${budget.currency}`
                    : 'Unknown'}
                </Typography>
                <Typography>
                  AWS budget limit: {budget.limit.toFixed(2)} {budget.currency}
                </Typography>
                {budgetCurrent && budget.actual !== null && budgetLimit && (
                  <>
                    <div className={classes.bar}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(
                            100,
                            (budget.actual / budgetLimit) * 100,
                          )}%`,
                          background:
                            budget.actual >= budgetLimit
                              ? '#bc5470'
                              : '#9d82ba',
                        }}
                      />
                    </div>
                    <Typography>
                      {Math.round((budget.actual / budgetLimit) * 100)}% of{' '}
                      {data.costs.preference?.currency === budget.currency
                        ? 'local planning'
                        : 'AWS'}{' '}
                      budget used
                      {budget.actual >= budgetLimit ? ' · Budget exceeded' : ''}
                      {budget.forecast !== null &&
                      budget.forecast >= budgetLimit
                        ? ' · Forecast exceeds budget'
                        : ''}
                    </Typography>
                  </>
                )}
                <Typography className={classes.meta}>
                  Retrieved {date(budget.observedAt)} · budget configuration
                  updated {date(budget.updatedAt)}
                </Typography>
              </>
            )}
            <Typography paragraph>
              AWS billing data is delayed. Retrieval time is not the time of the
              underlying usage. Missing amounts remain unknown.
            </Typography>
            <Link to="/docs/default/component/ops-compass/guides/workspace-setup">
              Connect AWS Budgets
            </Link>
          </Paper>
          <Paper className={classes.card}>
            <Typography variant="h6">Your local planning budget</Typography>
            <Typography paragraph>
              This preference does not create or change an AWS budget or an AWS
              notification.
            </Typography>
            <div className={classes.row}>
              <TextField
                id="ops-monthly-budget-amount"
                label="Monthly budget amount"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              <TextField
                id="ops-currency"
                label="Currency"
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                inputProps={{ maxLength: 3 }}
              />
              <Button
                disabled={!canWrite || !amount}
                onClick={() =>
                  run(
                    () =>
                      api('/budget-preference', {
                        amount: Number(amount),
                        currency,
                      }),
                    'Local planning budget saved.',
                  )
                }
              >
                Save planning budget
              </Button>
            </div>
            {budget &&
              data.costs.preference &&
              data.costs.preference.currency !== budget.currency && (
                <Typography>
                  Currency differs from the AWS budget; no conversion or
                  comparison is performed.
                </Typography>
              )}
          </Paper>
        </>
      )}
    </>
  );
}
