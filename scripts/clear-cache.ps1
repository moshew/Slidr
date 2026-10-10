#requires -Version 5.1
<#
.SYNOPSIS
Resets Slidr by deleting its Local and Roaming app data directories after the app is closed.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clear-cache.ps1 -WhatIf
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clear-cache.ps1
.NOTES
Deletes %LOCALAPPDATA%\dev.slidr.app and %APPDATA%\dev.slidr.app entirely:
caches, settings, imported fonts, cookies, recent-file list, agent data and all
recovery workspaces (including unsaved changes). These cannot be recovered.
Files saved outside these two directories are unaffected, including .slidr files
and external attachments. Does not uninstall Slidr or remove bundled/system fonts,
API keys in Windows Credential Manager, external CLI sign-ins, separate browser
data from pnpm dev, or build/package-manager caches.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
    throw 'This script supports Windows only.'
}
$localData = [Environment]::GetFolderPath('LocalApplicationData')
if ([string]::IsNullOrWhiteSpace($localData)) {
    throw 'Cannot locate LocalApplicationData.'
}
$appRoot = [IO.Path]::GetFullPath((Join-Path $localData 'dev.slidr.app'))
$roamingData = [Environment]::GetFolderPath('ApplicationData')
if ([string]::IsNullOrWhiteSpace($roamingData)) {
    throw 'Cannot locate ApplicationData.'
}
$roamingRoot = [IO.Path]::GetFullPath((Join-Path $roamingData 'dev.slidr.app'))
$webviewRoot = Join-Path $appRoot 'EBWebView'

# Never stop the app forcibly: it may have unsaved work.
if (-not $WhatIfPreference) {
    $running = @(Get-Process -Name slidr -ErrorAction SilentlyContinue)
    $webviews = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($webviewRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    if ($running.Count -gt 0 -or $webviews.Count -gt 0) {
        throw 'Close Slidr and wait for its WebView2 processes to exit, then run this script again.'
    }
}

# Only these two exact absolute paths are eligible for recursive deletion.
$allowedTargets = @($appRoot, $roamingRoot) | Select-Object -Unique

function Assert-SafeTarget([string] $Target) {
    if ($allowedTargets -notcontains [IO.Path]::GetFullPath($Target)) {
        throw "Target is not an allowed Slidr reset path: $Target"
    }
    # Check every ancestor and descendant before recursive removal. Junctions
    # and symbolic links must never redirect deletion to another directory.
    $cursor = $Target
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to traverse a symbolic link or junction: $cursor"
            }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Target)
    while ($pending.Count -gt 0) {
        foreach ($child in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to remove a symbolic link or junction: $($child.FullName)"
            }
            if ($child.PSIsContainer) { $pending.Push($child.FullName) }
        }
    }
}

$targets = @(
    foreach ($target in $allowedTargets) {
        if (Test-Path -LiteralPath $target) {
            Assert-SafeTarget $target
            $target
        }
    }
)
$removed = 0
foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target, 'Delete all Slidr data in this directory, including unsaved work')) {
        Assert-SafeTarget $target
        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "Cleared: $target"
        $removed++
    }
}
if ($WhatIfPreference) {
    Write-Host "Preview complete: $($targets.Count) reset targets found. No files deleted."
} else {
    Write-Host "Done: deleted $removed Slidr data directories. Files saved outside them are unchanged."
}
