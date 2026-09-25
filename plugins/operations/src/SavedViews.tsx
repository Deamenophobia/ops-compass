import { useEffect, useState } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { Button, MenuItem, TextField, Typography } from '@material-ui/core';

type View = { name: string; query: string; status: string };
const statuses = [
  'all',
  'attention',
  'healthy',
  'warning',
  'critical',
  'unknown',
];
export function SavedViews(props: {
  query: string;
  status: string;
  scope: string;
  apply: (query: string, status: string) => void;
}) {
  const identity = useApi(identityApiRef);
  const [key, setKey] = useState('');
  const [views, setViews] = useState<View[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void identity
      .getBackstageIdentity()
      .then(user => {
        const storageKey = `ops-compass:views:${user.userEntityRef}:${props.scope}`;
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
        const valid = Array.isArray(stored)
          ? stored
              .filter(
                v =>
                  typeof v.name === 'string' &&
                  v.name.length <= 60 &&
                  typeof v.query === 'string' &&
                  v.query.length <= 200 &&
                  statuses.includes(v.status),
              )
              .slice(0, 10)
          : [];
        if (active) {
          setKey(storageKey);
          setViews(valid);
          setSelected('');
        }
      })
      .catch(() => {
        if (active) setMessage('Saved views are unavailable in this browser.');
      });
    return () => {
      active = false;
    };
  }, [identity, props.scope]);
  function save(next: View[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setViews(next);
      setMessage('Saved in this browser for your account.');
    } catch {
      setMessage('Could not save this view. Check browser storage.');
    }
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <TextField
        id="ops-saved-view"
        select
        label="Saved view"
        value={selected}
        style={{ minWidth: 160 }}
        onChange={e => {
          const view = views.find(v => v.name === e.target.value);
          setSelected(e.target.value);
          if (view) props.apply(view.query, view.status);
        }}
      >
        <MenuItem value="">Choose a saved view</MenuItem>
        {views.map(v => (
          <MenuItem key={v.name} value={v.name}>
            {v.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        id="ops-view-name"
        label="View name"
        value={name}
        inputProps={{ maxLength: 60 }}
        onChange={e => setName(e.target.value)}
      />
      <Button
        disabled={
          !key ||
          !name.trim() ||
          (views.length >= 10 && !views.some(v => v.name === name.trim()))
        }
        onClick={() => {
          const label = name.trim();
          save([
            ...views.filter(v => v.name !== label),
            {
              name: label,
              query: props.query.slice(0, 200),
              status: props.status,
            },
          ]);
          setSelected(label);
        }}
      >
        Save current view
      </Button>
      <Button
        disabled={!key || !selected}
        onClick={() => {
          save(views.filter(v => v.name !== selected));
          setSelected('');
        }}
      >
        Delete saved view
      </Button>
      {message && (
        <Typography variant="caption" role="status">
          {message}
        </Typography>
      )}
    </div>
  );
}
