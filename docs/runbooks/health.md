# Health and stale evidence

## Trigger

A warning/critical check, unknown result, source error, or unexpected gap in collection.

## Triage

1. Check whether the page is showing demo, an SSH snapshot, or CloudWatch.
2. Read the observation timestamp and freshness. If stale or future-dated, verify
   collection and host time before interpreting the old state.
3. Open the catalog entity and identify the actual service/environment.
4. For disk pressure, inspect usage read-only, identify the growth source, and check
   retention policies. Do not delete databases, images, or logs without a recovery plan.
5. For containers, identify the specific stopped/unhealthy service and inspect only
   relevant health output. Aggregate counts do not establish endpoint availability.
6. For a CloudWatch alarm, inspect metric, threshold, period, evaluation windows,
   missing-data treatment, and recent deploys in AWS.
7. Apply the service's recovery procedure only after identifying the target and rollback.
8. Recollect or reread, verify the service endpoint, and record the outcome.

## Recovery evidence

A current healthy check plus the relevant application-level verification. For
notifications, separately verify the recovery email. Record timestamps, source,
the code/image revision when known, action taken, and remaining uncertainty.

## Source unavailable

Check local snapshot path and JSON format or AWS credentials/region/access. The API
returns a generic 503 and the dashboard clears old cards. Never copy credentials or
raw provider exceptions into a public issue.
