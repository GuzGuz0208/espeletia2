# Licencias del modelo local (generador)

Ni los binarios ni los GGUF están en el repo: se bajan con `servidor/iniciar.(ps1|sh) preparar` y se verifican por SHA-256.

| Componente | Uso | Licencia | Texto |
|---|---|---|---|
| llama.cpp b12738 (ggml-org) — `llama-server`, `llama-bench` | servidor local del modelo en 127.0.0.1 | MIT | llama.cpp-MIT.txt |
| Qwen2.5-1.5B-Instruct y Qwen2.5-0.5B-Instruct (Qwen; GGUF oficial `Qwen/Qwen2.5-*-Instruct-GGUF`) | reescritura de la respuesta extractiva | Apache-2.0 | Qwen-Apache-2.0.txt |
| Qwen3.5-2B (Qwen; GGUF de `unsloth/Qwen3.5-2B-GGUF`) | alternativa de mejor calidad | Apache-2.0 | Qwen-Apache-2.0.txt |

Licencias verificadas el 25-nov-2026 en la model card de Hugging Face (campo `license`); ver `laboratorio/resultados-llm-pc.md`
del repo anterior (espeletia-ai). El zip de Windows de llama.cpp trae además `LICENSE-LLVM-OpenMP` (libomp).
