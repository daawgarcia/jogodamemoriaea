param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '..\public\cards'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$photos = @(
  @{ Source = 'ChatGPT Image Aug 27, 2026, 05_18_37 PM.png'; Target = 'alinhador-modelo.jpg'; Crop = @(0.27, 0.16, 0.52, 0.62) },
  @{ Source = 'PAM_3672_1350px.jpg'; Target = 'estojo-fechado.jpg'; Crop = @(0.28, 0.25, 0.43, 0.61) },
  @{ Source = 'PAM_3700_3047px.jpg'; Target = 'kit-ea.jpg'; Crop = @(0.045, 0.23, 0.93, 0.63) },
  @{ Source = 'PAM_3702_1350px (1).jpg'; Target = 'estojo-aberto.jpg'; Crop = @(0.285, 0.17, 0.43, 0.815) }
)
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
foreach ($photo in $photos) {
  $image = [System.Drawing.Image]::FromFile((Join-Path $SourceDirectory $photo.Source))
  try {
    $crop = New-Object System.Drawing.RectangleF (
      [single]($image.Width * $photo.Crop[0]),
      [single]($image.Height * $photo.Crop[1]),
      [single]($image.Width * $photo.Crop[2]),
      [single]($image.Height * $photo.Crop[3])
    )
    $scale = [Math]::Min([double]1, [double]1280 / [Math]::Max($crop.Width, $crop.Height))
    $width = [int][Math]::Round($crop.Width * $scale)
    $height = [int][Math]::Round($crop.Height * $scale)
    $bitmap = New-Object System.Drawing.Bitmap $width,$height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(238, 242, 248))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $destinationRect = New-Object System.Drawing.RectangleF 0,0,$width,$height
      $graphics.DrawImage($image, $destinationRect, $crop, [System.Drawing.GraphicsUnit]::Pixel)
      $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]92)
      $bitmap.Save((Join-Path $destination $photo.Target), $encoder, $parameters)
      Write-Output "$($photo.Target): $width x $height, enquadramento do produto sem excesso de fundo"
    } finally { $parameters.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
  } finally { $image.Dispose() }
}
