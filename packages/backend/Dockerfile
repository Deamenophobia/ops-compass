# Build the locked application first with Node 22. See production-setup.md.
FROM node:22-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libsqlite3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY .yarn/releases .yarn/releases
COPY .yarnrc.yml backstage.json yarn.lock package.json ./
COPY packages/backend/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz && node .yarn/releases/yarn-4.13.0.cjs workspaces focus --all --production

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements-docs.txt /tmp/requirements-docs.txt
RUN python3 -m venv /opt/techdocs && /opt/techdocs/bin/pip install --no-cache-dir -r /tmp/requirements-docs.txt
ENV PATH="/opt/techdocs/bin:${PATH}" NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app /app
COPY --chown=node:node packages/backend/dist/bundle.tar.gz ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz && mkdir /data && chown node:node /data
# Explicit filenames prevent accidentally baking private overlays or demo config.
COPY --chown=node:node app-config.yaml app-config.production.yaml catalog-info.yaml mkdocs.yml ./
COPY --chown=node:node catalog ./catalog
COPY --chown=node:node docs ./docs
USER node
EXPOSE 7007
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
