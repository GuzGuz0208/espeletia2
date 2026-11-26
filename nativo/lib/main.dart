// Álbum del Páramo para Android: la PWA de siempre (pestaña «App») más el laboratorio de LLM nativo.
// Decisión: docs/decisiones/2026-11-25-apk-android-llm-nativo.md. El guía va en el centro; la app lo complementa.
import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import 'app_web.dart';
import 'laboratorio.dart';
import 'motor.dart';

void main() => runApp(const AlbumParamo());

class AlbumParamo extends StatelessWidget {
  const AlbumParamo({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Álbum del Páramo',
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
  int pestana = 0;
  late final AppLifecycleListener _ciclo;

  @override
  void initState() {
    super.initState();
    // Liberar el modelo antes de salir (llamadart pide dispose antes de que termine el proceso).
    _ciclo = AppLifecycleListener(onExitRequested: () async {
      await Motor.i.descargarDeMemoria();
      return AppExitResponse.exit;
    });
  }

  @override
  void dispose() {
    _ciclo.dispose();
    unawaited(Motor.i.descargarDeMemoria());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: IndexedStack(index: pestana, children: const [PantallaApp(), PantallaLaboratorio()]),
        ),
        bottomNavigationBar: NavigationBar(
          height: 60,
          selectedIndex: pestana,
          onDestinationSelected: (i) => setState(() => pestana = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.landscape_outlined), label: 'App'),
            NavigationDestination(icon: Icon(Icons.science_outlined), label: 'Laboratorio'),
          ],
        ),
      );
}
