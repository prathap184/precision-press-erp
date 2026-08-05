$dubbl = "C:\Users\jprat\OneDrive\Desktop\Dubbl"
$erp = "C:\Users\jprat\OneDrive\Desktop\Hindustan Enterprices\precision-press-erp"

$missing = @()

Get-ChildItem -Path $dubbl -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($dubbl.Length)
    if ($rel -like "\node_modules*" -or $rel -like "\.git*" -or $rel -like "\.next*" -or $rel -like "\pnpm-lock.yaml" -or $rel -like "\.env*") {
        return
    }

    if ($rel -like "\app\*") {
        $subApp = $rel.Substring(4) # strip \app
        $target1 = Join-Path $erp ("src\app" + $subApp)
        $target2 = Join-Path $erp ("src\app\(dashboard)\accounting" + $subApp)
        $target3 = Join-Path $erp ("src\app\(onboarding)" + $subApp)
        if (-not (Test-Path $target1) -and -not (Test-Path $target2) -and -not (Test-Path $target3)) {
            $missing += $rel
        }
    } elseif ($rel -like "\components\*" -or $rel -like "\lib\*" -or $rel -like "\hooks\*" -or $rel -like "\types\*" -or $rel -like "\styles\*") {
        $target = Join-Path $erp ("src" + $rel)
        if (-not (Test-Path $target)) {
            $missing += $rel
        }
    } else {
        $target = Join-Path $erp $rel.TrimStart("\")
        if (-not (Test-Path $target)) {
            $missing += $rel
        }
    }
}

Write-Host "Total Missing Files:" $missing.Count
$missing | ForEach-Object { Write-Host "MISSING: $_" }
