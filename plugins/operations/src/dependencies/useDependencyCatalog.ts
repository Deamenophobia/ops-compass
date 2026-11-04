import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { canonicalRef, relatedRefs, relationLimit } from './model';

export function useDependencyCatalog(
  query: string,
  selected: string,
  revision: number,
) {
  const catalog = useApi(catalogApiRef);
  const [search, setSearch] = useState<{
    query: string;
    items: Entity[];
    total: number;
    error?: string;
  }>();
  const [detail, setDetail] = useState<{
    ref: string;
    entity?: Entity;
    entities?: Map<string, Entity>;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      catalog
        .queryEntities({
          filter: { kind: ['Component', 'Resource'] },
          limit: 200,
          fields: [
            'kind',
            'metadata.name',
            'metadata.namespace',
            'metadata.title',
            'spec.type',
          ],
          orderFields: [{ field: 'metadata.name', order: 'asc' }],
          ...(query.trim() ? { fullTextFilter: { term: query.trim() } } : {}),
        })
        .then(result => {
          if (active)
            setSearch({ query, items: result.items, total: result.totalItems });
        })
        .catch(() => {
          if (active)
            setSearch({
              query,
              items: [],
              total: 0,
              error:
                'Catalog search unavailable. Check your sign-in and catalog access, then retry.',
            });
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalog, query, revision]);
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    if (!selected) return undefined;
    const load = async () => {
      try {
        const entity = await catalog.getEntityByRef(selected);
        if (!entity) throw new Error('Missing entity');
        const relations = relatedRefs(entity);
        const refs = [
          ...new Set([
            ...relations.dependencies.slice(0, relationLimit),
            ...relations.dependents.slice(0, relationLimit),
          ]),
        ];
        const { items } = refs.length
          ? await catalog.getEntitiesByRefs({
              entityRefs: refs,
              fields: [
                'kind',
                'metadata.name',
                'metadata.namespace',
                'metadata.title',
                'spec.type',
              ],
            })
          : { items: [] };
        const entities = new Map<string, Entity>();
        items.forEach(item => {
          if (!item) return;
          const ref = canonicalRef(
            `${item.kind}:${item.metadata.namespace ?? 'default'}/${
              item.metadata.name
            }`,
          );
          if (ref) entities.set(ref, item);
        });
        if (active) setDetail({ ref: selected, entity, entities });
      } catch {
        if (active)
          setDetail({
            ref: selected,
            error:
              'Dependency details unavailable. The entity may be missing or inaccessible. Retry or check the catalog.',
          });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [catalog, selected, revision]);
  return {
    search: search?.query === query ? search : undefined,
    detail: detail?.ref === selected ? detail : undefined,
  };
}
