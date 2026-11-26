# AGENTS.md · Fray, guía de páramo sin señal

Reto UTON «Guía de páramo sin señal» (hackatón del 26-nov-2026). Reglas que no se deducen del código.

## Lo que nunca se rompe
- **Cero red en la demostración.** Ningún `fetch` a otro origen, CDN, analítica ni API. Las librerías van en `lib/`. Solo se permite
  `127.0.0.1` (el servidor local del modelo, si existe).
- **Solo se responde con los dos guiones** (`fuentes/guion-uton-2024.pdf` y `fuentes/guion-zona-norte.pdf`) a través de
  `contenido/paquete.json`. **Cada respuesta lleva guion y página.** Si no hay respaldo, la respuesta es la abstención:
  «No tengo esa información en los guiones oficiales; pregúntale a tu guía o al personal del parque».
- **Información cambiante → personal del parque, siempre:** estado o alerta del volcán, clima de hoy, acceso, horarios vigentes y
  salud. **Aunque el guion lo diga** (el guion zona norte p. 7 menciona un nivel de alerta: esa frase está bloqueada).
- **Nunca se diagnostica ni se receta, ni se dice que algo se come.** Síntomas o emergencias → «avisa a tu guía». Estas reglas son
  deterministas (carril crítico) y **prevalecen sobre la búsqueda y sobre el modelo generativo**.
- **Relato no es ciencia.** Las fichas `tipo: relato` se presentan como tradición oral o atribución. Si los guiones difieren
  (p. ej. el significado de Kumanday), la respuesta muestra las dos versiones con sus páginas.
- **El modelo generativo es opcional y nunca tiene la última palabra:** reescribe la respuesta extractiva; el verificador la
  revisa; si falla o tarda más de N s, queda el texto del guion.
- **El guía va en el centro.** El asistente explica; el personal decide sobre seguridad y recorrido.

## Confidencialidad
- El repo es **privado**: el contenido oficial solo se usa para el reto. Nada de `fuentes/` ni `contenido/` en despliegues públicos
  (ver `.vercelignore`; si se despliega en Vercel, con protección de acceso).
- Sin PIN, claves ni datos personales en el repo. No se recogen datos de visitantes.

## Trabajo
- Ramas `juan/<tema>` y `eduardo/<tema>` (o `agente/<tema>`), PR contra `main`, commits pequeños en español.
- Contrato entre interfaz y motor: `docs/contrato.md`. Si lo cambias, avisa al otro rol en el PR.
- Decisiones: `docs/decisiones/`. Roles: `docs/roles.md`. Cumplimiento del reto: `docs/cumplimiento.md`.
- Windows: `python -X utf8 …`. Archivos grandes (GGUF, venvs, APK) fuera del repo.
