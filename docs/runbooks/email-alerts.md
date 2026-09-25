# Email alerts

Status: configurable Resend/SNS adapters and a notification/receipt interface are
implemented. Recipients start blank; sending is disabled until a user configures it.
Live inbox delivery remains unverified. Follow the [user manual](../guides/user-manual.md#email-monitoring)
and [provider setup](../guides/workspace-setup.md#email-providers).

## Existing route and AWS option

The repository assessment found an existing Alertmanager webhook bridge implemented
as a Cloudflare Worker using Resend. Source code exists, but the running configuration,
credentials, firing delivery, and recovery delivery must still be checked.

An AWS-native option is CloudWatch alarm → SNS topic → confirmed email subscription.
AWS alarms and existing Prometheus alerts may coexist. Assign one owning notification
route per symptom so one incident does not generate duplicate emails.

## Delivery checklist

1. Select one sandbox signal, its owner, recipient, severity, and runbook.
2. Verify the actual running monitoring configuration and loaded route.
3. Choose the existing bridge or a CloudWatch/SNS route. Record the decision and cost.
4. For SNS, the recipient must confirm the subscription. For the bridge, verify its
   authentication and provider status without printing secrets.
5. Test a controlled **sandbox** firing condition. Record the observation time,
   routing time, provider acceptance, and actual inbox arrival separately.
6. Restore the signal and verify a recovery email. For CloudWatch, configure both
   ALARM and OK actions. For Alertmanager, confirm `send_resolved` and routing behavior.
7. Check grouping, repeat interval, severity, duplicate suppression, and runbook links.
8. Exercise a delivery failure and verify it is observable. Monitor the monitoring
   path with an independent heartbeat before relying on it for critical outages.

Provider HTTP success means acceptance, not inbox delivery. Do not use production
bot failures, full disks, or VPN outages as demonstration triggers.

## Record format

| Signal | Expected route | Firing observed | Provider accepted | Inbox received | Recovery received | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Selected sandbox check | Pending | Pending | Pending | Pending | Pending | Pending |

References: [SNS email subscriptions](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html),
[CloudWatch alarm notifications](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html).
