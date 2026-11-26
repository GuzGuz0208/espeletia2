// Paridad con laboratorio/slm.html: «esperado» lo calculó la función verificar() de slm.html
// (node herramientas/paridad_verificador.mjs --escribir). La versión Dart debe dar exactamente lo mismo.
import 'dart:convert';
import 'dart:io';

import 'package:album_paramo/critico.dart';
import 'package:album_paramo/verificador.dart';
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

  group('carril crítico', () {
    final catalogo = CatalogoFichas.desdeJson({
      'fichas': [
        {'id': 'emergencia', 'urgente': true},
        {'id': 'servicios', 'abstencion': true},
        {'id': 'otra_abstencion', 'abstencion': true},
        {'id': 'horario'},
      ],
    });
    test('fichas fijas siempre se rechazan, aun sin catálogo', () {
      for (final id in ['emergencia', 'mal_altura', 'comer_plantas', 'volcan_estado', 'servicios']) {
        expect(motivoRechazo(id, null), isNotNull, reason: id);
        expect(motivoRechazo(id, catalogo), isNotNull, reason: id);
      }
    });
    test('abstención del catálogo se rechaza', () => expect(motivoRechazo('otra_abstencion', catalogo), isNotNull));
    test('ficha normal pasa', () => expect(motivoRechazo('horario', catalogo), isNull));
    test('ficha desconocida o vacía se rechaza', () {
      expect(motivoRechazo('no_existe', catalogo), isNotNull);
      expect(motivoRechazo('', catalogo), isNotNull);
    });
  });
}
