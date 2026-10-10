#requires -Version 5.1
<#
.SYNOPSIS
Clears Slidr's Windows WebView2 disk caches after the app is closed.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clear-cache.ps1 -WhatIf
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clear-cache.ps1
.NOTES
Preserves projects, recovery workspaces, agent conversations, settings, cookies,
Local Storage and IndexedDB (including imported fonts). Does not clear caches
of a separate browser running pnpm dev, or build/package-manager caches.
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

# An explicit allowlist avoids deleting persistent application data.
$cachePaths = @(
    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache',
    'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache',
    'GPUPersistentCache', 'component_crx_cache', 'extensions_crx_cache',
    'Default\Cache', 'Default\Code Cache', 'Default\GPUCache',
    'Default\DawnCache', 'Default\DawnGraphiteCache', 'Default\DawnWebGPUCache',
    'Default\AutofillAiModelCache', 'Default\optimization_guide_hint_cache_store',
    'Default\Shared Dictionary', 'Default\Service Worker\CacheStorage',
    'Default\Service Worker\ScriptCache'
)

function Assert-SafeTarget([string] $Target) {
    $prefix = $appRoot.TrimEnd('\') + '\'
    if (-not $Target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target is outside Slidr's data directory: $Target"
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
    foreach ($relative in $cachePaths) {
        $target = [IO.Path]::GetFullPath((Join-Path $webviewRoot $relative))
        if (Test-Path -LiteralPath $target) {
            Assert-SafeTarget $target
            $target
        }
    }
)
$removed = 0
foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target, 'Delete Slidr cache')) {
        Assert-SafeTarget $target
        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "Cleared: $target"
        $removed++
    }
}
if ($WhatIfPreference) {
    Write-Host "Preview complete: $($targets.Count) cache directories found. No files deleted."
} else {
    Write-Host "Done: cleared $removed cache directories. Slidr rebuilds these caches when needed."
}
