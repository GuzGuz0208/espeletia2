# Energía y costo por estación (requisito 5)

> El reto: «sea viable en una estación de alta montaña con un consumo de energía que permita alimentarlo de forma autónoma… arriba
> no hay conexión a electricidad». Y en la explicación: «en temporada alta… pueden entrar 2200 personas… tienen que pasar por cada
> dispositivo» (fuentes/transcripcion-reto-2.txt).

**Estado (26-nov, mañana):** método y calculadora listos (`herramientas/energia.py`). **Ninguna potencia está medida todavía**:
todo lo que dice SUPUESTO o PENDIENTE se reemplaza con la medición en el dispositivo de la organización.

## Por qué el consumo es bajo por diseño
1. **La respuesta del guion es extractiva**: la búsqueda (e5-small en el navegador) cuesta milisegundos. El LLM solo reescribe.
2. **El LLM es opcional y se apaga solo bajo carga**: si la cola crece o el tiempo pasa de `timeoutMs`, queda el texto del guion.
   Con 2.200 visitantes no hace falta generar para todos; la energía por consulta extractiva es despreciable frente al reposo.
3. **Prompt del sistema en caché** (`cache_prompt`): cada pregunta procesa solo ~40-60 tokens nuevos (medido ayer: de ~180 a ~90).
4. **Respuesta corta** (`max_tokens 70`) y temperatura 0.

## Método de medición (en el dispositivo, ~15 min)
**A. Con medidor USB-C en línea** (preferido; p. ej. medidor USB-C PD con pantalla de W y Wh):
1. Dispositivo encendido, `servidor/iniciar.(sh|ps1)` corriendo, sin consultas, pantalla como en la demo → anotar **P_reposo** (W)
   tras 2 min estable.
2. Correr `bash herramientas/bench_dispositivo.sh` (o el `.ps1`) → durante las 5 preguntas anotar **P_carga** (W, el valor típico,
   no el pico) y del informe del bench **t_consulta** (total mediano en s).
3. Opcional, más exacto: poner a cero el contador de Wh del medidor, correr 20 consultas, leer Wh/20 = **Wh por consulta** (incluye
   reposo durante la consulta).
4. `python -X utf8 herramientas/energia.py --reposo P_reposo --carga P_carga --t-consulta t --medido`

**B. Sin medidor** (estimación, marcarla como tal):
1. Potencia nominal del dispositivo de la ficha del fabricante (W máximos) y reposo típico de la ficha o de una fuente citada.
2. % de CPU durante una consulta: Linux `top -b -n 5 -d 1 | grep llama-server`; Windows Administrador de tareas (o
   `1..10 | % { (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime; sleep 1 }`;
   `Get-Counter` falla en Windows en español porque el nombre del contador está traducido) mientras corre el bench.
3. `python -X utf8 herramientas/energia.py --reposo R --nominal N --cpu-pct C --t-consulta t`
   (P_carga = R + (N − R) × C/100). En laptops con batería: alternativa `powercfg /batteryreport` antes y después de 100 consultas.

## Fórmulas (las aplica `herramientas/energia.py`)
- E_consulta [Wh] = (P_carga − P_reposo) × t_consulta / 3600
- E_día [Wh] = (P_reposo + P_pantalla) × horas_encendido + consultas_día × E_consulta
- consultas_día = 2.200 visitantes × consultas generadas por visitante en la estación (supuesto 0,5: grupos de 8 con guía)
- Ocupación = consultas_día × t_consulta / (6 h × 3600). Si pasa de 100 %, el resto se atiende con la respuesta extractiva.
- Batería [Wh] = E_día × días de autonomía / (DoD × factor de frío × eficiencia)
- Panel [Wp] = E_día × (1 + margen de recarga) / (HSP × PR)

## Escenario por defecto: Raspberry Pi 5 con Qwen2.5-1.5B (TODO SUPUESTO hasta medir)
`python -X utf8 herramientas/energia.py --md`

