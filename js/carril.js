// Carril crítico de Fray: reglas deterministas de seguridad que PREVALECEN sobre la búsqueda y sobre el modelo generativo.
// Copia exacta en herramientas/fray_py.py (CARRIL). herramientas/paridad.py ejecuta este archivo con node sobre todas las
// frases de prueba y exige diferencia 0 con Python. Si cambias una regla aquí, cámbiala allá.
//
// Cómo evita los fallos del banco ciego del 25-nov:
// - El texto se NORMALIZA igual en JS y en Python antes de aplicar patrones: minúsculas, sin tildes (NFD sin marcas),
//   todo lo que no sea [a-z0-9] pasa a espacio y se colapsa; queda « palabra palabra » con un espacio a cada lado.
//   Así los patrones solo ven ASCII y `\b` significa lo mismo en los dos motores de expresiones regulares.
// - Las RAÍCES no llevan `\b` al final: `\bdesmay` casa «desmayo», «desmayó», «desmayada»; `\bpoison` casa «poisonous».
//   Solo las palabras completas cortas o ambiguas llevan `\b` a los dos lados.
// - Patrones sin tildes: «mareo», «vomito», «erupcion» (el texto ya llega sin tildes).
//
// ORDEN DE PRIORIDAD (se aplica la primera regla que case):
//   1. emergencia   — accidente, perdido, herido, desmayo, caída, sangre, hipotermia, no responde, no respira…
//   2. salud        — mal de altura, soroche, apunado, mareo, vómito, dolor, falta de aire, «qué tomo», medicamentos…
//   3. comer        — comer, probar, masticar, beber/tomar plantas, hongos, frutos o agua; venenoso, tóxico, medicinal
//   4. animales     — tocar, acariciar, alimentar o dar de comer a animales; tocar o arrancar plantas
//   5. volcan       — ESTADO del volcán hoy: alerta o semáforo, actividad en curso, ceniza, sismos, «¿va a hacer erupción?», peligro
//                     (los DATOS —altura del Ruiz, cráter Arenas, erupción de 1985, lahares, «¿es un volcán activo?», monitoreo— NO
//                     disparan: van al guion. «¿está activo HOY?» sí dispara.)
//   6. condiciones  — clima, acceso, horarios y cierres de HOY (lo que cambia), y «qué debo confirmar con el personal»
// La emergencia va primero porque es lo único urgente; salud antes que comer («comí una planta y me mareé» es salud).

export const MENSAJES = {
  emergencia: 'Esto puede ser una emergencia: avisa YA a tu guía o al personal del parque más cercano. No te separes del grupo, quédate en un lugar seguro y sigue sus indicaciones.',
  salud: 'No puedo dar consejos de salud ni recomendar medicamentos. Si tú o alguien del grupo se siente mal (mareo, dolor de cabeza, falta de aire, náuseas), avisa de inmediato a tu guía: él sabe qué hacer y cuándo descender.',
  comer: 'Por tu seguridad y la del páramo, no se come, no se prueba ni se arranca ninguna planta, fruto u hongo, ni se bebe agua de lagunas o quebradas. No puedo decirte si algo es comestible, tóxico o medicinal. Pregúntale a tu guía.',
  animales: 'No toques, persigas ni alimentes a los animales, y no toques ni arranques las plantas: obsérvalos a distancia y en silencio. Si tienes dudas, pregúntale a tu guía.',
  volcan: 'El estado y el nivel de alerta del volcán cambian y yo no los conozco. Pregúntale al personal del parque o a tu guía; la fuente oficial es el Servicio Geológico Colombiano.',
  condiciones: 'El clima, el acceso, los horarios y los cierres de hoy cambian y yo no los conozco. Pregúntale al personal del parque o a tu guía.',
};

