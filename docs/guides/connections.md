# Connect your own infrastructure

Enable **Cloud connections** in **Workspace features** before opening this page.
Optional modules start off in a new main workspace; choose only what you need.

Open **Connections** in the sidebar. Both branches start with a blank connection
form. The demo uses synthetic evidence; signing into a cloud console does not
connect that account to this portal.

## Saved profiles

Prepare a setup with the form below the saved profiles, then enter a connection
name and environment and choose **Save new connection**. The workspace stores
up to 25 profiles in its private journal. Profiles hold targets and credential
references; they never accept credential values or arbitrary commands. Names are
unique within the workspace. **Edit profile** loads its details into the form;
prepare any changed targets and choose **Update saved connection**. A concurrent
edit produces a conflict instead of overwriting another user's changes.

Use **Disable profile** to prevent further tests and cancel an active test. Enabling,
editing or disabling clears prior verification. Disabling a saved profile does not
stop separately configured collectors, change an installed portal overlay or alter
a cloud resource. Saved profiles and imported observation sources are separate.
Filter the list by name or environment. Saved records survive reload and backend
restart; the unsaved form is cleared by reload. Only configured workspace owners
can save, edit, enable, disable or test. Agent credentials cannot perform these actions.

## Test a saved connection

Choose **Test connection** on a saved, enabled profile. Tests always use that saved
revision. AWS checks the expected account and permission to describe instances in
each region. SSH checks authentication, Python 3 and optionally Docker listing access.
Neither test collects inventory, establishes service health, deploys or installs
anything. A passing identity check alone does not prove regional permissions.

Progress and individual target results are retained with timestamps and actor identity.
Failures replace the previous result. Editing during a test cancels it and discards
its late result. A restart marks unfinished tests Interrupted without replaying them.
A passing result expires in the UI after five minutes; future timestamps are unverified.
No old success is retained on a failed list refresh. Raw CLI errors and process output
are reduced to fixed diagnostic messages before storage or display.

Demo always simulates tests, even if live testing configuration is present. Choose
Successful access, Access denied or Target unreachable to explore the flow. Every
result is labeled simulated and no AWS/SSH subprocess runs. Main disables tests by
default until an administrator configures approved targets.

## Enable live tests

The backend operator copies `examples/connection-testing.yaml` into an ignored local
overlay, replaces every example and deliberately sets `enabled: true`. Approve the
exact AWS profile, expected account and permitted regions, or exact SSH aliases.
The entire target set is checked before any subprocess, including STS. A profile
may be saved without this approval; its test will be blocked. An empty AWS profile
name refers to the backend's default credential chain and must also be explicitly
approved in the backend overlay.

Install **AWS CLI v2** and/or **OpenSSH** on the backend PATH for the selected probe.
The standard portal container does not guarantee these optional clients are present;
provide them in your deployment image before enabling tests. Configure backend client
authentication, trusted SSH host keys and least-privilege access outside the portal.
The collector machine's authentication and the backend's authentication may differ.
Browser-console sessions are never used. Restart with the explicit approved overlay.
No live testing overlay is committed or enabled by this project.

AWS uses [GetCallerIdentity](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html)
then [DescribeInstances dry-run](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instances.html).
The authorized dry-run response is an error named `DryRunOperation`, not an ordinary
success exit code. SSH uses fixed arguments, batch mode and strict host-key checking;
it disables forwarding and local commands. Users cannot supply executables, endpoints,
SSH options or remote programs. Existing administrator-owned SSH proxy/identity
configuration remains trusted client configuration.

Tests run asynchronously: at most two workspace tests at once, eight seconds per
subprocess and sixty seconds per test, with ten seconds between tests of an unchanged
profile. The application is a single-backend deployment; multi-instance job ownership
is not implemented. Testing does not activate scheduling. To collect observations,
install the generated configuration and run the existing collectors separately.

## Choose a source

| Source | What it collects | What you supply |
| --- | --- | --- |
| AWS account inventory | EC2 identity and lifecycle in selected regions | Expected account, regions, an existing CLI profile or workload identity |
| Linux servers over SSH | Root disk usage and optional Docker state counts | Existing SSH aliases, labels and catalog references for up to 20 hosts |
| CloudWatch alarms | States of explicitly named metric alarms | Follow the separate [alarm setup](cloudwatch.md) |

