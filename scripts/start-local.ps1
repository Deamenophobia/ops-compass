param([string]$ConnectionConfig)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    $taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Install the local virtual environment first; see docs/guides/local-setup.md.' }
    $env:PATH = (Join-Path $taskRoot '.venv\Scripts') + ';' + $env:PATH
    $taskConfigs = @('--config', (Join-Path $taskRoot 'app-config.yaml'))
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
    & node .yarn/releases/yarn-4.13.0.cjs start @taskConfigs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
