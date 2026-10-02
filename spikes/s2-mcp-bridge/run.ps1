# Spike S2: build and run the lab app, and watch for a console window opened by the Claude child
# process (the app is a GUI process; CREATE_NO_WINDOW must keep the CLI invisible).
param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\src-tauri"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
if (-not $NoBuild) { cargo build --release; if (-not $?) { exit 1 } }
New-Item -ItemType Directory -Force ..\out | Out-Null

$p = Start-Process -FilePath .\target\release\s2-mcp-bridge.exe -PassThru `
  -RedirectStandardOutput ..\out\stdout.txt -RedirectStandardError ..\out\stderr.txt
$sw = [Diagnostics.Stopwatch]::StartNew()
$consoles = @{}
$claudeSeen = $false
while (-not $p.HasExited) {
  $claude = Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $p.Id }
  foreach ($c in $claude) {
    $claudeSeen = $true
    $ids = @($c.ProcessId) + @(Get-CimInstance Win32_Process -Filter "Name='conhost.exe'" |
        Where-Object { $_.ParentProcessId -eq $c.ProcessId } | ForEach-Object { $_.ProcessId })
    foreach ($id in $ids) {
      $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($proc -and $proc.MainWindowHandle -ne 0) { $consoles[$id] = $proc.ProcessName }
    }
  }
  Start-Sleep -Milliseconds 150
  if ($sw.Elapsed.TotalSeconds -gt 300) { Stop-Process -Id $p.Id -Force; 'TIMEOUT: killed the lab app'; break }
}
"claude child observed: $claudeSeen | console windows seen: $($consoles.Count)"
Get-Content ..\out\report.txt -ErrorAction SilentlyContinue
