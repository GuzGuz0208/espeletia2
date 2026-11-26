// Fray · Guía de páramo para Android: la PWA en un WebView + IA local (llamadart / llama.cpp) por window.FrayNativo.
// El guía va en el centro; la app lo complementa. Arriba, una barra delgada con el estado de la IA local; mantenerla
// pulsada abre los ajustes ocultos (modelo, importar, hilos, prueba de velocidad).
import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import 'ajustes.dart';
import 'app_web.dart';
import 'instalador.dart';
import 'motor.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FrayApp());
}

class FrayApp extends StatelessWidget {
  const FrayApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Fray · Guía de páramo',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF2F6B4F), useMaterial3: true),
        darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF2F6B4F), brightness: Brightness.dark, useMaterial3: true),
        home: const Inicio(),
      );
}

class Inicio extends StatefulWidget {
  const Inicio({super.key});
  @override
  State<Inicio> createState() => _InicioState();
}

class _InicioState extends State<Inicio> {
  late final AppLifecycleListener _ciclo;
  final _web = ControladorWeb();
  final ins = Instalador.i;
  bool _ofrecerRecarga = false;
  Timer? _ocultar;
  bool _barraVisible = true;

  @override
  void initState() {
    super.initState();
    ins.addListener(_cambio);
    _ciclo = AppLifecycleListener(
      onResume: ins.reintentarYa, // al volver a la app (p. ej. ya con señal) se reanuda la descarga
      onExitRequested: () async {
        await Motor.i.descargarDeMemoria(); // llamadart pide liberar antes de salir
        return AppExitResponse.exit;
      },
    );
    unawaited(ins.iniciar());
  }

  void _cambio() {
    // Si la IA no estaba instalada cuando arrancó la página (primera descarga), la PWA no la usará hasta recargar.
    if (ins.estado == EstadoIA.lista && !ins.instaladoAlAbrir && !_ofrecerRecarga) _ofrecerRecarga = true;
    if (ins.estado == EstadoIA.lista && !_ofrecerRecarga) {
      _ocultar ??= Timer(const Duration(seconds: 4), () {
        if (mounted) setState(() => _barraVisible = false);
      });
    } else if (ins.estado != EstadoIA.lista) {
      _ocultar?.cancel();
      _ocultar = null;
      _barraVisible = true;
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    ins.removeListener(_cambio);
    _ciclo.dispose();
    _ocultar?.cancel();
    unawaited(Motor.i.descargarDeMemoria());
    super.dispose();
  }

  void _abrirAjustes() => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PantallaAjustes(web: _web)));

  Widget _barra(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final lista = ins.estado == EstadoIA.lista;
    final texto = _ofrecerRecarga ? 'IA local lista. Toca aquí para activarla.' : ins.textoBarra;
    return Material(
      color: lista ? cs.primaryContainer : cs.secondaryContainer,
      child: InkWell(
        onTap: _ofrecerRecarga
            ? () {
                setState(() => _ofrecerRecarga = false);
                ins.instaladoAlAbrir = true;
                _web.recargar();
                _cambio();
              }
            : null,
        onLongPress: _abrirAjustes,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(texto, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
            if (ins.estado == EstadoIA.descargando || ins.estado == EstadoIA.esperandoRed)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: LinearProgressIndicator(value: ins.progreso, minHeight: 3),
              ),
            if (ins.estado == EstadoIA.verificando || ins.estado == EstadoIA.cargando || ins.estado == EstadoIA.revisando)
              const Padding(padding: EdgeInsets.only(top: 3), child: LinearProgressIndicator(minHeight: 3)),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    _avisarTeclado(MediaQuery.viewInsetsOf(context).bottom);
    return Scaffold(
      // El teclado NO redimensiona el WebView cuadro a cuadro (se sentía lento): la página recibe su altura una vez,
      // cuando termina de abrirse o cerrarse (--teclado y .con-teclado en styles.css).
      resizeToAvoidBottomInset: false,
      body: SafeArea(
        child: Column(children: [
          if (_barraVisible)
            _barra(context)
          else
            // Barra oculta: una franja de 4 px que se puede mantener pulsada para abrir los ajustes.
            GestureDetector(onLongPress: _abrirAjustes, child: Container(height: 4, color: Theme.of(context).colorScheme.primaryContainer)),
          Expanded(child: PantallaApp(controlador: _web)),
        ]),
      ),
    );
  }

  Timer? _relojTeclado;
  double _tecladoAvisado = 0;
  // Cada cuadro de la animación del teclado: solo --tecladoVivo (la casilla del chat se mueve con transform, sin
  // redimensionar nada). Al terminar: --teclado (relleno para poder desplazar hasta abajo).
  void _avisarTeclado(double alto) {
    final px = alto.round();
    if ((alto - _tecladoAvisado).abs() >= 1) {
      final abriendo = _tecladoAvisado < 1 && px > 0;
      _tecladoAvisado = alto;
      _web.web?.runJavaScript("document.documentElement.style.setProperty('--tecladoVivo','${px}px');"
          "${abriendo ? "document.documentElement.classList.add('con-teclado');" : ''}");
    }
    _relojTeclado?.cancel();
    _relojTeclado = Timer(const Duration(milliseconds: 120), () {
      _web.web?.runJavaScript("document.documentElement.style.setProperty('--teclado','${px}px');"
          "document.documentElement.classList.toggle('con-teclado',$px>0);"
          "if($px>0){const a=document.activeElement;if(a&&a.scrollIntoView)a.scrollIntoView({block:'nearest'});}");
    });
  }
}
