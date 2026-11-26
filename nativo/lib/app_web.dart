// La PWA de Fray en un WebView. La página se carga desde https://espeletia2.vercel.app/ (la primera vez con señal: Brisas,
// hotel o una estación con Starlink); su service worker la deja guardada y desde ahí funciona en modo avión. El contenido
// del parque llega y vence con la PWA (24 h); el APK no lo trae.
//
// - window.FrayNativo se inyecta solo si la página es del origen de la app, al empezar a cargar y otra vez al terminar
//   (el adaptador de js/generador.js lo busca cuando la app ya arrancó). Los mensajes del canal se atienden solo si la
//   página actual es de ese origen.
// - Solo se navega dentro de ese origen; cualquier otro enlace se bloquea.
// - Concede a la página cámara (QR), micrófono y GPS cuando los pide y Android lo permite.
import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'puente.dart';

const urlApp = 'https://espeletia2.vercel.app/';
final origenApp = Uri.parse(urlApp).origin;

bool esDeLaApp(String? url) {
  if (url == null) return false;
  try {
    return Uri.parse(url).origin == origenApp;
  } catch (_) {
    return false;
  }
}

class PantallaApp extends StatefulWidget {
  const PantallaApp({super.key, required this.controlador});
  final ControladorWeb controlador;
  @override
  State<PantallaApp> createState() => _PantallaAppState();
}

/// Lo que la barra de estado necesita del WebView (recargar cuando la IA queda lista).
class ControladorWeb {
  WebViewController? web;
  Future<void> recargar() async => web?.reload();
}

class _PantallaAppState extends State<PantallaApp> {
  WebViewController? _web;
  DateTime? _ultimoAtras;
  // Cierra la capa u hoja visible de la página (Ajustes, sobre, ficha…) tocando su fondo; true si cerró algo.
  static const _cerrarAbierto = "(()=>{const c=[...document.querySelectorAll('.capa:not([hidden])')].pop();if(!c||!c.onclick)return false;c.click();return true;})()";
  String? _error;
  bool _sinPagina = false;

  @override
  void initState() {
    super.initState();
    _arrancar();
  }

  Future<void> _inyectar(WebViewController web, String url) async {
    if (!esDeLaApp(url)) return;
    try {
      await web.runJavaScript(scriptPuente);
    } catch (_) {}
  }

