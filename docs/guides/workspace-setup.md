# Connect the operations workspace

Keep real configuration in ignored `*.local.yaml` and `private/` files. Use the
normal AWS SDK credential chain; never paste access keys into the frontend.

## Named Docker services

Add this `services` fragment inside a host target from the [host guide](host-observations.md):

```json
{
  "services": [
    {
      "id": "my-worker",
      "name": "My worker",
      "entityRef": "component:default/my-worker",
      "containers": ["my-worker"],
      "heartbeatFile": "/run/my-worker/heartbeat.json",
      "heartbeatMaxAgeSeconds": 120,
      "certificateHostname": "your-service.example.com"
    }
  ]
}
```

Omit heartbeat/certificate fields when not applicable. IDs must be unique and at
most 40 lowercase letters, digits or hyphens. Container names are explicit, never
commands or patterns. The optional service collector performs an additional fixed
SSH inspection per configured host. It omits secrets, logs and process arguments.

Have the workload write a dedicated JSON heartbeat containing `observedAt`, a current
ISO timestamp with a timezone. Certificate checks use normal TLS trust validation
on port 443; failed checks remain unknown. Add `org.opencontainers.image.revision`
to image labels during your own build to enable pipeline comparison.

## Integration overlay

Copy only needed sections from
[the configuration template](https://github.com/Deamenophobia/ops-compass/blob/main/examples/workspace-integrations.yaml)
to an ignored overlay and pass it as another `--config` argument. Normal main/demo
startup requires no external integration credentials.

### GitLab pipelines

Configure `opsCompass.gitlab.baseUrl`, `token` and a list of `projects`, mapping each
`serviceId` to a `projectId` (numeric string or namespace/path) and `ref`. Use a
narrowly scoped read API token. The adapter reads the latest pipeline for the ref,
uses HTTPS/timeouts, rejects redirects and redacts failures. It never starts a
pipeline. At most 20 projects are allowed; reads are sequential, so start small.

Reference: [GitLab Pipelines API](https://docs.gitlab.com/api/pipelines/).

### AWS Budgets

Configure `opsCompass.costs.accountId` and `budgetName` for an existing monthly COST
budget. The principal needs `budgets:ViewBudget` for the target. The SDK calls
`DescribeBudget` through the US East endpoint using standard credentials. No budget
is created or modified. Missing spend stays unknown.

Reference: [DescribeBudget](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_budgets_DescribeBudget.html).

### Email providers

Recipients and senders start blank and are saved privately by the owner in Notifications.

- **Resend:** set `OPS_COMPASS_RESEND_API_KEY` on the backend and map it to
  `opsCompass.notifications.resendApiKey`. Use a verified sender. This follows the
  inspected personal application's HTTPS email approach without its sender,
  recipient or secret. Messages use plain text and request idempotency keys.
- **SNS:** configure `snsTopicArn` and `snsRegion` for an existing dedicated topic.
  Grant appropriate `sns:Publish` and `sns:ListSubscriptionsByTopic` access. Create
  and confirm subscriptions in AWS. Publishing reaches all subscribers; the portal
  does not create subscriptions or change CloudWatch alarms.

Choose one owning route per symptom. Leave automatic portal notifications disabled
when CloudWatch or an existing Alertmanager route already owns the same alerts.
No live message was sent during this increment. Configure your provider and follow
the [test/receipt steps](user-manual.md#email-monitoring).

References: [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email),
[SNS Publish](https://docs.aws.amazon.com/sns/latest/api/API_Publish.html).

## Persistence and owners

Local main uses `private/operations.sqlite`; demo uses `private/operations-demo.sqlite`.
Other Backstage development plugins remain in memory. Protect these files: they
contain private notes and recipients. Back up with the portal stopped or use SQLite's
backup facilities. Changing branches does not delete private files.

`opsCompass.writers` explicitly lists allowed user entity refs. Replace the local
guest default when configuring production authentication. Service credentials,
including the MCP token, cannot write. Polling defaults to 60 seconds (`pollSeconds`,
allowed range 30–3600). It reads source data but does not execute SSH.

Run one backend instance against this local journal. Versioned migrations run before
the collector and delivery worker. Back up before upgrades and follow the
[storage and delivery recovery guide](storage-and-delivery.md). Multi-instance
deployment still requires shared collector locking and separate verification.
