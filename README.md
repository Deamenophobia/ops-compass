# Ops Compass

A little home for your services, health checks, runbooks and AI tools. Built with Backstage.

## Start locally

Clone **main** for your own workspace or **demo** for synthetic examples.
You need **Node 22/24** and **Python 3.12**. From the repository folder on Windows:

```powershell
git clone --branch main https://github.com/Deamenophobia/ops-compass.git
cd ops-compass
node .yarn/releases/yarn-4.13.0.cjs install --immutable
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-docs.txt
.\scripts\start-local.ps1
```

Open [localhost:3000](http://localhost:3000) and choose **Enter** for your local workspace.
For Linux/WSL or the built preview on port 7007, see [Local setup](docs/guides/local-setup.md).

## Use it

- **Workspace features:** enable only the modules you need; main starts minimal.
- **Connections:** prepare, save and explicitly test your own AWS or SSH profiles.
- **Operations:** review timestamped checks and follow a runbook.
- **Workspace:** inspect containers, compare pipeline revisions and keep worklogs.
- **Catalog and Docs:** find service relationships and the illustrated handbook.
- **Agent access:** provide read-only evidence to your AI client through MCP or HTTP.

Cloud access and email require your own configuration. Demo observations are synthetic.
This is a preview for local evaluation; read the [release notes and limits](docs/releases/preview.md)
before hosting it. Guest access is for loopback development.

## Related project

For lightweight server status monitoring, see [Small Server OB](https://github.com/Deamenophobia/small-server-ob).
It runs locally and combines SSH, HTTP and TCP health checks, server notes, quick links
and cost estimates in one dashboard. Ops Compass provides the broader service catalog,
ownership, runbooks and operational workflows. The projects run independently;
there is no built-in data synchronization. Small Server OB is currently a private repository
and requires access.

[Demo gallery](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md) · [User manual](docs/guides/user-manual.md) · [Architecture](docs/architecture.md) · [MIT license](LICENSE)
