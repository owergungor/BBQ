# BBQ Windows Release Packaging Script
# Standardizes release artifacts to:
#   - win-x64-setup.exe
#   - win-x64.zip
# Computes SHA256 checksums after renaming and verifies x64 architecture.

param(
    [string]$TargetDir = "target/release",
    [string]$OutputDir = "target/release/release-artifacts"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Packaging Windows Release Artifacts ==="

if (-not (Test-Path $TargetDir)) {
    throw "Target directory '$TargetDir' does not exist. Run build first."
}

# 1. Locate NSIS installer
$nsisDir = Join-Path $TargetDir "bundle/nsis"
if (-not (Test-Path $nsisDir)) {
    throw "NSIS bundle directory '$nsisDir' not found."
}
$installers = Get-ChildItem -Path (Join-Path $nsisDir "*.exe")
if ($installers.Count -eq 0) {
    throw "No NSIS installer found in '$nsisDir'."
}
$installer = $installers[0]
Write-Host "Found source installer: $($installer.FullName) ($($installer.Length) bytes)"

# 2. Locate standalone binary
$binaryPath = Join-Path $TargetDir "bbq-desktop.exe"
if (-not (Test-Path $binaryPath)) {
    throw "Standalone binary '$binaryPath' not found."
}
$binary = Get-Item $binaryPath
Write-Host "Found standalone binary: $($binary.FullName) ($($binary.Length) bytes)"

# 3. Verify Architecture: x64 (AMD64 PE Machine type 0x8664)
$fs = [System.IO.File]::OpenRead($binary.FullName)
$br = New-Object System.IO.BinaryReader($fs)
try {
    $fs.Position = 0x3C
    $peOffset = $br.ReadInt32()
    $fs.Position = $peOffset + 4
    $machine = $br.ReadUInt16()
    Write-Host ('Binary PE Machine type: 0x{0:X4}' -f $machine)
    if ($machine -ne 0x8664) {
        throw ("Architecture verification failed: expected 0x8664 (x64), got 0x{0:X4}" -f $machine)
    }
    Write-Host "Architecture verified: Windows x64 (AMD64)"
} finally {
    $br.Close()
    $fs.Close()
}

# 4. Check for forbidden debug/log artifacts in bundle
$badFiles = Get-ChildItem -Path $nsisDir -Include *.pdb,*.log -Recurse
if ($badFiles.Count -gt 0) {
    throw "Forbidden debug/log artifacts found in bundle: $badFiles"
}

# 5. Prepare output directory
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$setupDst = Join-Path $OutputDir "win-x64-setup.exe"
$zipDst = Join-Path $OutputDir "win-x64.zip"

# Copy installer -> win-x64-setup.exe
Write-Host "Standardizing installer -> win-x64-setup.exe"
Copy-Item -Path $installer.FullName -Destination $setupDst -Force

# Zip binary -> win-x64.zip
Write-Host "Creating portable zip -> win-x64.zip"
if (Test-Path $zipDst) { Remove-Item -Force $zipDst }
Compress-Archive -Path $binary.FullName -DestinationPath $zipDst -Force

# 6. Verify outputs
foreach ($file in @($setupDst, $zipDst)) {
    $item = Get-Item $file
    if ($item.Length -le 0) {
        throw "Generated artifact '$file' is empty or missing."
    }
    Write-Host "Artifact ready: $($item.Name) ($($item.Length) bytes)"
}

# 7. Calculate SHA256 hashes AFTER rename
Write-Host "`n=== SHA256 Checksums (Windows x64) ==="
$hashes = Get-FileHash -Path $setupDst, $zipDst -Algorithm SHA256
$hashes | Format-Table -AutoSize

$checksumsFile = Join-Path $OutputDir "checksums.txt"
$hashes | ForEach-Object {
    "$($_.Hash.ToLower())  $($_.Path | Split-Path -Leaf)"
} | Out-File -FilePath $checksumsFile -Encoding ascii

Write-Host "Wrote checksums to $checksumsFile"
