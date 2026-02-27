$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$exclude = @('node_modules', '.next', '.git')

function IsExcluded([string]$path) {
  foreach ($e in $exclude) {
    if ($path -match ('\\' + [regex]::Escape($e) + '\\')) { return $true }
  }
  return $false
}

$exts = @('.ts','.tsx','.js','.jsx','.css','.json','.md')
$files = Get-ChildItem -Recurse -File |
  Where-Object { -not (IsExcluded $_.FullName) } |
  Where-Object { $exts -contains $_.Extension.ToLower() }

$total = 0
$byExt = @{}

foreach ($f in $files) {
  $count = (Get-Content -LiteralPath $f.FullName).Count
  $total += $count
  $ext = $f.Extension.ToLower()
  if (-not $byExt.ContainsKey($ext)) { $byExt[$ext] = 0 }
  $byExt[$ext] += $count
}

$byExt.GetEnumerator() |
  Sort-Object Value -Descending |
  ForEach-Object { "{0,6}  {1}" -f $_.Value, $_.Key }

"------"
"TOTAL  $total"
"FILES  $($files.Count)"
