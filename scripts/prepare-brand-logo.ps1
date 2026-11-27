param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePdf
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null

function Wait-Result($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.GetAwaiter().GetResult()
}

$file = Wait-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $SourcePdf).Path)) ([Windows.Storage.StorageFile])
$pdf = Wait-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
if ($pdf.PageCount -ne 1) { throw 'O arquivo deve conter apenas uma pagina de logo.' }
$page = $pdf.GetPage(0)
$stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
$options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
$options.DestinationWidth = 1024
$options.DestinationHeight = [uint32][Math]::Round(1024 * $page.Size.Height / $page.Size.Width)
try {
  $operation = $page.RenderToStreamAsync($stream, $options)
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
  } | Select-Object -First 1
  $task = $method.Invoke($null, @($operation))
  $task.GetAwaiter().GetResult() | Out-Null
  $stream.Seek(0)
  $inputStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Bitmap]::FromStream($inputStream)
  $crop = New-Object System.Drawing.Rectangle (
    [int]($image.Width * 0.065), [int]($image.Height * 0.085),
    [int]($image.Width * 0.88), [int]($image.Height * 0.86)
  )
  $symbol = $image.Clone($crop, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $symbol.Save((Join-Path $PSScriptRoot '..\public\ea-symbol.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $symbol.Dispose(); $image.Dispose(); $inputStream.Dispose() }
  Write-Output "Logo exportado: $($options.DestinationWidth) x $($options.DestinationHeight)"
} finally { $stream.Dispose(); $page.Dispose() }
