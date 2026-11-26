# Junta el registro de la prueba de Fray desde el teléfono conectado por USB (sin red: adb y 127.0.0.1).
#   powershell -ExecutionPolicy Bypass -File herramientas\registros_adb.ps1 [-Serial xw55eajnzhvw5xgm] [-Probar "hola|¿qué es la gelifracción?"]
# Lee IndexedDB por el DevTools del WebView, las líneas FRAYLOG de `adb logcat -d` y el último /sdcard/Download/fray-registro-*.json.
# Salida: pruebas\registros\registro-<fecha>.json y .md. La lógica está en herramientas\registros_adb.mjs (node 22 o más nuevo).
param(
  [string]$Serial = $env:ANDROID_SERIAL,
  [string]$Paquete = 'co.fray.paramo',
  [string]$Probar = '',
  [int]$Puerto = 9222
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\sdk\platform-tools'
  if (Test-Path (Join-Path $sdk 'adb.exe')) { $env:PATH = "$sdk;$env:PATH" } else { throw 'No encuentro adb (instala platform-tools del SDK de Android).' }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Falta node (22 o más nuevo).' }
$a = @((Join-Path $PSScriptRoot 'registros_adb.mjs'), '--paquete', $Paquete, '--puerto', $Puerto)
if ($Serial) { $a += @('--serial', $Serial) }
if ($Probar) { $a += @('--probar', $Probar) }
& node @a
exit $LASTEXITCODE
