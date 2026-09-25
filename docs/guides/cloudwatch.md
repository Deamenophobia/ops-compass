# AWS CloudWatch observations

This adapter performs `DescribeAlarms` against 1–100 explicitly configured metric
alarms in one region. It does not create alarms, query EC2 inventory, send mail,
deploy software, or confirm Systems Manager readiness.

Copy the configuration from `examples/cloudwatch.yaml` into ignored local config.
Use the standard AWS SDK credential chain (for example a local AWS profile, or an
instance role in a later deployment). Never put access keys in app configuration.
Set `AWS_PROFILE` in the backend environment when using a named profile.

The principal needs `cloudwatch:DescribeAlarms` for the configured metric alarms.
Design and test the IAM policy with the actual account and alarm ARNs. Composite
alarms are deliberately excluded from this version.

## Correctness rules

- `OK` maps to healthy for that alarm; `ALARM` maps to critical.
- `INSUFFICIENT_DATA` and alarms absent from the response map to unknown.
- A failed or incomplete query returns a source-unavailable response, never green.
- Observation time is the successful query time. A state-change timestamp from last
  month does not make a freshly queried, unchanged alarm stale.
- The original state-change timestamp is displayed separately.
- Raw alarm reasons and account identifiers are not forwarded to the browser.
- Each request has a ten-second deadline and at most two SDK attempts. The dashboard
  refreshes every thirty seconds; evaluate call volume before broad deployment.

## Verification before live use

Confirm the CLI/profile identity privately, verify the requested region and alarm
names, read the alarms, and compare their states to the AWS console. Then disconnect
credentials or select a missing alarm and confirm that the portal does not report
healthy. Unit tests use injected SDK responses; they are not proof of live AWS access.

References: [DescribeAlarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_DescribeAlarms.html),
[AWS SDK credential providers](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
