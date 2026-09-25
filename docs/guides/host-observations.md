# Host observations

The **Connections** page can generate this configuration for your own hosts. See
the [connection manual](connections.md). Collectors run only when you invoke them.

The Python collector invokes an existing SSH alias in batch mode with host-key
verification. It sends a fixed read-only Python script to the host and retrieves
only root disk usage, container state counts, and a timestamp. It neither installs
an agent nor reads secrets, environment variables, application logs, or image names.

1. Copy `examples/hosts.example.json` to ignored `private/hosts.local.json`.
2. Set the SSH aliases, non-sensitive display labels, catalog entity references,
   region, and minimum running-container counts for your actual hosts.
3. Ensure those aliases already work and their SSH host keys are trusted.
4. Run a collection:

```sh
python scripts/collect-ssh.py --config private/hosts.local.json --output private/observations.local.json
```

5. Add an ignored `app-config.local.yaml` (use an absolute path for the snapshot):

```yaml
opsCompass:
  mode: snapshot
  maxAgeSeconds: 300
  snapshotFile: C:/dev/projects/ops-compass/private/observations.local.json
```

6. Restart Backstage. The Operations page should say **Collected host observations**.

Register a matching catalog entity for each real host in an ignored private catalog
file and add it to the local `catalog.locations` list. Local arrays replace the base
array, so retain both base locations when extending it. Public example resources do
not imply real deployment and should not be used to identify production hosts.

Disk warning/critical thresholds are 80/90 percent. Container checks count all
containers, including stopped ones; use the results as a coarse check for dedicated
hosts. A running container with no passing health check remains unknown. Minimum
counts cannot detect replacement of one service with another: per-service identity
checks are future work. PM2, VPN, and systemd-specific collectors are also pending.

The collector writes atomically. SSH failures produce unknown observations without
copying stderr. The page re-evaluates age every refresh but does not schedule collection.
Run collection again when needed; monitoring and scheduling are separate work.
