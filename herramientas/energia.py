"""Consumo y dimensionamiento solar de una estación de Fray (requisito 5 del reto).

Uso (sin red, solo Python estándar):
    python -X utf8 herramientas/energia.py                         # escenario por defecto (Raspberry Pi 5, valores SUPUESTOS)
    python -X utf8 herramientas/energia.py --reposo 3.1 --carga 7.4 --t-consulta 6.2 --medido
    python -X utf8 herramientas/energia.py --cpu-pct 85 --nominal 12   # sin medidor: potencia nominal x % de CPU medido
    python -X utf8 herramientas/energia.py --md > /tmp/tabla.md     # tabla en Markdown para docs/energia.md

Método (docs/energia.md):
  E_consulta [Wh] = (P_carga - P_reposo) * t_consulta / 3600         (energía extra de una consulta generada)
  E_dia [Wh]      = (P_reposo + P_pantalla) * horas_encendido + consultas_dia * E_consulta
  Batería [Wh]    = E_dia * dias_autonomia / (DoD * factor_frio * eficiencia)
  Panel [Wp]      = E_dia / (HSP * PR)                                (HSP = horas de sol pico, PR = rendimiento global)
Cada cifra se imprime con su origen: MEDIDO, ESTIMADO (calculado de algo medido) o SUPUESTO (hay que confirmarlo).
"""
import argparse, math

# Precios de referencia en COP: TODOS SUPUESTOS (orden de magnitud del mercado colombiano, no cotizados hoy).
PRECIOS = {
    'panel_por_wp': (1500, 'supuesto: ~COP 150.000 por un panel de 100 Wp'),
    'bateria_por_wh': (1500, 'supuesto: ~COP 950.000 por una LiFePO4 12,8 V 50 Ah (640 Wh)'),
    'controlador_mppt': (250000, 'supuesto: controlador MPPT 10-20 A con corte por baja temperatura'),
    'caja_y_cableado': (350000, 'supuesto: caja IP65, protecciones, cableado, soporte y aislamiento térmico de la batería'),
    'dispositivo': (650000, 'supuesto: Raspberry Pi 5 8 GB + fuente/conversor 5 V + SSD/microSD + carcasa'),
}
PANELES = [20, 30, 50, 100, 150, 200, 300, 400]
BATERIAS_AH = [6, 12, 20, 30, 50, 100, 150, 200]  # LiFePO4 12,8 V


def calcular(a):
    p_carga = a.carga
    origen_carga = 'MEDIDO' if a.medido else 'SUPUESTO'
    if a.cpu_pct is not None and a.nominal is not None:  # sin medidor: potencia nominal escalada por % de CPU medido
        p_carga = a.reposo + (a.nominal - a.reposo) * a.cpu_pct / 100
        origen_carga = f'ESTIMADO (reposo + (nominal {a.nominal} W - reposo) x {a.cpu_pct} % CPU)'
    consultas = a.visitantes * a.consultas_visitante
    e_consulta = (p_carga - a.reposo) * a.t_consulta / 3600
    e_base = (a.reposo + a.pantalla) * a.horas_encendido
    e_dia = e_base + consultas * e_consulta
    ocupacion = consultas * a.t_consulta / (a.horas_servicio * 3600)
    bat_wh = e_dia * a.autonomia / (a.dod * a.frio * a.eficiencia)
    panel_wp = e_dia * (1 + a.recarga) / (a.hsp * a.pr)
    panel = next((p for p in PANELES if p >= panel_wp), math.ceil(panel_wp / 100) * 100)
    bat_ah = next((b for b in BATERIAS_AH if b * 12.8 >= bat_wh), math.ceil(bat_wh / 12.8 / 50) * 50)
    costo = {
        'panel': panel * PRECIOS['panel_por_wp'][0],
        'bateria': bat_ah * 12.8 * PRECIOS['bateria_por_wh'][0],
        'controlador': PRECIOS['controlador_mppt'][0],
        'caja': PRECIOS['caja_y_cableado'][0],
        'dispositivo': PRECIOS['dispositivo'][0],
    }
    return dict(p_carga=p_carga, origen_carga=origen_carga, consultas=consultas, e_consulta=e_consulta, e_base=e_base,
                e_dia=e_dia, ocupacion=ocupacion, bat_wh=bat_wh, panel_wp=panel_wp, panel=panel, bat_ah=bat_ah,
                costo=costo, total=sum(costo.values()))


def cop(x):
    return 'COP ' + f'{x:,.0f}'.replace(',', '.')


