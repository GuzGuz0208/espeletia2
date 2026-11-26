// Servidor local de la PWA: sirve los archivos empaquetados en assets/pwa/ en http://127.0.0.1:<puerto>, solo dentro
// del teléfono. Así la app funciona sin red desde el primer arranque y el service worker de la PWA (que exige un origen
// seguro: localhost lo es) instala todo igual que en la web.
//
// - Los archivos grandes (modelo e5, MobileNet y el WASM) vienen partidos en models/partes/ (models/partes.json); si la
//   página pide el archivo unido, se arma aquí al vuelo.
// - En index.html se inyecta <script src="__fray_nativo.js"> antes de todo, para que window.FrayNativo exista antes de
//   que corra la app. El archivo del repo no se modifica.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;

const _raiz = 'assets/pwa';
const puertoPreferido = 8735; // fijo: IndexedDB y el service worker dependen del origen (puerto incluido)

const _tipos = {
  'html': 'text/html; charset=utf-8',
  'js': 'text/javascript; charset=utf-8',
  'mjs': 'text/javascript; charset=utf-8',
  'css': 'text/css; charset=utf-8',
  'json': 'application/json; charset=utf-8',
  'wasm': 'application/wasm',
  'png': 'image/png',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'woff2': 'font/woff2',
  'mp3': 'audio/mpeg',
  'ogg': 'audio/ogg',
  'txt': 'text/plain; charset=utf-8',
};

class ServidorPwa {
  ServidorPwa(this.scriptPuente);
  final String scriptPuente;
  HttpServer? _srv;
  Map<String, dynamic> _grandes = const {};

  Uri get origen => Uri.parse('http://127.0.0.1:${_srv!.port}/');

  Future<Uri> iniciar() async {
    if (_srv != null) return origen;
    try {
      _grandes = jsonDecode(await rootBundle.loadString('$_raiz/models/partes.json')) as Map<String, dynamic>;
    } catch (_) {
      _grandes = const {};
    }
    try {
      _srv = await HttpServer.bind(InternetAddress.loopbackIPv4, puertoPreferido);
    } on SocketException {
      _srv = await HttpServer.bind(InternetAddress.loopbackIPv4, 0); // sin el puerto fijo se pierde lo guardado
    }
    _srv!.listen(_atender, onError: (_) {});
    return origen;
  }

  Future<void> detener() async {
    await _srv?.close(force: true);
    _srv = null;
  }

  Future<void> _atender(HttpRequest req) async {
    final res = req.response;
    try {
      if (req.method != 'GET' && req.method != 'HEAD') {
        res.statusCode = HttpStatus.methodNotAllowed;
        return;
      }
      var ruta = Uri.decodeComponent(req.uri.path);
      if (ruta.startsWith('/')) ruta = ruta.substring(1);
      if (ruta.isEmpty) ruta = 'index.html';
      if (ruta.contains('..') || ruta.contains('\\')) {
        res.statusCode = HttpStatus.badRequest;
        return;
      }
      Uint8List? cuerpo;
      if (ruta == '__fray_nativo.js') {
        cuerpo = Uint8List.fromList(utf8.encode(scriptPuente));
      } else if (ruta == 'index.html') {
        final html = await rootBundle.loadString('$_raiz/index.html', cache: false);
        cuerpo = Uint8List.fromList(utf8.encode(_inyectar(html)));
      } else if (_grandes.containsKey(ruta)) {
        cuerpo = await _unir(ruta);
      } else {
        cuerpo = await _leer(ruta);
      }
      if (cuerpo == null) {
        res.statusCode = HttpStatus.notFound;
        return;
      }
      final ext = ruta.contains('.') ? ruta.substring(ruta.lastIndexOf('.') + 1).toLowerCase() : '';
      res.headers.set(HttpHeaders.contentTypeHeader, _tipos[ext] ?? 'application/octet-stream');
      res.headers.set(HttpHeaders.cacheControlHeader,
          ruta.startsWith('models/partes/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.headers.set('X-Content-Type-Options', 'nosniff');
      res.contentLength = cuerpo.length;
      if (req.method == 'GET') res.add(cuerpo);
    } catch (_) {
      res.statusCode = HttpStatus.internalServerError;
    } finally {
      await res.close();
    }
  }

  String _inyectar(String html) {
    const etiqueta = '<script src="__fray_nativo.js"></script>';
    final i = html.indexOf(RegExp(r'<head[^>]*>', caseSensitive: false));
    if (i < 0) return '$etiqueta$html';
    final fin = html.indexOf('>', i) + 1;
    return '${html.substring(0, fin)}\n$etiqueta${html.substring(fin)}';
  }

  Future<Uint8List?> _leer(String ruta) async {
    try {
      final d = await rootBundle.load('$_raiz/$ruta');
      return d.buffer.asUint8List(d.offsetInBytes, d.lengthInBytes);
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> _unir(String ruta) async {
    final m = _grandes[ruta] as Map<String, dynamic>;
    final b = BytesBuilder(copy: false);
    for (final p in (m['partes'] as List).cast<String>()) {
      final x = await _leer(p);
      if (x == null) return null;
      b.add(x);
    }
    return b.takeBytes();
  }
}