  Future<void> _arrancar() async {
    try {
      final web = WebViewController(onPermissionRequest: _permisoPagina);
      final puente = PuenteFray(ejecutarJs: (js) => web.runJavaScript(js), prompts: await Prompts.leer());
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await web.addJavaScriptChannel('FrayNativoCanal', onMessageReceived: (m) async {
        if (esDeLaApp(await web.currentUrl())) await puente.recibir(m.message);
      });
      // Descargas de la página (PDF del álbum, imagen del cromo, registro, Panel): el WebView no maneja `<a download>`.
      // js/descarga-nativa.js manda {nombre, tipo, b64}; aquí se abre «Guardar como» de Android.
      await web.addJavaScriptChannel('FrayArchivo', onMessageReceived: (m) async {
        if (!esDeLaApp(await web.currentUrl())) return;
        try {
          final j = jsonDecode(m.message) as Map<String, dynamic>;
          final nombre = (j['nombre'] as String? ?? 'archivo').replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
          final uri = await FilePicker.saveFile(
              fileName: nombre, bytes: base64Decode(j['b64'] as String), mimeType: j['tipo'] as String? ?? 'application/octet-stream');
          if (mounted && uri != null) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Guardado: $nombre')));
          }
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo guardar: $e')));
        }
      });
      await web.setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (r) => esDeLaApp(r.url) || r.url.startsWith('about:') || r.url.startsWith('blob:') || r.url.startsWith('data:')
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
        onPageStarted: (url) {
          if (mounted && _sinPagina) setState(() => _sinPagina = false);
          _inyectar(web, url);
        },
        // En Android, un script corrido en onPageStarted a veces cae en el documento anterior: se repite mientras carga
        // (el script no hace nada si FrayNativo ya existe) y al terminar.
        onProgress: (_) async => _inyectar(web, await web.currentUrl() ?? ''),
        onPageFinished: (url) => _inyectar(web, url),
        onWebResourceError: (e) {
          // Primera apertura sin señal (la PWA aún no está guardada): se avisa y se ofrece reintentar.
          if (e.isForMainFrame == true && mounted) setState(() => _sinPagina = true);
        },
      ));
      final p = web.platform;
      if (p is AndroidWebViewController) {
        await AndroidWebViewController.enableDebugging(true); // chrome://inspect con el teléfono por USB
        await p.setMediaPlaybackRequiresUserGesture(false);
        await p.setGeolocationEnabled(true);
        await p.setGeolocationPermissionsPromptCallbacks(onShowPrompt: (req) async {
          final ok = esDeLaApp(req.origin) && await Permission.locationWhenInUse.request().isGranted;
          return GeolocationPermissionsResponse(allow: ok, retain: ok);
        });
        await p.setOnShowFileSelector(_elegirArchivo);
      }
      widget.controlador.web = web;
      await web.loadRequest(Uri.parse(urlApp));
      if (mounted) setState(() => _web = web);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _permisoPagina(WebViewPermissionRequest req) async {
    final pedir = <Permission>[
      if (req.types.contains(WebViewPermissionResourceType.camera)) Permission.camera,
      if (req.types.contains(WebViewPermissionResourceType.microphone)) Permission.microphone,
    ];
    if (pedir.isEmpty || !esDeLaApp(await _web?.currentUrl())) return req.deny();
    final estados = await pedir.request();
    if (estados.values.every((s) => s.isGranted)) {
      await req.grant();
    } else {
      await req.deny();
    }
  }

  // <input type="file"> de la PWA: foto con la cámara (capture) o un archivo (paquete USB, JSON del equipo).
  Future<List<String>> _elegirArchivo(FileSelectorParams params) async {
    final soloImagen = params.acceptTypes.isNotEmpty && params.acceptTypes.every((t) => t.startsWith('image/'));
    if (params.isCaptureEnabled && soloImagen) {
      if (!await Permission.camera.request().isGranted) return [];
      final foto = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 90);
      return foto == null ? [] : [Uri.file(foto.path).toString()];
    }
    if (soloImagen) {
      final fotos = params.mode == FileSelectorMode.openMultiple
          ? await ImagePicker().pickMultiImage(imageQuality: 90)
          : [?await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90)];
      return [for (final f in fotos) Uri.file(f.path).toString()];
    }
    final r = await FilePicker.pickFiles(type: FileType.any);
    return [for (final f in r) f.uri.toString()];
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('No pude abrir Fray: $_error')));
    }
    final web = _web;
    if (web == null) return const Center(child: CircularProgressIndicator());
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        // 1) cerrar lo abierto en la página (hoja, capa) o volver atrás en su historial
        final cerro = await web.runJavaScriptReturningResult(_cerrarAbierto).catchError((_) => false);
        if (cerro == true || cerro.toString() == 'true') return;
        if (await web.canGoBack()) { await web.goBack(); return; }
        // 2) salir con un segundo «atrás» antes de 2 s (no se sale de un solo toque por error)
        final ahora = DateTime.now();
        if (_ultimoAtras != null && ahora.difference(_ultimoAtras!) < const Duration(seconds: 2)) {
          SystemNavigator.pop();
          return;
        }
        _ultimoAtras = ahora;
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Toca «atrás» otra vez para salir'), duration: Duration(seconds: 2)));
        }
      },
      child: Stack(children: [
        // Android: hybrid composition (el WebView es una vista nativa). Con la composición por textura (por defecto),
        // cada cuadro se copia a Flutter y el teclado redimensiona la textura cuadro a cuadro: la app se sentía lenta.
        if (web.platform is AndroidWebViewController)
          WebViewWidget.fromPlatformCreationParams(
            params: AndroidWebViewWidgetCreationParams(controller: web.platform, displayWithHybridComposition: true),
          )
        else
          WebViewWidget(controller: web),
        if (_sinPagina)
          Positioned.fill(
            child: ColoredBox(
              color: Theme.of(context).colorScheme.surface,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.wifi_off, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      'Abre Fray una vez con señal (Brisas, el hotel o una estación con Starlink). '
                      'Después funciona en modo avión durante todo el recorrido.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: () => web.loadRequest(Uri.parse(urlApp)), child: const Text('Reintentar')),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}