// Palabras de apoyo (texto ya normalizado: sin tildes, minúsculas)
const PERSONA = '(?:nino|nina|ninos|ninas|hijo|hija|hijos|persona|alguien|amig[oa]s?|companer[oa]s?|turista|visitante|senor|senora|papa|mama|abuel[oa]|herman[oa]|espos[oa]|novi[oa]|guia|bebe)';
const ANIMAL = '(?:animal|animales|oso|osos|danta|dantas|tapir|venado|venados|ciervo|aves?|pajaro|pajaros|pajarito|pajaritos|colibri|condor|aguila|puma|zorro|conejo|raton|ratones|roedor|insecto|mariposa|lagartija|rana|sapo|perro|perros|gato|caballo|vaca|culebra|serpiente|pato|patos|curi|tigrillo|comadreja|bird|animals?)';
const PLANTA = '(?:planta|plantas|hongo|hongos|seta|setas|fruto|frutos|fruta|frutas|baya|bayas|mora|moras|hoja|hojas|flor|flores|frailejon|frailejones|semilla|semillas|raiz|raices|musgo|musgos|liquen|liquenes|hierba|hierbas|yerba|mortino|mortinos|plant|plants|mushroom|berry|berries)';
const VOLCAN = '(?:volcan|volcanes|ruiz|kumanday|crater|arenas|nevado|volcano)';
const HOY = '(?:hoy|ahora|ahorita|actualmente|en este momento|en estos dias|esta semana|today|now|right now|currently|tonight|tomorrow)';
const HOY_V = '(?:hoy|ahora|ahorita|en este momento|en estos dias|today|now|right now)';

