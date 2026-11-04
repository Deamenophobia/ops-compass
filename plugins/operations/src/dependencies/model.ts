import {
  Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { Overview, State } from '@ops-compass/operations-common';

export const relationLimit = 40;
export function canonicalRef(value: string): string | undefined {
  try {
    const ref = stringifyEntityRef(parseEntityRef(value));
    return /^(component|resource):[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(ref)
      ? ref
      : undefined;
  } catch {
    return undefined;
  }
}
export function catalogPath(ref: string) {
  const { kind, namespace, name } = parseEntityRef(ref);
  return `/catalog/${encodeURIComponent(namespace)}/${encodeURIComponent(
    kind,
  )}/${encodeURIComponent(name)}`;
}
export function relatedRefs(entity: Entity) {
  const root = stringifyEntityRef(entity);
  const read = (type: string) =>
    [
      ...new Set(
        (entity.relations ?? [])
          .filter(relation => relation.type === type)
          .map(relation => canonicalRef(relation.targetRef))
          .filter((ref): ref is string => Boolean(ref) && ref !== root),
      ),
    ].sort();
  return { dependencies: read('dependsOn'), dependents: read('dependencyOf') };
}

/** Keep the entity's own checks separate from the health of its dependencies. */
export function entityEvidence(ref: string, overview?: Overview, elapsed = 0) {
  const observations = (overview?.observations ?? [])
    .filter(item => canonicalRef(item.entityRef) === ref)
    .map(item => {
      // Advance from server evaluation time, not the browser clock; expired or
      // future evidence cannot become healthy between polls.
      const age =
        Date.parse(overview!.evaluatedAt) +
        Math.max(0, elapsed) -
        Date.parse(item.observedAt);
      const current =
        item.freshness === 'current' &&
        Number.isFinite(age) &&
        age >= -60000 &&
        age <= (item.maxAgeSeconds ?? overview!.maxAgeSeconds) * 1000;
      return { ...item, state: current ? item.state : ('unknown' as State) };
    });
  let state: State = 'unknown';
  if (observations.length) {
    state =
      (['critical', 'warning', 'unknown'] as const).find(candidate =>
        observations.some(item => item.state === candidate),
      ) ?? 'healthy';
  }
  return { state, observations };
}
