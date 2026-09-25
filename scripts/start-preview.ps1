param([string]$ConnectionConfig, [switch]$AgentAccess)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNodeEnvironment = $env:NODE_ENV
Push-Location -LiteralPath $taskRoot
try {
    if (-not (Test-Path -LiteralPath 'packages\app\dist\index.html')) { throw 'Build first: node .yarn/releases/yarn-4.13.0.cjs build:all' }
    $taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Install the documentation virtual environment first.' }
    $env:PATH = (Join-Path $taskRoot '.venv\Scripts') + ';' + $env:PATH
    $taskConfigs = @('--config', (Join-Path $taskRoot 'app-config.yaml'), '--config', (Join-Path $taskRoot 'app-config.preview.yaml'))
    # The demo branch adds this tracked overlay; main has no fixture or demo catalog.
    $taskDemoConfig = Join-Path $taskRoot 'app-config.demo.yaml'
    if ((Test-Path -LiteralPath $taskDemoConfig) -and -not $ConnectionConfig) {
        $taskConfigs += @('--config', $taskDemoConfig)
    }
    if ($ConnectionConfig) {
        # Collection is a separate user action; startup never launches SSH.
        $taskOverlay = (Resolve-Path -LiteralPath $ConnectionConfig -ErrorAction Stop).Path
        $taskConfigs += @('--config', $taskOverlay)
    }
    if ($AgentAccess) {
        # Per-process token. The connection file is ignored and never printed.
        $taskToken = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate an agent token.' }
        $env:OPS_COMPASS_MCP_TOKEN = $taskToken
        $taskPrivateDir = Join-Path $taskRoot 'private'
        New-Item -ItemType Directory -Path $taskPrivateDir -Force | Out-Null
        $taskClient = @{ mcpServers = @{ 'ops-compass' = @{ url = 'http://localhost:7007/api/mcp-actions/v1'; headers = @{ Authorization = "Bearer $taskToken" } } } }
        $taskClient | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskPrivateDir 'agent-client.local.json') -Encoding utf8
        $taskConfigs += @('--config', (Join-Path $taskRoot 'app-config.agent.yaml'))
        Write-Host 'Agent access enabled. Private connection file: private/agent-client.local.json (rotates on each launch).'
    }
    # The built preview needs no development watcher. Starting directly avoids
    # CLI DevDataStore IPC timeouts and keeps the same backend cwd as local dev.
    $env:NODE_ENV = 'development'
    Push-Location -LiteralPath (Join-Path $taskRoot 'packages\backend')
    try {
        & node --require (Join-Path $taskRoot 'node_modules\@backstage\cli-node\config\nodeTransform.cjs') src/index.ts @taskConfigs
        $taskExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $taskExit
} finally {
    if ($AgentAccess) { Remove-Item Env:OPS_COMPASS_MCP_TOKEN -ErrorAction SilentlyContinue }
    if ($null -eq $taskNodeEnvironment) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
    else { $env:NODE_ENV = $taskNodeEnvironment }
    Pop-Location
}