// Cada regla: { id, si: [patrones], salvo: [patrones] }. Casa si algún `si` casa y ningún `salvo` casa.
export const REGLAS = [
  {
    id: 'emergencia',
    si: [
      '\\b(auxilio|socorro|emergencia|emergency|sos)\\b',
      '\\baccident', '\\bherid[oa]', '\\bherida', '\\blesionad', '\\bdesmay', '\\bdesvaneci', '\\binconscien', '\\bhipoterm',
      '\\bconvulsi', '\\b(es|tiene|tengo|tenga) una fractura', '\\bfractura (de|en) (la |el |mi |su )?(pierna|brazo|tobillo|mano|pie|muneca|cadera|costilla|hueso|craneo|rodilla|espalda)','\\bsangr', '\\bhemorragi', '\\binfarto', '\\bataque (al corazon|cardiaco|de asma|de panico)',
      '\\bno (responde|reacciona|respira|se mueve|despierta)', '\\bno puede (respirar|moverse|caminar|levantarse)', '\\bno puedo respirar',
      '\\b(me|nos) (cai|caimos|caigo|resbale|resbalamos|desmaye|perdi|perdimos|golpee|golpeamos|torci|rompi|quebre|fracture|lastime|heri|corte|cortamos)\\b',
      '\\bse (cayo|cayeron|ha caido|han caido|resbalo|desmayo|golpeo|torcio|fracturo|lastimo|hirio)\\b',
      '\\bse (rompio|quebro|partio|lastimo|torcio) (el|la|un|una|mi|su) (pierna|brazo|tobillo|mano|pie|muneca|cabeza|hueso|rodilla|cadera|costilla|espalda)',
      '\\b(sufrio|tuvo|tiene) una caida', '\\bcaida (fuerte|grave|de un|de una|de mi|de el)\\b',
      '\\b(estoy|estamos|esta|estan|anda|andan|quede|quedamos|quedo) (perdid|extraviad|desorientad|atrapad|herid)',
      PERSONA + ' (esta |se )?(perdid|extraviad)', PERSONA + ' (se )?(perdio|extravio|desaparecio|no aparece|no vuelve|no regresa)',
      '\\b(se|ha|han) (perdido|perdio|extraviado|extravio|desaparecido|desaparecio) (mi|un|una|el|la|nuestro|nuestra|su) ' + PERSONA,
'\\bperdid[oa]s? (en|por) (el|la) (paramo|camino|sendero|niebla|montana|nevado)',
      '\\bno (encuentro|encontramos|vemos|veo) a\\b', '\\bse (me|nos) perdio', '\\bextravi',
      '\\b(golpe|golpeo|golpee) (en|la|su|mi) cabeza', '\\b(lo|la|me|nos) (pico|mordio|ataco) ',
      '\\bayuda urgente\\b', '\\bnecesito ayuda\\b', '\\bhelp\\b', '\\binjur', '\\bhurt\\b', '\\bbleed', '\\bfaint', '\\bunconscious',
      '\\bpassed out\\b', '\\b(i|we|he|she) (am|are|is|got|get) lost\\b', '\\b(fell|fallen)\\b', '\\bnot breathing\\b', '\\bhypotherm',
      '\\bme duele (mucho|el pecho)\\b', '\\bdolor (de|en el) pecho\\b',
    ],
    salvo: [],
  },
  {
    id: 'salud',
    si: [
      '\\bmal de (altura|montana|paramo|la altura|la montana|paramo)', '\\b(enfermedad|enfermedades) de (la )?(altura|montana)',
      '\\bsoroch', '\\bapunad', '\\bapunamiento', '\\bmare(o|os|ad[oa]s?|a|an|arse|arme|ar)\\b', '\\bmareand', '\\bme maree\\b', '\\bvomit', '\\bvomi',
      '\\bnausea', '\\bganas de vomitar', '\\bdolor de (cabeza|estomago|oido|oidos|barriga|pecho)', '\\bjaqueca', '\\bmigrana',
      '\\bme duele', '\\ble duele', '\\bles duele', '\\b(me|le|nos) (siento|sente|sentimos|siente|sienten) (mal|raro|rara|debil|enferm)',
      '\\bme siento (muy )?(mal|raro|rara|debil|cansad|enferm|marea)', '\\bse siente (mal|raro|rara|debil|enferm)',
      '\\b(falta|faltaba|faltando) (de )?(el )?aire', '\\bme falta (el )?aire', '\\b(me|le) cuesta respirar', '\\bdificultad (para|al) respirar',
      '\\bahog', '\\bsin aire\\b', '\\bsin aliento\\b', '\\bpresion (arterial|alta|baja)', '\\bhipertens', '\\bembarazad', '\\basma',
      '\\bfiebre', '\\bdiarrea', '\\bsintoma', '\\b(enfermo|enferma|enfermos|enfermas|me enferme|se enfermo|nos enfermamos)\\b', '\\bsangrado de nariz',
      '\\bque (me )?(tomo|tomamos|debo tomar|puedo tomar|le doy|le damos|recomiendas tomar|recomienda tomar)\\b', '\\bque (tomar|tomo|me tomo) para\\b',
      '\\bmedicament', '\\bmedicinas?\\b', '\\bpastilla', '\\bpasta para\\b', '\\bacetaminofen', '\\bibuprofen', '\\baspirina', '\\bdolex\\b', '\\bdiamox\\b', '\\bacetazolamid',
      '\\b(hoja|hojas|mate|te) de coca\\b', '\\boxigeno (para|si|cuando|embotellado|en lata)', '\\b(tanque|bala|botella) de oxigeno',
      '\\b(la altura|la altitud) (me|nos|le|les|te) (afecta|da|hace|pega|marea)', '\\b(afecta|afectar|efectos?|efecto) (de )?(la )?(altura|altitud)\\b.*\\b(cuerpo|salud|persona|me|nos)\\b',
      '\\btratamiento', '\\bprimeros auxilios', '\\b(como|que) (se )?(cura|curo|alivio|calmo)\\b',
      '\\baltitude sickness', '\\bheadache', '\\bdizzy', '\\bnause', '\\bvomit', '\\bshort(ness)? of breath', '\\bmedicine', '\\bmedication', '\\bpills?\\b', '\\bsick\\b',
    ],
    salvo: [],
  },
  {
    id: 'comer',
    si: [
      '\\bcomestible', '\\bcomible', '\\bse (puede |pueden )?(come|comen|comer|mastica|chupa|bebe|beber)\\b',
      '\\b(puedo|podemos|puede|pueden|podria|podriamos|debo|deberia|se puede|es bueno|es seguro|es peligroso) (comer|probar|masticar|chupar|lamer|beber|comerme|comerla|comerlo|probarla|probarlo)',
      '\\b(puedo|podemos|se puede|es bueno|es seguro) tomar (agua|el agua|del agua|te|infusion|aromatica|de esa|de esta|de la|del|de ese|de este)\\b',
      '\\bcomer(me|la|lo|las|los|se|te)\\b', '\\b(me|lo|la|los|las) (como|comi|pruebo|probe|mastico|chupo|bebo)\\b',
      '\\bmastica', '\\bmastico', '\\bchupar', '\\bprobar(la|lo|las|los)?\\b', '\\bpruebo\\b',
      '\\bvenen', '\\btoxic', '\\bmedicinal', '\\balucin', '\\bpsicoactiv', '\\bpropiedades (curativas|medicinales)', '\\bsirve (para|como) (curar|remedio|medicina|sanar|aliviar)',
      '\\bremedio', '\\b(cura|curar|sana|sanar) (el|la|los|las|para)\\b', '\\binfusion', '\\baromatica', '\\b(te|agua|bebida) de (frailejon|hoja|hojas|planta|plantas|hierba|flor)',
      '\\b(tomar|beber|tomarse|tomarme|tomo|bebo|se toma|se bebe|puedo tomar|puedo beber) (el |del |de la |de )?agua (de|del|en)\\b', '\\b(agua|aguas) (de la laguna|del rio|de la quebrada|del nacimiento) (es|se) (potable|puede)', '\\bpotable',
      '\\b(comer|come|comen|probar|masticar) (un |una |el |la |los |las |esa |ese |esta |este |esas |esos |estos |estas )?' + PLANTA,
      PLANTA + ' (se )?(puede|pueden|es|son) (comer|comestibles?|probar|venenos|toxic|medicinal)',
      '\\bedible', '\\bcan (i|we|you) (eat|drink|taste)\\b', '\\beat (it|this|that|the|these|those)\\b', '\\bpoison', '\\btoxic', '\\bdrink the water\\b',
    ],
    // «¿qué comen los osos?» es un dato de fauna, no una pregunta de comer: sin persona del visitante, no dispara
    salvo: [
      '^(?!.*\\b(puedo|podemos|se puede|se pueden|me|nos|yo|uno|debo|deberia|es bueno|es seguro|comestible|comible|venen|toxic|medicinal|alucin|remedio|cura|infusion|potable|edible|poison|can i|can we)\\b).*\\b' + ANIMAL + '\\b.*\\b(come|comen|comer|alimenta|alimentan|se alimenta|se alimentan|dieta)\\b',
      '^(?!.*\\b(puedo|podemos|se puede|se pueden|me|nos|yo|uno|debo|deberia|es bueno|es seguro|comestible|comible|venen|toxic|medicinal|alucin|remedio|cura|infusion|potable|edible|poison|can i|can we)\\b).*\\b(come|comen|comer|alimenta|alimentan|se alimenta|se alimentan|dieta)\\b.*\\b' + ANIMAL + '\\b',
    ],
  },
  {
    id: 'animales',
    si: [
      '\\b(tocar|toco|tocarlo|tocarla|tocarlos|tocarlas|tocamos|acariciar|acaricio|acariciarlo|acariciarla|agarrar|agarro|coger|cojo|cogerlo|cogerla|cargar|cargarlo|alzar|perseguir|persigo|atrapar|atrapo|abrazar|abrazo) (a )?(un |una |el |la |los |las |al |ese |esa |este |esta )?(' + ANIMAL.slice(3, -1) + '|' + PLANTA.slice(3, -1) + ')\\b',
      '\\b(lo|la|los|las) (puedo|podemos|se puede) (tocar|acariciar|agarrar|coger|alimentar|cargar)\\b', '\\b(puedo|podemos|se puede|se pueden) (tocar|acariciar|agarrar|alimentar|arrancar)(lo|la|los|las)?\\b',
      '\\b(alimentar|alimento|alimentarlo|alimentarla|alimentarlos|darle de comer|darles de comer|dar de comer|le doy de comer|les doy de comer|darle comida|darles comida|echarle comida|tirarle comida)\\b',
      '\\b(dar|darle|darles|doy|le doy|les doy|echar|echarle|tirar|tirarle) (pan|comida|galleta|galletas|fruta|mecato|semillas|maiz|arroz|papas) (a|al|a los|a las|a la)\\b',
      '\\b(arrancar|arranco|arrancarlo|arrancarla|cortar|corto|recoger|recojo|llevarme|me llevo) (un |una |el |la |los |las |ese |esa |este |esta )?' + PLANTA,
      '\\b(touch|pet|feed|hold) (the |a |an |this |that )?(' + ANIMAL.slice(3, -1) + '|' + PLANTA.slice(3, -1) + ')\\b', '\\bcan (i|we) (touch|pet|feed|pick)\\b',
    ],
    salvo: [
      // «¿de qué se alimenta el oso?» es un dato de fauna (no lleva al visitante como sujeto)
      '^(?!.*\\b(puedo|podemos|se puede|se pueden|darle|darles|dar de|doy|echar|echarle|tirar|tirarle|alimentarlo|alimentarla|alimentarlos|alimentar a|feed|can i|can we)\\b).*\\b(alimenta|alimentan|alimento|alimentar)\\b',
    ],
  },
  {
    id: 'volcan',
    si: [
      '\\b(nivel|niveles|estado|semaforo) de (alerta|actividad)', '\\balerta (volcanica|amarilla|naranja|roja|verde)', '\\bsemaforo volcanico',
      '\\balerta\\b.*\\b' + VOLCAN, '\\b' + VOLCAN + '\\b.*\\balerta\\b',
      '\\b' + VOLCAN + '\\b.*\\b' + HOY_V + '\\b', '\\b' + HOY_V + '\\b.*\\b' + VOLCAN + '\\b',
      // «¿el volcán está activo / apagado / dormido?» sin «hoy» es un DATO del guion (es un volcán activo): no dispara.
      // Sí disparan la actividad en curso, la predicción y el peligro de ir.
      '\\b(esta|sigue) (en erupcion|haciendo erupcion|botando ceniza|echando ceniza|emitiendo ceniza|echando humo|botando humo|expulsando ceniza|arrojando ceniza)',
      '\\b(esta|sigue|estara|anda) (activo|en actividad|despierto|peligroso|inestable) (hoy|ahora|ahorita|en este momento|estos dias|esta semana)\\b',
      '\\bactividad (volcanica actual|actual|reciente|de hoy|de estos dias)', '\\b(como|que tal) (esta|anda|amanecio) (el |hoy el )?' + VOLCAN,
      '\\b(va|van|vaya|esta por|esta a punto de) (a )?(explotar|estallar|hacer erupcion|erupcionar|entrar en erupcion|despertar)',
      '\\bcuando (va a|sera|habra|viene) (la )?(proxima |siguiente |otra |nueva )?(erupcion|explosion)', '\\b(proxima|siguiente|nueva|otra) (erupcion|explosion)',
      '\\b(hay|habra|cae|esta cayendo|caera|cayendo) (ceniza|cenizas|una erupcion|alerta)\\b',
      '\\b(caida|lluvia|nube) de ceniza', '\\bceniza(s)? (hoy|ahora)\\b', '\\b(hubo|hay|habra|senti|sentimos|se sintio|se siente) (un |una )?(sismo|temblor|temblores|sismos)\\b', '\\besta temblando',
      '\\b(peligro|riesgo|peligroso|peligrosa)\\b.*\\b' + VOLCAN, '\\b' + VOLCAN + '\\b.*\\b(peligro|riesgo|peligroso|peligrosa)\\b',
      '\\bis the volcano (erupting|safe|dangerous)', '\\bvolcano (alert|status)', '\\b(alert level|eruption (today|now|soon))',
    ],
    // Datos históricos o conceptuales del volcán NO son estado: van al guion (salvo que pregunten por hoy, alerta o lo próximo)
    salvo: [
      '^(?!.*\\b(hoy|ahora|ahorita|actualmente|actual|proxima|va a|puede|podria|alerta|nivel|semaforo|today|now)\\b).*\\b(1985|1595|1845|armero|historia|historica|historico|hubo|ocurrio|paso en|sucedio|fue la|fue el|tragedia|antigua|antiguas|pasada|pasadas|ultima gran|history)\\b',
      '^(?!.*\\b(hoy|ahora|ahorita|actualmente|actual|alerta|nivel|semaforo|today|now)\\b).*\\b(que|cual) (es|era|significa|son|eran) (un |una |el |la |los |las )?(lahar|lahares|crater|fumarola|fumarolas|ceniza|cenizas|sismo|temblor)\\b',
      // «¿cómo saben si va a hacer erupción?» pregunta por el monitoreo (dato), no por el estado
      '^(?!.*\\b(hoy|ahora|ahorita|alerta|nivel|semaforo)\\b).*\\b(como|quien|quienes) (saben|sabe|se sabe|monitorea|monitorean|vigila|vigilan|mide|miden|estudia|estudian)\\b',
    ],
  },
  {
    id: 'condiciones',
    si: [
      '\\b(clima|tiempo|temperatura|lluvia|nieve|niebla|viento|pronostico|frio|calor|granizo|tormenta)\\b.*\\b' + HOY + '\\b',
      '\\b' + HOY + '\\b.*\\b(clima|tiempo|temperatura|llueve|llover|lluvia|nieva|nevar|nieve|niebla|viento|frio|calor|granizo|tormenta|despejado|nublado)\\b',
      '\\b(va a|va a seguir|vaya a|ira a) (llover|nevar|granizar|hacer frio|hacer sol|despejar|haber tormenta)\\b(?! (menos|mas|cada))','\\b(llovera|nevara|granizara)\\b', '\\bpronostico',
      '\\bmanana (va a|abren|abre|estara|hay|habra|llueve|hace|se puede)\\b', '\\b(llueve|llovera|abren|abre|estara|habra|se puede subir|podemos subir) manana\\b',
      '\\b(esta|estara|sigue) (abierto|abierta|cerrado|cerrada|habilitad|disponible)', '\\b(abren|cierran|abre|cierra) (hoy|manana|el parque|la entrada|el acceso|la via|la carretera|el sendero)',
      '\\b(a|hasta) que hora (abren|cierran|abre|cierra|se puede|hay|sale|salen|termina|empieza)', '\\bhorario', '\\bcierre', '\\bcerrad[oa] (por|hoy|el|la)\\b',
      '\\b(acceso|via|carretera|camino|sendero|entrada)\\b.*\\b(abierto|abierta|cerrado|cerrada|habilitad|estado|hoy|ahora|bloquead|transitable)\\b',
      '\\b(se puede|puedo|podemos) (subir|entrar|ir|pasar|llegar) (hoy|manana|ahora)\\b',
      '\\b(es|esta|sera) (seguro|peligroso|riesgoso) (subir|ir|estar|visitar|acercarse|acercarnos|caminar|salir) (hoy|ahora|manana|al|a la|por)\\b',
      '\\bconfirm\\w*\\b.*\\bpersonal\\b', '\\bpersonal\\b.*\\bconfirm', '\\binformacion (cambiante|actualizada|del dia|de hoy)',
      '\\bweather (today|now|forecast|tomorrow)', '\\b(is it|is the park) (open|closed)', '\\bopening hours', '\\bwill it (rain|snow)',
    ],
    // Servicios (restaurante, baños, wifi, tarifas) no son información de seguridad: van a la abstención normal
    salvo: ['^(?!.*\\b(hoy|ahora|clima|via|carretera|acceso|parque|sendero|nevado|volcan)\\b).*\\b(restaurante|cafeteria|tienda|almuerzo|bano|banos|wifi|parqueadero|hotel|cajero)\\b'],
  },
];

// Normalización idéntica a herramientas/fray_py.py: minúsculas, sin tildes, solo [a-z0-9] y un espacio a cada lado.
export function normalizarCarril(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return ' ' + t + ' ';
}

const COMPILADAS = REGLAS.map((r) => ({ id: r.id, si: r.si.map((p) => new RegExp(p)), salvo: r.salvo.map((p) => new RegExp(p)) }));

// Devuelve el id de la primera regla que casa (orden de prioridad) o null.
export function categoriaCarril(texto) {
  const t = normalizarCarril(texto);
  for (const r of COMPILADAS) {
    if (r.si.some((re) => re.test(t)) && !r.salvo.some((re) => re.test(t))) return r.id;
  }
  return null;
}

// Respuesta completa del contrato para el carril, o null si ninguna regla casa.
export function carril(texto) {
  const c = categoriaCarril(texto);
  if (!c) return null;
  return { tipo: 'seguridad', categoria: c, breve: MENSAJES[c], ampliar: null, citas: [], fichas: [], tipoContenido: 'norma', alternativas: [], aviso: null };
}
