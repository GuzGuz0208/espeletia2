// Descargas dentro de la APK Fray: el WebView de Android no descarga enlaces `<a download href="blob:…">` (el PDF del
// álbum, la imagen del cromo, el registro de la prueba y las exportaciones del Panel no hacían nada). Si existe el canal
// nativo `FrayArchivo` (nativo/lib/app_web.dart), se intercepta ese clic y se le entrega el archivo a Android, que abre
// «Guardar como» (Descargas por defecto). En el navegador no cambia nada.
const TROZO = 0x8000;
async function aBase64(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += TROZO) s += String.fromCharCode.apply(null, b.subarray(i, i + TROZO));
  return btoa(s);
}
addEventListener('click', async (e) => {
  const a = e.target?.closest?.('a[download]');
  if (!a || !window.FrayArchivo?.postMessage || !/^(blob|data):/.test(a.href)) return;
  e.preventDefault();
  try {
    const blob = await (await fetch(a.href)).blob();
    window.FrayArchivo.postMessage(JSON.stringify({ nombre: a.download || 'archivo', tipo: blob.type || 'application/octet-stream', b64: await aBase64(blob) }));
  } catch (err) { console.warn('Descarga nativa:', err); }
}, true);
