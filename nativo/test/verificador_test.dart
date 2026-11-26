// Paridad con laboratorio/slm.html: «esperado» lo calculó la función verificar() de slm.html
// (node herramientas/paridad_verificador.mjs --escribir). La versión Dart debe dar exactamente lo mismo.
import 'dart:convert';
import 'dart:io';

import 'package:fray_paramo/critico.dart';
import 'package:fray_paramo/verificador.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final datos = jsonDecode(File('test/casos_verificador.json').readAsStringSync()) as Map<String, dynamic>;
  final casos = (datos['casos'] as List).cast<Map<String, dynamic>>();

  group('paridad con slm.html', () {
    for (final c in casos) {
      test(c['nombre'] as String, () {
        final v = verificar(c['resp'] as String, c['fuente'] as String, c['pregunta'] as String);
        expect(jsonEncode(v.toJson()), jsonEncode(c['esperado']));
      });
    }
  });

  test('norm quita tildes como NFD', () {
    expect(norm('Ñandú ÁRBOL Otún'), 'nandu arbol otun');
    expect(norm('á'), 'a');
  });

  group('reglas extra para inglés', () {
    test('edible y alert level bloquean', () {
      expect(verificar('This plant is edible.', 'Frailejón.', 'can I eat it?', idioma: 'en').ok, isFalse);
      expect(verificar('The volcano is on orange alert.', 'x', 'is it active?', idioma: 'en').ok, isFalse);
    });
    test('no sé en inglés', () {
      expect(verificar("I don't have that official information; ask your guide.", 'x', 'y', idioma: 'en').dijoNoSe, isTrue);
    });
  });

  group('carril crítico nativo (sin catálogo propio)', () {
    test('fichas de categorías críticas se rechazan', () {
      for (final id in ['emergencia', 'volcan', 'comer', 'salud', 'norte-volcan-nivel-alerta', 'uton-hipoxia-terapias',
        'uton-mam-diagnostico-tratamiento']) {
        expect(motivoRechazo(id), isNotNull, reason: id);
      }
    });
    test('fichas normales del paquete pasan (también las nuevas que llegan por sync)', () {
      for (final id in ['uton-aguacerales-ficha', 'norte-volcan-activo', 'uton-complejo-volcanico', 'ficha-nueva-de-hoy']) {
        expect(motivoRechazo(id), isNull, reason: id);
      }
    });
    test('tipo distinto de respuesta o ficha vacía se rechaza', () {
      expect(motivoRechazo('uton-aguacerales-ficha', tipo: 'seguridad'), isNotNull);
      expect(motivoRechazo(''), isNotNull);
    });
  });

  test('la abstención nueva de la PWA cuenta como «no sé»', () {
    expect(verificar('No tengo esa información en los guiones oficiales; pregúntale a tu guía o al personal del parque.', 'x', 'y').dijoNoSe, isTrue);
  });
}
