# Tally Connector — Run as Windows Startup Service
# ─────────────────────────────────────────────────────────────────────────────────
# Run this PowerShell script as Administrator to register the Connector
# as a Windows Scheduled Task that starts automatically on login.
#
# Usage:
#   Right-click → Run as Administrator
#   .\install-task.ps1
# ─────────────────────────────────────────────────────────────────────────────────

$taskName    = "PrecisionPressErpTallyConnector"
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$nodeExe     = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$connectorJs = Join-Path $scriptDir "connector.js"

if (-not $nodeExe) {
    Write-Error "Node.js is not installed or not in PATH. Please install Node.js first."
    exit 1
}

Write-Host "Registering Tally Connector as a Scheduled Task..." -ForegroundColor Cyan

$action  = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$connectorJs`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force

Write-Host ""
Write-Host "✅ Tally Connector installed as Windows Scheduled Task." -ForegroundColor Green
Write-Host "   Task Name : $taskName"
Write-Host "   Runs at   : Every login"
Write-Host "   Script    : $connectorJs"
Write-Host ""
Write-Host "To start it now without restarting:" -ForegroundColor Yellow
Write-Host "   Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "To check logs: .\logs\connector.log"