SSH works with suitable Linux VMs on other cloud providers. Native Azure and Google
Cloud account discovery are not implemented. The form never asks for private keys,
passwords or access keys. Configure authentication on the machine running the
collector. AWS supports [named profiles, SSO and role configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).
Inventory needs `ec2:DescribeInstances`; the collector first checks the account
using STS. It cannot create IAM grants or deploy workloads.

## Prepare and install

1. Choose a source and enter your own details. AWS accepts up to 20 explicit regions.
   For SSH, use **Add server** for each host. IDs must be unique; aliases must already
   work with batch authentication and a verified host key. Each host needs Python 3.
2. Enter the absolute snapshot directory **as seen by the backend**. Locally this
   can be the `private` directory in your checkout. With containers or separate
   machines, arrange a private copy or mount so the backend can read the files.
3. Choose **Prepare setup** and review both files. This validates the configuration;
   it does not test network access. Unsaved fields stay in page memory; reload clears
   them. Save a profile explicitly to retain it. Editing a field invalidates the prepared files. Downloads are private files
   that you control; move them out of the browser downloads directory after review.
4. Save the collector file in `private/`, and save
   `app-config.connections.local.yaml` at the repository root. These paths are ignored
   by Git. The portal overlay uses JSON syntax, which is valid YAML.
5. Run the displayed collector command from the repository root on your collector
   machine. Authenticate there first. AWS CLI is needed for AWS mode; SSH is needed
   for host mode. No command runs from the browser. Copy the resulting snapshot
   into the directory entered in the form if the collector and backend differ.
6. Use `main` for real connections. Start explicitly with the generated overlay:

```sh
node .yarn/releases/yarn-4.13.0.cjs start --config app-config.yaml --config app-config.connections.local.yaml
```

On Windows, the local and preview launchers also accept
`-ConnectionConfig ./app-config.connections.local.yaml`. They do not run collectors.
Without that argument main is unconfigured and demo loads only its synthetic overlay.
The old `-LiveObservations` shortcut has been removed.

The generated overlay configures one observation source. If you already have private
settings, merge deliberately: AWS inventory can coexist with SSH observations, but
`opsCompass.mode` selects the runtime observation provider. The AWS-only export uses
`unconfigured` for runtime health, because inventory alone is not a health signal.
Do not load `app-config.demo.yaml` together with real snapshots.

## Verify and maintain

For AWS, inspect **AWS inventory**: source must be `aws-api`, collection time must
be recent, and coverage must be checked for every selected region. A completed
collection can still have unavailable regions. For SSH, inspect **Operations**:
source must be `ssh`; missing data remains Unknown. A successful export, an SSH
connection or EC2's Running state does not establish application health.

Collection is manual unless you separately configure a scheduler. Refreshing the
portal reads saved evidence and does not run SSH. Evidence expires after five
minutes by default. To disconnect, stop your external collection schedule and
restart without the connection overlay; private history and files remain until
you choose to remove them. To change targets, prepare and review new files.

Use [AWS inventory](aws-inventory.md) for instance metadata and service mappings,
[host observations](host-observations.md) for disk/Docker details and
[Workspace setup](workspace-setup.md) for named containers, pipelines and alerts.
Register matching catalog entities separately; generating a connection does not
invent or import a service catalog.

## Development boundary

Existing infrastructure informed the design; it is not bundled as an active
connection. Development and gallery checks use synthetic targets without making
cloud or SSH requests. Browser login sessions are not application credentials.
Live access depends on each installing user's authentication and configuration.

Run `node scripts/test-connections.mjs` to verify main's browser workflow using a
fresh private journal and disabled live testing. On demo add `--demo` to exercise
simulated pass/failure. On demo, `--demo --capture` also refreshes the connection
gallery with explicitly synthetic profiles before running the browser checks.
The helper uses an isolated loopback port, strips provider
environment variables and stops its own backend. Existing journals and profiles are
not used. See the worklog for the current verification results.
