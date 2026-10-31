param(
  [string]$SourceDirectory = 'D:\GPS Groningen',
  [string]$OutputPath = (Join-Path $PSScriptRoot 'routes-data.js')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SourceDirectory -PathType Container)) {
  throw "GPX-map niet gevonden: $SourceDirectory"
}

$files = @(Get-ChildItem -LiteralPath $SourceDirectory -File -Recurse |
  Where-Object { $_.Extension -ieq '.gpx' } |
  Sort-Object FullName)

if ($files.Count -eq 0) {
  throw "Geen GPX-bestanden gevonden in: $SourceDirectory"
}

$routes = [System.Collections.Generic.List[object]]::new()

foreach ($file in $files) {
  $document = [System.Xml.XmlDocument]::new()
  $document.XmlResolver = $null
  $document.Load($file.FullName)

  $nameNode = $document.SelectSingleNode("//*[local-name()='metadata']/*[local-name()='name']")
  $name = if ($nameNode -and $nameNode.InnerText.Trim()) {
    $nameNode.InnerText.Trim()
  } else {
    [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  }
  if ($name -match '^new file(?:\s+\d+)?$') {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  }

  $segments = [System.Collections.Generic.List[object]]::new()
  foreach ($trackSegment in $document.SelectNodes("//*[local-name()='trkseg']")) {
    $points = [System.Collections.Generic.List[object]]::new()
    foreach ($point in $trackSegment.SelectNodes("./*[local-name()='trkpt']")) {
      $latitude = [double]::Parse($point.GetAttribute('lat'), [System.Globalization.CultureInfo]::InvariantCulture)
      $longitude = [double]::Parse($point.GetAttribute('lon'), [System.Globalization.CultureInfo]::InvariantCulture)
      $points.Add([object[]]@($latitude, $longitude))
    }
    if ($points.Count -gt 1) {
      $segments.Add($points.ToArray())
    }
  }

  if ($segments.Count -eq 0) {
    foreach ($route in $document.SelectNodes("//*[local-name()='rte']")) {
      $points = [System.Collections.Generic.List[object]]::new()
      foreach ($point in $route.SelectNodes("./*[local-name()='rtept']")) {
        $latitude = [double]::Parse($point.GetAttribute('lat'), [System.Globalization.CultureInfo]::InvariantCulture)
        $longitude = [double]::Parse($point.GetAttribute('lon'), [System.Globalization.CultureInfo]::InvariantCulture)
        $points.Add([object[]]@($latitude, $longitude))
      }
      if ($points.Count -gt 1) {
        $segments.Add($points.ToArray())
      }
    }
  }

  $relativePath = $file.FullName.Substring($SourceDirectory.TrimEnd('\').Length).TrimStart('\')
  $folder = Split-Path -Path $relativePath -Parent
  if (-not $folder) {
    $folder = 'GPS Groningen'
  }

  $routes.Add([ordered]@{
    name = $name
    folder = $folder
    segments = $segments.ToArray()
  })
}

$json = ConvertTo-Json -InputObject $routes.ToArray() -Depth 20 -Compress
$output = "window.GPX_ROUTES = $json;`n"
$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutputPath)) | Out-Null
[System.IO.File]::WriteAllText($resolvedOutputPath, $output, [System.Text.UTF8Encoding]::new($false))

Write-Output "Routes: $($routes.Count)"
Write-Output "Output: $resolvedOutputPath"
