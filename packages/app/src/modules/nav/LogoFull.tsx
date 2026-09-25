import { LogoIcon } from './LogoIcon';

export const LogoFull = () => (
  <span
    style={{
      color: '#594273',
      fontWeight: 700,
      fontSize: 18,
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <LogoIcon />
    <span>
      Ops Compass
      <small
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 500,
          color: '#7b6b87',
          marginTop: 3,
        }}
      >
        a little home for your services
      </small>
    </span>
  </span>
);
