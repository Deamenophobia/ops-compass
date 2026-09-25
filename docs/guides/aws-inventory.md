# AWS inventory and your services

Start with **Connections** to generate configuration for your own account. See
[Connection setup](connections.md). Existing development infrastructure is reference
material only; no author-owned account or server is connected by default.

Open **AWS inventory** to read collected EC2 identity, region, instance type,
lifecycle and mapped service IDs. Follow **Inspect service containers** to compare
runtime health and revision evidence. A running EC2 instance does not establish
application health. The portal reads a snapshot; refreshing does not launch SSH.

## Choose a collection source

**AWS API** uses the AWS CLI's configured credentials and an explicit account and
region list. Copy `examples/aws-inventory.json` into `private/`, replace the example
account/profile/mappings, then run from the repository root:

```sh
python scripts/collect-aws.py --mode api --config private/aws-inventory.local.json --output private/inventory.local.json
```

The collector checks STS identity before calling EC2 DescribeInstances. Region
failures remain visible and do not reuse old results. It collects only selected
fields, not instance user data, credentials, security groups or arbitrary tags.
See [AWS CLI credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

**Instance metadata over SSH** uses the existing explicit host inventory:

```sh
python scripts/collect-aws.py --mode metadata --config private/hosts.local.json --output private/inventory.local.json
python scripts/collect-ssh.py --config private/hosts.local.json --output private/observations.local.json
```

Metadata mode uses IMDSv2 and reads only instance ID, account, region and instance
type. It does not request IAM role credentials. Lifecycle and detailed monitoring
remain Unknown. Coverage describes configured hosts, not an account-wide scan.
See [instance identity](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html).

Add explicitly named Docker containers under each host's `services` list as described
in [Workspace setup](workspace-setup.md). Image IDs and OCI revision labels are
collected when available; absent revision labels remain absent. Never infer a Git
commit from a Docker image name. CloudWatch alarms use the separate
[configured alarm reader](cloudwatch.md); metadata access does not prove alarm access.

## Connect the private snapshot

In an ignored local overlay, configure paths relative to the backend working
directory, or use absolute private paths:

```yaml
opsCompass:
  inventory:
    file: /private/inventory.local.json
    maxAgeSeconds: 300
```

Real snapshots retain collector timestamps and become Stale after the configured
expiry. Future timestamps are labeled Future. A missing or invalid file clears the
page and reports an error. Demo has a separate synthetic inventory and cannot load
a real snapshot; real mode rejects demo inventory.

## Verified local connection

The development exercise collected identities from two existing AWS hosts and
runtime evidence for one service with four containers. Those identities, names,
host mappings and raw snapshots remain private. This verifies SSH/IMDS/container
collection; AWS CLI account inventory and CloudWatch API access are separate live
checks requiring usable AWS credentials. The public demonstration uses synthetic data.
