@echo off
rem Doble clic: publica el paquete exportado del Panel para todos los telefonos (docs/operacion-base.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1" %*
