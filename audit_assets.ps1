
$publicPath = 'D:\PHẦN MỀM\PHYSICS 8\Physics-8-\public'

Write-Host '=== TOP 20 LARGEST FILES IN /public ==='
$allFiles = Get-ChildItem -Path $publicPath -Recurse -File | Sort-Object Length -Descending
$allFiles | Select-Object -First 20 | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    $rel = $_.FullName.Substring($publicPath.Length)
    Write-Host "$sizeMB MB  --> $rel"
}

$total = ($allFiles | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "=== TOTAL PUBLIC SIZE: $([math]::Round($total / 1MB, 2)) MB ==="

Write-Host ""
Write-Host "=== BY EXTENSION ==="
$allFiles | Group-Object Extension | ForEach-Object {
    $extSize = ($_.Group | Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{
        Extension = $_.Name
        Count     = $_.Count
        SizeMB    = [math]::Round($extSize / 1MB, 2)
    }
} | Sort-Object SizeMB -Descending | Format-Table -AutoSize
