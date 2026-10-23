# Hoffle Native updates itself with this on Windows (native-update.sh is the
# macOS and Linux twin, and says what each step is for). The app runs it; the
# page can only ask the app to. Plain ASCII: Windows PowerShell 5.1 reads a
# file without a byte-order mark in the ANSI code page.
#
#   native-update.ps1 check <current-version> <app-folder> <stage>
#     Prints "ready <version>", "manual <version>" or "none".
#   native-update.ps1 install <app-folder> <pid> <stage>

param([string]$Mode, [string]$A, [string]$B, [string]$C)

$ErrorActionPreference = "Stop"
# The progress bar makes Invoke-WebRequest many times slower.
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Manifest = "https://github.com/Coxaexs/huddle/releases/latest/download/native-latest.txt"
$Files = "https://github.com/Coxaexs/huddle/releases/download/"
$Platform = "windows-x64"

function Check([string]$current, [string]$app, [string]$stage) {
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    $list = Join-Path $stage "manifest.txt"
    # To a file: GitHub serves it as octet-stream, which .Content returns as bytes.
    Invoke-WebRequest -UseBasicParsing -Uri $Manifest -OutFile $list
    $version = $null; $url = $null; $sum = $null
    foreach ($line in Get-Content $list) {
        $f = $line.Trim() -split "\s+"
        if ($f[0] -eq "version") { $version = $f[1] }
        elseif ($f[0] -eq $Platform) { $url = $f[1]; $sum = $f[2] }
    }
    if (-not $version -or -not $url -or -not $sum -or ([version]$version -le [version]$current)) { return "none" }
    if (-not $url.StartsWith($Files)) { throw "unexpected address $url" }
    try {
        $probe = Join-Path $app "hoffle-write-test.tmp"
        [IO.File]::WriteAllText($probe, "")
        [IO.File]::Delete($probe)
    } catch {
        return "manual $version"
    }
    $new = Join-Path $stage "new"
    $marker = Join-Path $stage "version"
    # Unpacked by an earlier check already.
    if ((Test-Path $new) -and (Test-Path $marker) -and ((Get-Content $marker) -eq $version)) { return "ready $version" }
    Remove-Item -Recurse -Force $new, $marker -ErrorAction SilentlyContinue
    $zip = Join-Path $stage "update.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
    if ((Get-FileHash -Algorithm SHA256 $zip).Hash -ne $sum) {
        Remove-Item $zip
        throw "checksum mismatch"
    }
    Expand-Archive -Path $zip -DestinationPath $new -Force
    Remove-Item $zip
    Set-Content -Path $marker -Value $version
    return "ready $version"
}

function Install([string]$app, [int]$appPid, [string]$stage) {
    try { Wait-Process -Id $appPid -Timeout 30 } catch {}
    $new = Join-Path $stage "new"
    if (-not (Test-Path (Join-Path $new "Hoffle.exe"))) { throw "nothing to install" }
    # The share-audio helper can hold its file a moment after the app is gone.
    for ($i = 0; ; $i++) {
        try {
            Copy-Item -Path (Join-Path $new "*") -Destination $app -Recurse -Force
            break
        } catch {
            if ($i -ge 20) { throw }
            Start-Sleep -Milliseconds 500
        }
    }
    Remove-Item -Recurse -Force $new, (Join-Path $stage "version") -ErrorAction SilentlyContinue
    Start-Process -FilePath (Join-Path $app "Hoffle.exe")
}

switch ($Mode) {
    "check" { Check $A $B $C }
    "install" { Install $A ([int]$B) $C }
    default { throw "usage: check <current> <app-folder> <stage> | install <app-folder> <pid> <stage>" }
}
