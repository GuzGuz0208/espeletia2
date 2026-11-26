# Publicar para todos los teléfonos (decisión 12; paso a paso en docs/operacion-base.md).
#
# Toma el paquete exportado del Panel («Exportar para publicar» → Descargas\paquete-publicar.json, con `exportadoEn`) y,
# SOLO si se pasa con -Avisos, un avisos.json. Antes de firmar muestra versión, fecha de exportación y SHA-256 y pide
# confirmación (S/N). Rechaza un paquete sin `exportadoEn`, más viejo o igual que el publicado, o si hay copias duplicadas
# en Descargas (p. ej. «paquete-publicar (1).json»). Firma con herramientas/firmar_paquete.py (la clave privada vive FUERA
# del repo: C:\Users\danna\espeletia-llm\claves\ o FRAY_CLAVES), copia a publicado/, commit + push a main y borra los
# archivos de entrada. Vercel redespliega solo en ~1 min y todo teléfono con señal baja y activa la versión nueva.
#
# Uso: doble clic en herramientas\Publicar.cmd, o
#   powershell -ExecutionPolicy Bypass -File herramientas\publicar.ps1 [-Paquete ruta.json] [-Avisos avisos.json] [-SinPush]
param(
  [string]$Paquete = (Join-Path $env:USERPROFILE 'Downloads\paquete-publicar.json'),
  [string]$Avisos = '',
  [switch]$SinPush
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$env:PYTHONIOENCODING = 'utf-8'
$Repo = Split-Path -Parent $PSScriptRoot

function Fin($texto, $codigo) {
  Write-Host ''
  if ($codigo -eq 0) { Write-Host $texto -ForegroundColor Green } else { Write-Host $texto -ForegroundColor Red }
  Write-Host ''
  Read-Host 'Pulsa Enter para cerrar' | Out-Null
  exit $codigo
}

# Compara versiones por partes numéricas (mismo criterio que firmar_paquete.py y js/sync.js)
function Comparar-Version($a, $b) {
  $pa = @([regex]::Matches([string]$a, '\d+') | ForEach-Object { [long]$_.Value })
  $pb = @([regex]::Matches([string]$b, '\d+') | ForEach-Object { [long]$_.Value })
  for ($i = 0; $i -lt [Math]::Max($pa.Count, $pb.Count); $i++) {
    $x = if ($i -lt $pa.Count) { $pa[$i] } else { -1 }
    $y = if ($i -lt $pb.Count) { $pb[$i] } else { -1 }
    if ($x -ne $y) { if ($x -gt $y) { return 1 } else { return -1 } }
  }
  return 0
}

try {
  Write-Host '== Publicar contenido del parque ==' -ForegroundColor Cyan
  if (-not (Test-Path $Paquete)) {
    Fin "No encontré $Paquete. En el Panel: pestaña «Importar y exportar» → «Exportar para publicar», y vuelve a intentarlo." 1
  }
  $Paquete = (Resolve-Path $Paquete).Path
  # Copias duplicadas del navegador («paquete-publicar (1).json»): no se sabe cuál es la buena
  $base = [IO.Path]::GetFileNameWithoutExtension($Paquete)
  $dups = @(Get-ChildItem -LiteralPath (Split-Path $Paquete) -Filter "$base (*).json" -ErrorAction SilentlyContinue)
  if ($dups.Count -gt 0) {
    Fin "Hay copias duplicadas ($(($dups | ForEach-Object Name) -join ', ')). Bórralas todas, exporta otra vez desde el Panel y vuelve a publicar." 1
  }
  if ($Avisos -and -not (Test-Path $Avisos)) { Fin "No encontré los avisos: $Avisos" 1 }

  $p = Get-Content -LiteralPath $Paquete -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $p.version) { Fin 'El archivo no es un paquete del Panel (no tiene versión).' 1 }
  if (-not $p.exportadoEn) { Fin 'El paquete no viene de «Exportar para publicar» del Panel (falta exportadoEn). Exporta otra vez.' 1 }
  $exportado = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$p.exportadoEn, [ref]$exportado)) { Fin "Fecha de exportación inválida: $($p.exportadoEn)" 1 }
  if ($exportado -gt [DateTimeOffset]::Now.AddMinutes(10)) { Fin "La fecha de exportación está en el futuro ($($p.exportadoEn)): revisa el reloj del PC." 1 }

  # El primer Python que tenga `cryptography` (FRAY_PYTHON, el venv del proyecto o el del sistema)
  $Py = $null
  foreach ($c in @($env:FRAY_PYTHON, 'C:\Users\danna\espeletia-llm\venv\Scripts\python.exe', 'python', 'py')) {
    if (-not $c) { continue }
    try { & $c -c 'import cryptography' 2>$null; if ($LASTEXITCODE -eq 0) { $Py = $c; break } } catch { }
  }
  if (-not $Py) { Fin 'No encontré Python con el paquete cryptography (pip install cryptography). Avisa a soporte.' 1 }

  Write-Host '1/4 Trayendo la última versión del repositorio…'
  git -C $Repo checkout main | Out-Null
  if ($LASTEXITCODE -ne 0) { Fin 'No pude pasar a la rama main (¿hay cambios sin guardar en el repo?). Avisa a soporte.' 1 }
  git -C $Repo -c pull.rebase=false pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { Fin 'No pude actualizar el repositorio (¿sin internet?). Inténtalo de nuevo en un momento.' 1 }

  $mPrevio = Join-Path $Repo 'publicado\manifest.json'
  $publicada = if (Test-Path $mPrevio) { (Get-Content $mPrevio -Raw | ConvertFrom-Json).version } else { $null }
  if ($publicada -and (Comparar-Version $p.version $publicada) -le 0) {
    Fin "El paquete (versión $($p.version)) no es más nuevo que el publicado ($publicada). Exporta otra vez desde el Panel después de guardar los cambios." 1
  }

  Write-Host ''
  Write-Host 'Vas a publicar para TODOS los teléfonos:' -ForegroundColor Yellow
  Write-Host "  Paquete:      $Paquete"
  Write-Host "  Versión:      $($p.version)   (publicada ahora: $(if ($publicada) { $publicada } else { 'ninguna' }))"
  Write-Host "  Exportado:    $($exportado.ToLocalTime().ToString('yyyy-MM-dd HH:mm'))"
  Write-Host "  Fichas:       $(@($p.fichas).Count)"
  Write-Host "  SHA-256:      $((Get-FileHash -LiteralPath $Paquete -Algorithm SHA256).Hash.ToLower())"
  if ($Avisos) {
    $na = @(Get-Content -LiteralPath $Avisos -Raw -Encoding UTF8 | ConvertFrom-Json).Count
    Write-Host "  Avisos:       $Avisos ($na avisos)"
    Write-Host "  SHA-256:      $((Get-FileHash -LiteralPath $Avisos -Algorithm SHA256).Hash.ToLower())"
  } else { Write-Host '  Avisos:       ninguno (lista vacía)' }
  $r = Read-Host '¿Publicar? Escribe S para sí o N para no'
  if ($r -notmatch '^\s*[sS]\s*$') { Fin 'No se publicó nada.' 1 }

  Write-Host '2/4 Revisando y firmando el paquete…'
  $argsFirma = @('-X', 'utf8', (Join-Path $Repo 'herramientas\firmar_paquete.py'), '--paquete', $Paquete,
                 '--salida', (Join-Path $Repo 'publicado'))
  if ($Avisos) { $argsFirma += @('--avisos', $Avisos) }
  & $Py @argsFirma
  if ($LASTEXITCODE -ne 0) { Fin 'El paquete NO se publicó: revisa los errores de arriba (fichas o avisos) y corrígelos en el Panel.' 1 }

  $version = (Get-Content $mPrevio -Raw | ConvertFrom-Json).version

  Write-Host "3/4 Guardando la versión $version…"
  git -C $Repo add publicado/manifest.json publicado/paquete.json publicado/avisos.json
  git -C $Repo diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Fin "La versión $version ya estaba publicada: no hay nada nuevo que subir." 0 }
  git -C $Repo commit -m "publicar: contenido del parque v$version" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fin 'No pude guardar el cambio en git. Avisa a soporte.' 1 }

  if ($SinPush) { Fin "Firmado y guardado (v$version), sin subir (-SinPush). Los archivos de entrada se conservan." 0 }
  Write-Host '4/4 Subiendo a internet…'
  git -C $Repo push origin main
  if ($LASTEXITCODE -ne 0) { Fin 'No pude subir (¿sin internet?). Vuelve a hacer doble clic en Publicar cuando haya señal: no se pierde nada.' 1 }

  # Ya publicado: se borran los archivos de entrada para que nadie vuelva a publicar uno viejo por error
  Remove-Item -LiteralPath $Paquete -Force -Confirm:$false
  if ($Avisos) { Remove-Item -LiteralPath $Avisos -Force -Confirm:$false }
  Fin "Listo: versión $version publicada. En 1-2 minutos todos los teléfonos con señal la reciben y la activan solos." 0
} catch {
  Fin "Algo falló: $($_.Exception.Message)" 1
}
