# Mide el modelo local en el dispositivo Windows. UN SOLO COMANDO, sin red:
#   powershell -ExecutionPolicy Bypass -File herramientas\bench_dispositivo.ps1 [-Modelo q25-1.5b|q35-2b|q25-0.5b]
# Requiere el binario y el GGUF (servidor\iniciar.ps1 -Preparar, con internet, una vez).
# Imprime llama-bench (-p 64,256 -n 48), 5 preguntas de extremo a extremo (primera palabra y total) y RAM.
# Guarda todo en pruebas\bench-<equipo>-<fecha>.txt.
param(
  [ValidateSet('q25-1.5b', 'q35-2b', 'q25-0.5b', 'q35-0.8b')] [string]$Modelo = 'q25-1.5b',
  [string]$Raiz = "$env:USERPROFILE\espeletia-llm",
  [int]$Hilos = 0,
  [int]$Puerto = 8080
)
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$archivos = @{ 'q25-1.5b' = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'; 'q35-2b' = 'Qwen3.5-2B-Q4_K_M.gguf'; 'q25-0.5b' = 'qwen2.5-0.5b-instruct-q4_k_m.gguf'; 'q35-0.8b' = 'Qwen3.5-0.8B-Q4_K_M.gguf' }
$gguf = Join-Path $Raiz "gguf\$Modelo\$($archivos[$Modelo])"
$bin = Join-Path $Raiz 'bin\llama-b12738'
$salida = Join-Path $repo ("pruebas\bench-$env:COMPUTERNAME-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.txt')
Start-Transcript -Path $salida | Out-Null

function Show-Ram {
  $os = Get-CimInstance Win32_OperatingSystem
  '{0:N0} MB libres de {1:N0} MB' -f ($os.FreePhysicalMemory / 1KB), ($os.TotalVisibleMemorySize / 1KB)
}
$cpu = Get-CimInstance Win32_Processor
if ($Hilos -le 0) { $Hilos = [int](($cpu | Measure-Object NumberOfCores -Sum).Sum) }
"=== Fray · bench del dispositivo · $(Get-Date -Format s) ==="
"equipo: $env:COMPUTERNAME · $($cpu[0].Name) · núcleos $(($cpu | Measure-Object NumberOfCores -Sum).Sum) / lógicos $(($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum) · hilos usados $Hilos"
"modelo: $Modelo ($gguf)"
"--- RAM antes: $(Show-Ram)"
"(temperatura de CPU: Windows no la expone sin herramientas del fabricante; anótala con HWiNFO si está instalado)"

if ((Test-Path "$bin\llama-bench.exe") -and (Test-Path $gguf)) {
  ''; '=== llama-bench (pp = leer prompt, tg = generar; t/s) ==='
  & "$bin\llama-bench.exe" -m $gguf -t $Hilos -p '64,256' -n 48 -r 2 -ngl 0 2>$null | Where-Object { $_ -match '^\|' }
} else { "No hay llama-bench.exe o GGUF: corre servidor\iniciar.ps1 -Modelo $Modelo -Preparar" }

''; "=== 5 preguntas de extremo a extremo (llama-server 127.0.0.1:$Puerto) ==="
$proc = $null
try { Invoke-RestMethod "http://127.0.0.1:$Puerto/health" -TimeoutSec 2 | Out-Null } catch {
  $proc = Start-Process "$bin\llama-server.exe" -ArgumentList @('-m', "`"$gguf`"", '-t', $Hilos, '-c', 2048, '-np', 1, '-ngl', 0, '--host', '127.0.0.1', '--port', $Puerto, '--no-webui') -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 120; $i++) { try { Invoke-RestMethod "http://127.0.0.1:$Puerto/health" -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep 1 } }
}
"--- RAM con el modelo cargado: $(Show-Ram)"
$srv = Get-Process llama-server -ErrorAction SilentlyContinue | Select-Object -First 1
$cpu0 = if ($srv) { $srv.TotalProcessorTime.TotalSeconds } else { 0 }; $reloj = [Diagnostics.Stopwatch]::StartNew()
foreach ($f in Get-ChildItem (Join-Path $repo 'herramientas\bench_cuerpos\*.json') | Sort-Object Name) {
  $cuerpo = [IO.File]::ReadAllBytes($f.FullName)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-RestMethod "http://127.0.0.1:$Puerto/v1/chat/completions" -Method Post -ContentType 'application/json; charset=utf-8' -Body $cuerpo
  $sw.Stop()
  $t = $r.timings
  $primera = [int]($t.prompt_ms + ($(if ($t.predicted_n -gt 0) { $t.predicted_ms / $t.predicted_n } else { 0 })))
  $tgs = if ($t.predicted_ms -gt 0) { '{0:N1}' -f ($t.predicted_n * 1000 / $t.predicted_ms) } else { '-' }
  "$($f.BaseName): 1.ª palabra ≈ $primera ms · total $($sw.ElapsedMilliseconds) ms · prompt nuevo $($t.prompt_n) tok · generó $($t.predicted_n) tok a $tgs t/s"
  "    $($r.choices[0].message.content)"
}
if ($srv) { $srv.Refresh(); $logicos = ($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum
  "--- CPU media de llama-server durante las 5 preguntas: {0:N0} % del equipo (para docs/energia.md, método B)" -f (100 * ($srv.TotalProcessorTime.TotalSeconds - $cpu0) / ($reloj.Elapsed.TotalSeconds * $logicos)) }
"--- RAM tras las preguntas: $(Show-Ram)"
if ($proc) { Stop-Process -Id $proc.Id -Force }
Stop-Transcript | Out-Null
"Guardado en $salida"
