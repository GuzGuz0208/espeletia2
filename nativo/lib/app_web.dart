// Pantalla «App»: la PWA del Álbum del Páramo en un WebView, servida desde la propia app (sin red) y con el
// puente window.FrayNativo. Concede a la página cámara, micrófono y GPS cuando los pide (y Android lo permite).
import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'puente.dart';
import 'servidor.dart';

class PantallaApp extends StatefulWidget {
  const PantallaApp({super.key});
  @override
  State<PantallaApp> createState() => _PantallaAppState();
}

class _PantallaAppState extends State<PantallaApp> with AutomaticKeepAliveClientMixin {
  final _servidor = ServidorPwa(scriptPuente);
  WebViewController? _web;
  PuenteFray? _puente;
  String? _error;
  Uri? _origen;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _arrancar();
  }

  Future<void> _arrancar() async {
    try {
      final origen = await _servidor.iniciar();
      final web = WebViewController(onPermissionRequest: _permisoPagina);
      final puente = PuenteFray(ejecutarJs: (js) => web.runJavaScript(js));
      await puente.iniciar();
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await web.addJavaScriptChannel('FrayNativoCanal', onMessageReceived: (m) => puente.recibir(m.message));
      await web.setNavigationDelegate(NavigationDelegate(
        // Solo se navega dentro de la PWA local; nada sale a la red desde aquí.
        onNavigationRequest: (r) => Uri.parse(r.url).origin == origen.origin || r.url.startsWith('about:') || r.url.startsWith('blob:') || r.url.startsWith('data:')
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
      ));
      final p = web.platform;
      if (p is AndroidWebViewController) {
        await AndroidWebViewController.enableDebugging(true); // chrome://inspect con el teléfono por USB
        await p.setMediaPlaybackRequiresUserGesture(false);
        await p.setGeolocationEnabled(true);
        await p.setGeolocationPermissionsPromptCallbacks(onShowPrompt: (req) async {
          final ok = await Permission.locationWhenInUse.request().isGranted;
          return GeolocationPermissionsResponse(allow: ok, retain: ok);
        });
        await p.setOnShowFileSelector(_elegirArchivo);
      }
      await web.loadRequest(origen);
      if (!mounted) return;
      setState(() {
        _web = web;
        _puente = puente;
        _origen = origen;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _permisoPagina(WebViewPermissionRequest req) async {
    final pedir = <Permission>[
      if (req.types.contains(WebViewPermissionResourceType.camera)) Permission.camera,
      if (req.types.contains(WebViewPermissionResourceType.microphone)) Permission.microphone,
    ];
    if (pedir.isEmpty) return req.deny();
    final estados = await pedir.request();
    if (estados.values.every((s) => s.isGranted)) {
      await req.grant();
    } else {
      await req.deny();
    }
  }

  // <input type="file"> de la PWA: foto con la cámara (capture) o un archivo (imagen o JSON del equipo).
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
  void dispose() {
    unawaited(_servidor.detener());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_error != null) {
      return Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('No pude abrir la PWA: $_error\n\n¿Corriste herramientas/copiar_pwa.py antes de compilar?')));
    }
    final web = _web;
    if (web == null) return const Center(child: CircularProgressIndicator());
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await web.canGoBack()) await web.goBack();
      },
      child: Stack(children: [
        WebViewWidget(controller: web),
        if (kDebugMode && _origen != null && _puente != null)
          Positioned(right: 4, bottom: 4, child: Text('$_origen', style: const TextStyle(fontSize: 9))),
      ]),
    );
  }
}
