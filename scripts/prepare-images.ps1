param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '..\public\cards'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$photos = @(
  @{ Source = 'ChatGPT Image Aug 27, 2026, 05_18_37 PM.png'; Target = 'alinhador-modelo.jpg' },
  @{ Source = 'PAM_3672_1350px.jpg'; Target = 'estojo-fechado.jpg' },
  @{ Source = 'PAM_3700_3047px.jpg'; Target = 'kit-ea.jpg' },
  @{ Source = 'PAM_3702_1350px (1).jpg'; Target = 'estojo-aberto.jpg' }
)
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
foreach ($photo in $photos) {
  $image = [System.Drawing.Image]::FromFile((Join-Path $SourceDirectory $photo.Source))
  try {
    $scale = [Math]::Min([double]1, [double]1280 / [Math]::Max($image.Width, $image.Height))
    $width = [int][Math]::Round($image.Width * $scale)
    $height = [int][Math]::Round($image.Height * $scale)
    $bitmap = New-Object System.Drawing.Bitmap $width,$height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(238, 242, 248))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($image, 0, 0, $width, $height)
      $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]92)
      $bitmap.Save((Join-Path $destination $photo.Target), $encoder, $parameters)
      Write-Output "$($photo.Target): $width x $height, imagem completa sem recorte"
    } finally { $parameters.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
  } finally { $image.Dispose() }
}
