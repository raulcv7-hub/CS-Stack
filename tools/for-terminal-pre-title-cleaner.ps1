& {
    $contentFolder = Join-Path -Path (Get-Location) -ChildPath "content"

    if (-not (Test-Path -Path $contentFolder)) {
        Write-Host "ERROR: No se encontró la carpeta 'content' en: $(Get-Location)" -ForegroundColor Red
        return
    }

    Write-Host "Analizando la carpeta 'content' en modo seguro (UTF-8)...`n" -ForegroundColor Cyan

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $files = Get-ChildItem -Path $contentFolder -Filter "*.md" -Recurse
    $targets = @()

    foreach ($file in $files) {
        $lines = [System.IO.File]::ReadAllLines($file.FullName, [System.Text.Encoding]::UTF8)
        if ($null -eq $lines -or $lines.Count -eq 0) { continue }

        $firstHeaderIndex = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\s*#') {
                $firstHeaderIndex = $i
                break
            }
        }

        if ($firstHeaderIndex -gt 0) {
            $relPath = Resolve-Path -Path $file.FullName -Relative
            $preview = $lines[$firstHeaderIndex]
            if ($preview.Length -gt 45) { $preview = $preview.Substring(0, 45) + "..." }

            $targets += [PSCustomObject]@{
                Ruta          = $relPath
                LineasABorrar = $firstHeaderIndex
                PrimerHeader  = $preview
                FullPath      = $file.FullName
                HeaderIndex   = $firstHeaderIndex
                AllLines      = $lines
            }
        }
    }

    if ($targets.Count -eq 0) {
        Write-Host "¡Todo limpio! No se encontraron FilePaths o texto previo al primer '#'." -ForegroundColor Green
        return
    }

    Write-Host "========================================================================" -ForegroundColor Yellow
    Write-Host "            PREVISIÓN DE CAMBIOS (NINGÚN ARCHIVO MODIFICADO)            " -ForegroundColor Yellow
    Write-Host "========================================================================" -ForegroundColor Yellow

    $targets | Format-Table -Property Ruta, LineasABorrar, PrimerHeader -AutoSize

    $totalLines = ($targets | Measure-Object -Property LineasABorrar -Sum).Sum

    Write-Host "------------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " Total de archivos a modificar : $($targets.Count)" -ForegroundColor Cyan
    Write-Host " Total de líneas a eliminar   : $totalLines" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------------------`n" -ForegroundColor Cyan

    $confirm = Read-Host "¿Deseas proceder a eliminar esas líneas en los archivos indicados? (S/N)"

    if ($confirm -match '^(S|Si|SÍ|Y|Yes)$') {
        Write-Host "`nAplicando limpieza en UTF-8 seguro..." -ForegroundColor Yellow
        foreach ($t in $targets) {
            $cleanLines = $t.AllLines[$t.HeaderIndex..($t.AllLines.Count - 1)]
            [System.IO.File]::WriteAllLines($t.FullPath, $cleanLines, $utf8NoBom)
            Write-Host " [OK] Limpiado: $($t.Ruta) (-$($t.LineasABorrar) líneas)" -ForegroundColor Green
        }
        Write-Host "`n¡Operación completada con éxito! Todos los diagramas y KaTeX están intactos." -ForegroundColor Green
    } else {
        Write-Host "`nOperación CANCELADA. Ningún archivo fue modificado." -ForegroundColor Yellow
    }
}