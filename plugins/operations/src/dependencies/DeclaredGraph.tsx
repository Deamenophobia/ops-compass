import { memo } from 'react';
import { useMediaQuery, useTheme } from '@material-ui/core';
import {
  Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import {
  EntityRelationsGraph,
  Direction,
} from '@backstage/plugin-catalog-graph';
import { relatedRefs, relationLimit } from './model';

// Health ticks must not repeatedly reload or relayout the catalog graph.
export const DeclaredGraph = memo(function DependencyGraph({
  entity,
  revision,
  className,
}: {
  entity: Entity;
  revision: number;
  className: string;
}) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('xs'));
  const root = stringifyEntityRef(entity);
  const relations = relatedRefs(entity);
  const allowed = new Set([
    root,
    ...relations.dependencies.slice(0, relationLimit),
    ...relations.dependents.slice(0, relationLimit),
  ]);
  return (
    <EntityRelationsGraph
      key={`${root}:${revision}`}
      rootEntityNames={parseEntityRef(root)}
      maxDepth={1}
      unidirectional={false}
      relations={['dependsOn', 'dependencyOf']}
      relationPairs={[['dependsOn', 'dependencyOf']]}
      kinds={['component', 'resource']}
      entityFilter={item => allowed.has(stringifyEntityRef(item))}
      direction={narrow ? Direction.TOP_BOTTOM : Direction.LEFT_RIGHT}
      mergeRelations
      showArrowHeads
      zoom="enable-on-click"
      className={className}
    />
  );
});
