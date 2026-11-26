// Relieve real del sector Brisas – Valle de las Tumbas – cráter Arenas (Copernicus DEM GLO-30, ~60 m).
// Lo usan el mapa plano (imagen del pliego), la vista 3D y la bitácora (altura del terreno cuando el
// GPS del teléfono no da altura). Ver herramientas/relieve.py.
const R = (u) => new URL(u, import.meta.url).href;
let p = null;

// { meta, z: Uint16Array, imagen: URL } o null si no está
export function cargar() {
  p ??= (async () => {
    const [meta, buf] = await Promise.all([
      fetch(R('../models/relieve.json')).then((r) => (r.ok ? r.json() : null)),
      fetch(R('../models/relieve.bin')).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    if (!meta || !buf) return null;
    return { meta, z: new Uint16Array(buf), imagen: R('../models/relieve.webp') };
  })().catch(() => null);
  return p;
}

let datos = null;
cargar().then((d) => (datos = d));
export const listo = () => datos;

// Altura del terreno (m) en un punto, interpolada; null si está fuera del recorte
export function altura(lat, lon, d = datos) {
  if (!d) return null;
  const { lon0, lat1, paso, w, h } = d.meta;
  const fx = (lon - lon0) / paso - 0.5, fy = (lat1 - lat) / paso - 0.5;
  if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) return null;
  const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
  const v = (i, j) => d.z[Math.min(h - 1, j) * w + Math.min(w - 1, i)];
  return (v(x, y) * (1 - tx) + v(x + 1, y) * tx) * (1 - ty) + (v(x, y + 1) * (1 - tx) + v(x + 1, y + 1) * tx) * ty;
}
