# Arranca el modelo local de Fray en Windows (x64 o ARM64): llama-server en 127.0.0.1:8080, solo CPU.
#
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1                     # Qwen2.5-1.5B (por defecto)
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -Modelo q35-2b      # Qwen3.5-2B (mejor calidad, más lento)
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -App .              # además sirve la app en http://127.0.0.1:8080/
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -Preparar           # CON INTERNET, una vez: baja binario y GGUF
#
# Sin -Preparar no usa la red. Busca el binario y el GGUF en -Raiz (por defecto %USERPROFILE%\espeletia-llm, la carpeta
# que ya existe en el PC del equipo) y verifica el SHA-256 del GGUF antes de arrancar.
param(
  [ValidateSet('q25-1.5b', 'q35-2b', 'q25-0.5b')] [string]$Modelo = 'q25-1.5b',
  [string]$Raiz = "$env:USERPROFILE\espeletia-llm",
  [int]$Hilos = 0,
  [int]$Puerto = 8080,
  [int]$Contexto = 2048,
  [string]$App = '',
  [switch]$Preparar,
  [switch]$SinVerificar
)
$ErrorActionPreference = 'Stop'
$Build = 'b12738'
$Modelos = @{
  'q25-1.5b' = @{ repo = 'Qwen/Qwen2.5-1.5B-Instruct-GGUF'; archivo = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'; sha = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e' }
  'q35-2b'   = @{ repo = 'unsloth/Qwen3.5-2B-GGUF'; archivo = 'Qwen3.5-2B-Q4_K_M.gguf'; sha = 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223' }
  'q25-0.5b' = @{ repo = 'Qwen/Qwen2.5-0.5B-Instruct-GGUF'; archivo = 'qwen2.5-0.5b-instruct-q4_k_m.gguf'; sha = '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db' }
}
$Zips = @{
  'x64'   = @{ nombre = "llama-$Build-bin-win-cpu-x64.zip";   sha = '9628c89dee398631ea70cadcde904e7c8eb0b411415e4188e08bc8ab99c628a1' }
  'arm64' = @{ nombre = "llama-$Build-bin-win-cpu-arm64.zip"; sha = 'b5086b984d2e5988fed46dcd5caf972d8735097cc3d4f54e56e94937633995f4' }
}
$m = $Modelos[$Modelo]
$arq = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$bin = Join-Path $Raiz "bin\llama-$Build"
$gguf = Join-Path $Raiz "gguf\$Modelo\$($m.archivo)"

function Test-Sha($ruta, $sha) { (Get-FileHash -Algorithm SHA256 $ruta).Hash.ToLower() -eq $sha }

if ($Preparar) {
  New-Item -ItemType Directory -Force (Join-Path $Raiz 'bin'), (Split-Path $gguf) | Out-Null
  if (-not (Test-Path "$bin\llama-server.exe")) {
    $z = $Zips[$arq]; $zip = Join-Path $Raiz "bin\$($z.nombre)"
    Write-Host "Bajando $($z.nombre)…"
    Invoke-WebRequest "https://github.com/ggml-org/llama.cpp/releases/download/$Build/$($z.nombre)" -OutFile $zip
    if (-not (Test-Sha $zip $z.sha)) { throw "SHA-256 del binario no coincide: $zip" }
    Expand-Archive $zip -DestinationPath $bin -Force
  }
  if (-not (Test-Path $gguf)) {
    Write-Host "Bajando $($m.archivo) (≈1 GB)…"
    Invoke-WebRequest "https://huggingface.co/$($m.repo)/resolve/main/$($m.archivo)" -OutFile $gguf
  }
  if (-not (Test-Sha $gguf $m.sha)) { throw "SHA-256 del GGUF no coincide: $gguf" }
  Write-Host "Listo. Ya puedes desconectar la red y correr este script sin -Preparar."
  exit 0
}

if (-not (Test-Path "$bin\llama-server.exe")) { throw "No está $bin\llama-server.exe. Corre una vez con -Preparar (con internet) o copia la carpeta bin." }
if (-not (Test-Path $gguf)) { throw "No está $gguf. Corre una vez con -Preparar o copia el GGUF ahí." }
if (-not $SinVerificar) {
  Write-Host "Verificando SHA-256 de $($m.archivo)…"
  if (-not (Test-Sha $gguf $m.sha)) { throw "SHA-256 del GGUF no coincide (archivo dañado o distinto)." }
}
if ($Hilos -le 0) { $Hilos = [int]((Get-CimInstance Win32_Processor | Measure-Object NumberOfCores -Sum).Sum); if ($Hilos -le 0) { $Hilos = 4 } }

$argv = @('-m', $gguf, '-t', $Hilos, '-c', $Contexto, '-np', '1', '-ngl', '0', '--host', '127.0.0.1', '--port', $Puerto, '--jinja')
if ($App) { $argv += @('--path', (Resolve-Path $App).Path) } else { $argv += '--no-webui' }
Write-Host "llama-server $Modelo · $Hilos hilos (núcleos físicos) · contexto $Contexto · http://127.0.0.1:$Puerto"
Write-Host "Prueba: curl http://127.0.0.1:$Puerto/health   ·   Ctrl+C para parar"
& "$bin\llama-server.exe" @argv
