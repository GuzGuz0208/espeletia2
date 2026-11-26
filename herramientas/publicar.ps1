# Publicar para todos los teléfonos (decisión 12; paso a paso en docs/operacion-base.md).
#
# Toma el paquete exportado del Panel («Exportar para publicar» → Descargas\paquete-publicar.json) y, si existe,
# Descargas\avisos.json; lo firma con herramientas/firmar_paquete.py (la clave privada vive FUERA del repo, en
# C:\Users\danna\espeletia-llm\claves\ o en la variable FRAY_CLAVES), copia manifest/paquete/avisos a publicado/ y hace
# commit + push a main. Vercel redespliega solo en ~1 min y todo teléfono con señal baja y activa la versión nueva.
#
# Uso: doble clic en herramientas\Publicar.cmd, o
#   powershell -ExecutionPolicy Bypass -File herramientas\publicar.ps1 [-Paquete ruta.json] [-Avisos avisos.json] [-SinPush]
param(
  [string]$Paquete = (Join-Path $env:USERPROFILE 'Downloads\paquete-publicar.json'),
  [string]$Avisos = (Join-Path $env:USERPROFILE 'Downloads\avisos.json'),
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

try {
  Write-Host '== Publicar contenido del parque ==' -ForegroundColor Cyan
  if (-not (Test-Path $Paquete)) {
    Fin "No encontré $Paquete. En el Panel: pestaña «Importar y exportar» → «Exportar para publicar», y vuelve a intentarlo." 1
  }

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

  Write-Host '2/4 Revisando y firmando el paquete…'
  $argsFirma = @('-X', 'utf8', (Join-Path $Repo 'herramientas\firmar_paquete.py'), '--paquete', $Paquete,
                 '--salida', (Join-Path $Repo 'publicado'))
  if (Test-Path $Avisos) { $argsFirma += @('--avisos', $Avisos); Write-Host "    con avisos: $Avisos" }
  else { Write-Host '    sin avisos del día (lista vacía)' }
  & $Py @argsFirma
  if ($LASTEXITCODE -ne 0) { Fin 'El paquete NO se publicó: revisa los errores de arriba (fichas o avisos) y corrígelos en el Panel.' 1 }

  $manifest = Get-Content (Join-Path $Repo 'publicado\manifest.json') -Raw | ConvertFrom-Json
  $version = $manifest.version

  Write-Host "3/4 Guardando la versión $version…"
  git -C $Repo add publicado/manifest.json publicado/paquete.json publicado/avisos.json
  git -C $Repo diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Fin "La versión $version ya estaba publicada: no hay nada nuevo que subir." 0 }
  git -C $Repo commit -m "publicar: contenido del parque v$version" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fin 'No pude guardar el cambio en git. Avisa a soporte.' 1 }

  if ($SinPush) { Fin "Firmado y guardado (v$version), sin subir (-SinPush)." 0 }
  Write-Host '4/4 Subiendo a internet…'
  git -C $Repo push origin main
  if ($LASTEXITCODE -ne 0) { Fin 'No pude subir (¿sin internet?). Vuelve a hacer doble clic en Publicar cuando haya señal: no se pierde nada.' 1 }

  Fin "Listo: versión $version publicada. En 1-2 minutos todos los teléfonos con señal la reciben y la activan solos." 0
} catch {
  Fin "Algo falló: $($_.Exception.Message)" 1
}
