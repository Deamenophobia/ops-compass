import { ReactNode } from 'react';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { operationsRoutes } from './routes';

/** Follow app-level route overrides; omit links when the target is not installed. */
export function OperationsLink({
  route,
  children,
}: {
  route: keyof typeof operationsRoutes;
  children: ReactNode;
}) {
  const path = useRouteRef(operationsRoutes[route]);
  return path ? <Link to={path()}>{children}</Link> : null;
}
