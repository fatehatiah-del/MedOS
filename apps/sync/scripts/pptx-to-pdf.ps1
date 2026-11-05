# Makes a PDF view copy of one PowerPoint file with Microsoft PowerPoint, for MedOS Sync.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pptx-to-pdf.ps1 <input.pptx> <output folder>
#
# The input is a temporary copy made by MedOS Sync, never the study folder's file.
# It is opened read-only, without a window, and closed again; PowerPoint is quit
# only if this script started it.
#
# Writes <output folder>\lecture.pdf. When PowerPoint cannot save a deck as PDF
# (it happens with some heavy decks), writes instead one JPEG per shown slide
# (slides\0001.jpg, ...) and slides.json with each slide's text, and MedOS Sync
# assembles the PDF. Hidden slides are left out either way, as in a slide show.
#
# Exit codes: 0 written, 3 PowerPoint unavailable, 4 conversion failed.

param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'

# Width of slide images in the fallback, in pixels.
$SlideImageWidth = 1600

function Get-ShapeText($shape) {
  $parts = @()
  try {
    if ($shape.Type -eq 6) {
      # msoGroup
      foreach ($item in $shape.GroupItems) { $parts += Get-ShapeText $item }
    } elseif ($shape.HasTable -eq -1) {
      foreach ($row in $shape.Table.Rows) {
        foreach ($cell in $row.Cells) {
          $text = $cell.Shape.TextFrame.TextRange.Text
          if ($text) { $parts += $text }
        }
      }
    } elseif ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
      $parts += $shape.TextFrame.TextRange.Text
    }
  } catch { }
  return $parts
}

try {
  $app = New-Object -ComObject PowerPoint.Application
} catch {
  [Console]::Error.WriteLine('POWERPOINT_UNAVAILABLE')
  exit 3
}

$alreadyOpen = $app.Presentations.Count -gt 0
$presentation = $null
$code = 0
try {
  # Open(FileName, ReadOnly, Untitled, WithWindow)
  $presentation = $app.Presentations.Open($InputPath, -1, 0, 0)
  $pdf = Join-Path $OutputDir 'lecture.pdf'
  try {
    # SaveAs(FileName, ppSaveAsPDF = 32)
    $presentation.SaveAs($pdf, 32)
  } catch {
    if (Test-Path -LiteralPath $pdf) { Remove-Item -LiteralPath $pdf -Force }
    $slidesDir = Join-Path $OutputDir 'slides'
    New-Item -ItemType Directory -Path $slidesDir | Out-Null
    $setup = $presentation.PageSetup
    $height = [int][Math]::Round($SlideImageWidth * $setup.SlideHeight / $setup.SlideWidth)
    $texts = @()
    $number = 0
    foreach ($slide in $presentation.Slides) {
      if ($slide.SlideShowTransition.Hidden -eq -1) { continue }
      $number++
      $slide.Export((Join-Path $slidesDir ('{0:D4}.jpg' -f $number)), 'JPG', $SlideImageWidth, $height)
      $lines = @()
      foreach ($shape in $slide.Shapes) { $lines += Get-ShapeText $shape }
      $texts += ,(($lines -join "`n") -replace "`r", "`n")
    }
    $json = ConvertTo-Json -InputObject @{ width = $SlideImageWidth; height = $height; texts = $texts } -Depth 3 -Compress
    [System.IO.File]::WriteAllText((Join-Path $OutputDir 'slides.json'), $json, (New-Object System.Text.UTF8Encoding $false))
  }
} catch {
  [Console]::Error.WriteLine('CONVERSION_FAILED: ' + $_.Exception.Message)
  $code = 4
} finally {
  if ($presentation) { $presentation.Close() }
  if (-not $alreadyOpen -and $app.Presentations.Count -eq 0) { $app.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
exit $code
