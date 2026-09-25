# Sandbox deployment and rollback

The sample is a tiny HTTP service with no trading, VPN or database access. The runner
manages only a container named `ops-compass-sandbox`, carrying its ownership label,
bound to `127.0.0.1:18887`, limited to 64 MiB, 0.25 CPU and 32 processes. It runs with
a read-only filesystem, a non-root user and no Linux capabilities.

## Release contract

Build `sandbox/Dockerfile` with `REVISION` set to the full source commit. Use an
immutable local Docker image ID or an ECR repository digest. The runner inspects
image labels before replacing anything. It refuses mutable tags or an existing
container that lacks its ownership label. It verifies both Docker image identity
and the revision returned by `/health`.

On the selected Linux host:

```sh
python3 scripts/sandbox-release.py deploy --image sha256:YOUR_64_HEX_IMAGE_ID --revision YOUR_40_HEX_COMMIT
python3 scripts/sandbox-release.py status
python3 scripts/sandbox-release.py rollback
python3 scripts/sandbox-release.py remove
```

The runner keeps a private journal in `/var/tmp/ops-compass-sandbox`, locks concurrent
releases and retains the prior verified release for rollback. It records pending
intent before deployment; after an interrupted run, inspect status and Docker before
retrying. A failed deployment attempts to restore the prior release. First deployment
has no rollback target. Removal affects only the labeled sample, not images or other
containers. Keep both image digests available until the exercise is complete.

## AWS ECR and Systems Manager

`infra/sandbox` defines an immutable-tag ECR repository, fixed SSM release document,
separate observation/deployment/pull policies, and an optional GitLab OIDC role. It
does not create an EC2 instance, alter networking or attach policies to existing
roles. The selected Linux host must already have Docker, Python, AWS CLI and SSM
Agent configured. Give its instance role the repository pull policy and required
SSM connectivity; tag that one target `OpsCompassSandbox=true`.

Supply `account_id`, `region` and `instance_id` in a private variable file. Terraform's
provider refuses a different account. Before applying, review the actual target,
the complete plan and costs: ECR storage, image transfer/scanning configuration and
the selected host's existing compute/storage are relevant. No cost amount is assumed.

```sh
terraform -chdir=infra/sandbox init
terraform -chdir=infra/sandbox validate
terraform -chdir=infra/sandbox plan -var-file=/PRIVATE/sandbox.tfvars -out=/PRIVATE/sandbox.plan
# Apply only the reviewed plan in the intended account.
terraform -chdir=infra/sandbox apply /PRIVATE/sandbox.plan
```

Push the image to the resulting ECR repository, resolve its digest, then copy
`examples/aws-release.json` to a private file with the exact target and reviewed SSM
document version. Dispatch through the fixed document:

```sh
python scripts/aws-release.py deploy --config private/aws-release.local.json --digest YOUR_64_HEX_DIGEST --revision YOUR_40_HEX_COMMIT --output private/release-NEW.local.json
```

Use `rollback` with the same target configuration to select the prior verified
release. The command ID is the recovery handle if SSM times out; do not blindly
dispatch again. The controller checks account and target tag before sending one
command, then waits for its final status. The portal exposes no arbitrary command
endpoint. See [SSM setup and IAM](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command-setting-up.html).

The saved record separates requested parameters from the actual host response.
Rollback reports the previously verified revision, not the deploy arguments. A
successful SSM exit without readable release evidence is reported as unverified.
Use one operating identity per target: the state directory is owner-checked, so a
root SSM run cannot reuse an SSH user's journal. Preserve its history and remove the
isolated sample before deliberately changing transport or operating identity.

## GitLab CI preparation

`ci/gitlab-ci.example.yml` is an inactive example. It verifies the application and
offers a manual image publication job on a selected sandbox runner. It does not
automatically deploy. Configure `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_DEFAULT_REGION`,
`AWS_ACCOUNT_ID` and the runner before including it in an active pipeline.
The optional Terraform role trusts only the exact GitLab project and `main` branch,
with the STS audience. Keep the branch/environment protected. OIDC supplies temporary
credentials; do not store permanent AWS access keys in the repository.
See [GitLab OIDC](https://docs.gitlab.com/ci/cloud_services/).

## Verification boundaries

The live exercise uses SSH transport to an existing host and local immutable image
IDs. ECR and SSM use the same runner but require separate live AWS API verification.
Terraform syntax/provider validation and client tests do not prove an AWS apply,
registry push, IAM decision or CI run succeeded. Consult the current worklog for the
recorded results. No existing bot or VPN is a deployment target for this sample.