def informe(a, r, md=False):
    o = 'MEDIDO' if a.medido else 'SUPUESTO (PENDIENTE: medir en el dispositivo)'
    filas = [
        ('Potencia en reposo (modelo cargado, esperando)', f'{a.reposo:.2f} W', o),
        ('Potencia durante una consulta', f'{r["p_carga"]:.2f} W', r['origen_carga'] if not a.medido else 'MEDIDO'),
        ('Pantalla o tableta del visitante', f'{a.pantalla:.2f} W', 'SUPUESTO' if a.pantalla else 'no incluida'),
        ('Duración de una consulta generada', f'{a.t_consulta:.1f} s', 'MEDIDO' if a.medido else 'SUPUESTO (PENDIENTE: bench_dispositivo)'),
        ('Energía extra por consulta', f'{r["e_consulta"] * 1000:.2f} mWh ({r["e_consulta"]:.4f} Wh)', 'ESTIMADO'),
        ('Visitantes por día (temporada alta)', f'{a.visitantes:,}'.replace(',', '.'), 'reto: transcripción de la explicación («pueden entrar 2200 personas»)'),
        ('Consultas generadas por visitante en esta estación', f'{a.consultas_visitante}', 'SUPUESTO'),
        ('Consultas por día en la estación', f'{r["consultas"]:,.0f}'.replace(',', '.'), 'ESTIMADO'),
        ('Horas encendido / de servicio', f'{a.horas_encendido} h / {a.horas_servicio} h', 'reto: horario 8:00-14:00 (+30 min de arranque)'),
        ('Ocupación del procesador por consultas', f'{r["ocupacion"] * 100:.0f} %', 'ESTIMADO' + (' — SATURADO: el resto queda en respuesta extractiva' if r['ocupacion'] > 1 else '')),
        ('Energía por día', f'{r["e_dia"]:.0f} Wh (base {r["e_base"]:.0f} + consultas {r["e_dia"] - r["e_base"]:.0f})', 'ESTIMADO'),
        ('Horas de sol pico (HSP)', f'{a.hsp} h', 'SUPUESTO conservador (verificar en el Atlas de Radiación Solar de Colombia, IDEAM-UPME)'),
        ('Rendimiento global del sistema solar (PR)', f'{a.pr}', 'SUPUESTO (escarcha, nubes, suciedad, MPPT)'),
        ('Días de autonomía sin sol', f'{a.autonomia}', 'SUPUESTO'),
        ('Batería LiFePO4: DoD · factor de frío · eficiencia', f'{a.dod} · {a.frio} · {a.eficiencia}', 'SUPUESTO (LiFePO4 pierde capacidad bajo 0 °C y no debe cargarse bajo 0 °C)'),
        ('Panel necesario', f'{r["panel_wp"]:.0f} Wp → panel de {r["panel"]} Wp', 'ESTIMADO'),
        ('Batería necesaria', f'{r["bat_wh"]:.0f} Wh → LiFePO4 12,8 V {r["bat_ah"]} Ah ({r["bat_ah"] * 12.8:.0f} Wh)', 'ESTIMADO'),
    ]
    costos = [
        ('Panel', r['costo']['panel'], PRECIOS['panel_por_wp'][1]),
        ('Batería', r['costo']['bateria'], PRECIOS['bateria_por_wh'][1]),
        ('Controlador', r['costo']['controlador'], PRECIOS['controlador_mppt'][1]),
        ('Caja, protecciones y cableado', r['costo']['caja'], PRECIOS['caja_y_cableado'][1]),
        ('Dispositivo', r['costo']['dispositivo'], PRECIOS['dispositivo'][1]),
    ]
    if md:
        out = ['| Concepto | Valor | Origen |', '|---|---|---|'] + [f'| {a_} | {b} | {c} |' for a_, b, c in filas]
        out += ['', '| Costo por estación | COP | Origen |', '|---|---|---|'] + [f'| {a_} | {cop(b)} | {c} |' for a_, b, c in costos]
        out += [f'| **Total** | **{cop(r["total"])}** | estimado con precios supuestos |']
        return '\n'.join(out)
    w = max(len(f[0]) for f in filas + costos)
    out = [f'{a_:<{w}}  {b:<45} [{c}]' for a_, b, c in filas] + ['']
    out += [f'{a_:<{w}}  {cop(b):<45} [{c}]' for a_, b, c in costos] + [f'{"TOTAL por estación":<{w}}  {cop(r["total"])}']
    return '\n'.join(out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--reposo', type=float, default=3.0, help='W en reposo con el modelo cargado (supuesto Pi 5: 3,0)')
    p.add_argument('--carga', type=float, default=7.5, help='W durante la generación (supuesto Pi 5 con 4 núcleos: 7,5)')
    p.add_argument('--nominal', type=float, help='W nominal máximo del dispositivo (si no hay medidor)')
    p.add_argument('--cpu-pct', type=float, help='%% de CPU medido durante una consulta (si no hay medidor)')
    p.add_argument('--pantalla', type=float, default=0.0, help='W de pantalla o tableta (0 = no incluida)')
    p.add_argument('--t-consulta', type=float, default=8.0, help='s de una consulta generada (supuesto Pi 5: 8)')
    p.add_argument('--medido', action='store_true', help='marca reposo, carga y t-consulta como MEDIDOS')
    p.add_argument('--visitantes', type=int, default=2200)
    p.add_argument('--consultas-visitante', type=float, default=0.5, help='consultas generadas por visitante en la estación')
    p.add_argument('--horas-encendido', type=float, default=6.5)
    p.add_argument('--horas-servicio', type=float, default=6.0)
    p.add_argument('--hsp', type=float, default=3.0)
    p.add_argument('--pr', type=float, default=0.6)
    p.add_argument('--recarga', type=float, default=0.2, help='margen para recargar la batería tras días nublados')
    p.add_argument('--autonomia', type=float, default=2.0)
    p.add_argument('--dod', type=float, default=0.8)
    p.add_argument('--frio', type=float, default=0.8)
    p.add_argument('--eficiencia', type=float, default=0.9)
    p.add_argument('--md', action='store_true')
    a = p.parse_args()
    print(informe(a, calcular(a), md=a.md))


if __name__ == '__main__':
    main()
