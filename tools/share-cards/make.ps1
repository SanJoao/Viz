# viz · share-card generator
# Renders the og:image previews (1200×630 PNGs) using headless Edge/Chrome —
# no npm dependencies. Run from anywhere:
#     pwsh tools/share-cards/make.ps1
#
# Produces:
#     /share.jpg                 ← gallery cover  (from cover.html)
#     /worldcup2026/share.jpg    ← entry 001 card (from entry-001.html,
#                                  which embeds chart-raw.png — a phone-width
#                                  screenshot of the live chart taken first)
# JPG, not PNG: WhatsApp drops link previews whose image is over ~300 KB.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here "..\..")

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw "No Chrome or Edge found." }

function Shoot($url, $out, $w, $h) {
  & $browser --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
    --user-data-dir="$env:TEMP\viz-share-cards" --virtual-time-budget=15000 `
    --window-size="$w,$h" --screenshot="$out" $url 2>$null | Out-Null
  if (-not (Test-Path $out)) { throw "Screenshot failed: $out" }
  Write-Host "✓ $out"
}

Add-Type -AssemblyName System.Drawing
function Card($html, $jpg) {
  $tmp = Join-Path $env:TEMP "viz-card.png"
  Shoot "file:///$($html -replace '\\','/')" $tmp 1200 630
  $img = [System.Drawing.Image]::FromFile($tmp)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
  $opts = New-Object System.Drawing.Imaging.EncoderParameters 1
  $opts.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
  $img.Save($jpg, $codec, $opts)
  $img.Dispose()
  Remove-Item $tmp
  Write-Host "✓ $jpg ($([math]::Round((Get-Item $jpg).Length/1KB)) KB)"
}

# 1. Phone-width screenshot of the live chart (compact mode: big donut, flags only)
Shoot "file:///$($root -replace '\\','/')/worldcup2026/index.html" "$here\chart-raw.png" 740 1400

# 2. Gallery cover → /share.jpg
Card "$here\cover.html" "$root\share.jpg"

# 3. Entry 001 card → /worldcup2026/share.jpg
Card "$here\entry-001.html" "$root\worldcup2026\share.jpg"

# 4. Entry 002 card → /worldcup-defense/share.jpg (uses defense-raw.png, captured separately)
Card "$here\entry-002.html" "$root\worldcup-defense\share.jpg"

# 5. Entry 003 card → /density-topography/share.jpg (uses density-raw.png, captured separately)
Card "$here\entry-003.html" "$root\density-topography\share.jpg"
