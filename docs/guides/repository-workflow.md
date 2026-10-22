# Branches and public updates

GitLab remains the maintainer's development home. This GitHub repository contains
reviewed public snapshots with its own history. A public update is an intentional
release, rather than an automatic mirror of every development commit.

| Branch | Intended use | Initial data |
| --- | --- | --- |
| `main` | Configure your own services | Portal and local identity, with optional modules disabled and no sample workloads |
| `demo` | Walkthroughs and screenshots | Explicitly synthetic catalog entries, observations and demo controls |

Application code is shared. Stop the portal before changing branches; ignored
private files can survive a checkout. Local launchers load the demo overlay when
present unless the user explicitly selects a real source. See [Local setup](local-setup.md).

## Following releases

Clone the branch you need and retain your private settings outside version control.
Before updating an existing workspace, preserve its database and configuration,
then read the release notes and [storage guide](storage-and-delivery.md).

The maintainer exports verified tracked files into a separate release checkout,
excluding private worklogs, local runtime files and private Git history. Public
links and release notes are prepared there. Each update adds ordinary commits to
the existing GitHub branches; public history is not force-replaced. Exact commit
links identify reviewed snapshots. Version tags and GitHub release entries are
optional and are created only when explicitly requested.

The maintainer's development checkout keeps its GitLab `origin`. GitHub uses a
different checkout and remote. Feedback on GitHub can be incorporated into private
development and included in a later reviewed release.

## Documentation

The versioned `docs/` folder is the public handbook and the TechDocs input. The
[demo gallery](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md)
contains synthetic scenarios. The private development Wiki and detailed worklogs
are not required to use this release.

No CI workflow is activated by this source release. Integration and deployment
examples require the user's own target selection and configuration.