| Concepto | Valor | Origen |
|---|---|---|
| Potencia en reposo (modelo cargado, esperando) | 3.00 W | SUPUESTO (PENDIENTE: medir en el dispositivo) |
| Potencia durante una consulta | 7.50 W | SUPUESTO |
| Pantalla o tableta del visitante | 0.00 W | no incluida |
| Duración de una consulta generada | 8.0 s | SUPUESTO (PENDIENTE: bench_dispositivo) |
| Energía extra por consulta | 10.00 mWh (0.0100 Wh) | ESTIMADO |
| Visitantes por día (temporada alta) | 2.200 | reto: transcripción de la explicación («pueden entrar 2200 personas») |
| Consultas generadas por visitante en esta estación | 0.5 | SUPUESTO |
| Consultas por día en la estación | 1.100 | ESTIMADO |
| Horas encendido / de servicio | 6.5 h / 6.0 h | reto: horario 8:00-14:00 (+30 min de arranque) |
| Ocupación del procesador por consultas | 41 % | ESTIMADO |
| Energía por día | 30 Wh (base 20 + consultas 11) | ESTIMADO |
| Horas de sol pico (HSP) | 3.0 h | SUPUESTO conservador (verificar en el Atlas de Radiación Solar de Colombia, IDEAM-UPME) |
| Rendimiento global del sistema solar (PR) | 0.6 | SUPUESTO (escarcha, nubes, suciedad, MPPT) |
| Días de autonomía sin sol | 2.0 | SUPUESTO |
| Batería LiFePO4: DoD · factor de frío · eficiencia | 0.8 · 0.8 · 0.9 | SUPUESTO (LiFePO4 pierde capacidad bajo 0 °C y no debe cargarse bajo 0 °C) |
| Panel necesario | 20 Wp → panel de 30 Wp | ESTIMADO |
| Batería necesaria | 106 Wh → LiFePO4 12,8 V 12 Ah (154 Wh) | ESTIMADO |

| Costo por estación | COP | Origen |
|---|---|---|
| Panel | COP 45.000 | supuesto: ~COP 150.000 por un panel de 100 Wp |
| Batería | COP 230.400 | supuesto: ~COP 950.000 por una LiFePO4 12,8 V 50 Ah (640 Wh) |
| Controlador | COP 250.000 | supuesto: controlador MPPT 10-20 A con corte por baja temperatura |
| Caja, protecciones y cableado | COP 350.000 | supuesto: caja IP65, protecciones, cableado, soporte y aislamiento térmico de la batería |
| Dispositivo | COP 650.000 | supuesto: Raspberry Pi 5 8 GB + fuente/conversor 5 V + SSD/microSD + carcasa |
| **Total** | **COP 1.525.400** | estimado con precios supuestos |

**Lectura:** aun con supuestos holgados, una estación con una placa tipo Raspberry Pi consume del orden de **decenas de Wh al día**,
dominados por el **reposo** (no por las consultas). Un panel de 30-50 Wp y una LiFePO4 de 12-20 Ah bastan; la pantalla, si la hay,
puede duplicar el consumo (`--pantalla 3`). Una **laptop** (reposo ~10-15 W, carga ~35-45 W, supuestos) multiplica todo por ~5:
`python -X utf8 herramientas/energia.py --reposo 12 --carga 40 --t-consulta 3`.

## Alta montaña (4.000+ m): lo que cambia el dimensionamiento
- **Frío:** la LiFePO4 entrega menos capacidad bajo 0 °C (factor 0,8 supuesto) y **no se debe cargar bajo 0 °C**: usar BMS con
  corte de carga por baja temperatura o batería con calefacción autorregulada, y caja aislada. El panel rinde mejor en frío, pero
  la escarcha y la nieve lo tapan (PR 0,6 supuesto).
- **Irradiación:** HSP 3,0 h es un valor **conservador supuesto** para la zona andina nublada; el valor de diseño debe salir del
  Atlas de Radiación Solar, Ultravioleta y Ozono de Colombia (IDEAM-UPME) para el municipio, con el mes más desfavorable.
- **Autonomía:** 2 días sin sol (supuesto); el parque puede subir las baterías cargadas desde Brisas como respaldo.
- **Altitud:** sin ventiladores de alto consumo; la Pi 5 a 4 hilos necesita disipador (el aire es menos denso: menos convección).

## Pendiente (en el dispositivo)
- [ ] P_reposo y P_carga medidos (medidor USB-C) o estimados con % de CPU (método B), con el modelo elegido.
- [ ] t_consulta del bench (`pruebas/bench-<host>-<fecha>.txt`).
- [ ] Volver a correr `energia.py --medido` y pegar la tabla aquí y en la ficha de 1 página.
- [ ] Cotizar panel, batería y controlador (los precios de arriba son supuestos).
