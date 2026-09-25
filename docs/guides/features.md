# Choose workspace features

Open **Workspace features** in the sidebar. Select only the optional modules you
need and choose **Save feature choices**. **Minimal** clears the optional choices;
**Enable all** selects them. Neither preset takes effect until you save.
An **Unsaved choices** message appears while your selections differ from the
saved settings. **Reload saved choices** discards those selections and restores
the workspace's current settings.

The operations overview, catalog, documentation, sign-in and settings remain
available. A new **main** journal starts with all optional modules off. A fresh
**demo** journal starts with them on so the illustrated examples are accessible.
Both branches use the same controls. Existing source/provider settings are not
changed by these choices.

## What each switch controls

| Module | Enabled behavior | When disabled |
| --- | --- | --- |
| Services and pipelines | Container details and GitLab comparisons | Hides the tab; stops optional pipeline reads and container/pipeline history recording |
| AWS inventory | Reads the user's collected inventory file | Hides navigation and blocks inventory API reads |
| Cloud connections | Drafts, saved profiles and explicit access tests | Hides navigation, blocks profile APIs and interrupts active tests |
| Activity history | Timeline and observed-change recording | Hides the timeline; recording continues only if worklogs or notifications need it |
| Worklogs | Evidence-based Markdown drafts and saved reports | Blocks report actions and hides the tab; reports remain stored |
| Email notifications | Configured tests, queue processing and transition rules | Blocks actions, drains issued requests, cancels waiting deliveries and stops new transitions |
| Cost tracking | AWS Budget reads and local planning preference | Hides the tab and skips budget reads |
| Maintenance notes | Service notes and backup reminders | Hides the tab and blocks note/backup actions; records remain stored |
| AI agent interface | Agent page, HTTP context and read-only MCP actions | Hides navigation and rejects every agent HTTP/MCP action before reading evidence |

These are workspace settings, not per-user preferences. Only configured
`opsCompass.writers` can save them; agent credentials and other signed-in readers
cannot. Choices persist in the private journal and survive restart. Simultaneous
edits use revision checks: if another owner changed the choices, use **Reload saved
choices**, review, then save again.

Sidebar items and workspace tabs follow the choices. Opening an old direct link
shows a disabled-feature message; calling its API directly is also rejected.
Other open tabs refresh their choices within five seconds or on window focus.
If settings cannot be read, optional screens stop rendering until access recovers.

## Data, credentials and background work

Disabling retains documents, profiles, notification settings and history. It does
not delete cloud resources, stop containers or stop an external collector/scheduler.
Operations is the core observation reader; disabling optional modules does not stop
its configured snapshot or CloudWatch reads when the overview is requested.

Already-issued network requests may finish; they cannot be recalled. Disabling
notifications waits for the local delivery attempt to finish, cancels waiting
messages and leaves interrupted acceptance uncertain. Re-enabling does not resend
cancelled messages. Existing automatic notification rules and future history
recording can resume, so review your retained notification configuration first.
Disabling connections interrupts active tests; re-enabling requires an explicit test.

Enabling a feature grants no credentials and does not configure its provider.
Email routes still start blank; live connection tests still need an administrator's
approved target list. Demo remains synthetic. Collection schedules and external
model calls are not created by a switch.

## Initial configuration

For a new journal, an administrator can override the branch defaults:

```yaml
opsCompass:
  features:
    defaults:
      connections: true
      inventory: true
      agent: false
```

Supported keys are `services`, `inventory`, `connections`, `history`, `worklogs`,
`notifications`, `costs`, `maintenance` and `agent`. Saved choices take precedence
on later starts. This configuration is not a user-permission system; keep writer
identity and provider permissions configured separately. See [private setup](production-setup.md).

## Development verification

Build the app, then run `node scripts/test-connections.mjs --features` on main or
add `--demo` on demo. The helper uses a fresh temporary journal, stripped provider
environment and its own loopback backend; it never loads the user's overlays or
contacts their infrastructure. Demo's additional `--capture` saves reviewed
feature screenshots into the temporary evidence directory for the gallery.
