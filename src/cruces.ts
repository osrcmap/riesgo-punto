// Cruces entre fuentes y mensaje corto. Solo hechos con su fuente: no se crean niveles ni alertas propias.
import type { ErrorFuente, SalidaAvisos, SalidaPeligros } from "./fuentes.js";

/** Avisos meteorológicos de lluvia (por su título oficial). */
export const ES_LLUVIA = /PRECIPITACI|LLUVIA|GRANIZO|NEVADA|TORMENTA|CHUBASCO/i;

/** Categorías de zona crítica que la lluvia intensa puede activar. */
export const ACTIVABLES_POR_LLUVIA = ["flujo", "inundacion", "deslizamiento", "caida", "erosion"];

type Zona = SalidaPeligros["zonas_criticas"][number];

const zonaBreve = (z: Zona) => ({
  id: z.id,
  peligro: z.peligro ?? null,
  paraje: z.paraje ?? null,
  distrito: z.distrito ?? null,
  distancia_m: z.distancia_m,
});

const ddmm = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const horaLima = (iso: string) => {
  const d = new Date(Date.parse(iso) - 5 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`;
};
const minusculas = (s: string | null | undefined) =>
  s ? s.charAt(0).toLowerCase() + s.slice(1) : "peligro geológico";

export type Cruce = {
  tipo: "activacion_quebradas_y_zona_critica" | "lluvia_y_zona_critica";
  descripcion: string;
  aviso: Record<string, unknown>;
  zonas: ReturnType<typeof zonaBreve>[];
};

export function cruces(p: SalidaPeligros | null, a: SalidaAvisos | null): Cruce[] {
  if (!p || !a) return [];
  const out: Cruce[] = [];

  const q = a.quebradas;
  const deFlujo = p.zonas_criticas.filter((z) => z.categorias.includes("flujo"));
  if (q && deFlujo.length) {
    out.push({
      tipo: "activacion_quebradas_y_zona_critica",
      descripcion: `El punto está en una zona del aviso de posible activación de quebradas N° ${q.numero}-${q.anio} (nivel ${q.color}, hasta ${horaLima(q.fin)}) y a ${deFlujo[0].distancia_m} m de una zona crítica por ${minusculas(deFlujo[0].peligro)} (INGEMMET).`,
      aviso: { tipo: "activacion_quebradas", numero: q.numero, anio: q.anio, color: q.color, fin: q.fin },
      zonas: deFlujo.slice(0, 5).map(zonaBreve),
    });
  }

  const activables = p.zonas_criticas.filter((z) =>
    z.categorias.some((c) => ACTIVABLES_POR_LLUVIA.includes(c)),
  );
  for (const m of a.meteorologicos) {
    if (!ES_LLUVIA.test(m.titulo) || !activables.length) continue;
    const dias = m.dias.map((d) => `${d.color} el ${ddmm(d.fecha)}`).join(", ");
    out.push({
      tipo: "lluvia_y_zona_critica",
      descripcion: `El punto está dentro del aviso N° ${m.numero}-${m.anio} del SENAMHI (${m.titulo.toLowerCase()}: ${dias}) y a ${activables[0].distancia_m} m de una zona crítica por ${minusculas(activables[0].peligro)} (INGEMMET).`,
      aviso: {
        tipo: "meteorologico",
        numero: m.numero,
        anio: m.anio,
        titulo: m.titulo,
        url: m.url,
        dias: m.dias,
      },
      zonas: activables.slice(0, 5).map(zonaBreve),
    });
  }
  return out;
}

export const AVISO_GENERAL =
  "Información de referencia de fuentes oficiales (SENAMHI, INGEMMET). No es una orden de evacuación. Ante una emergencia sigue a INDECI, SENAMHI y tu municipalidad.";

/**
 * Texto corto para WhatsApp/SMS: solo hechos y fuentes. Nunca dice "estás a salvo":
 * si una fuente falló, lo dice explícitamente.
 */
export function mensaje(o: {
  lat: number;
  lon: number;
  radio: number;
  momento: string | null;
  peligros: SalidaPeligros | null;
  avisos: SalidaAvisos | null;
  errores: Partial<Record<"peligros" | "avisos", ErrorFuente>>;
  cruces: Cruce[];
}): string {
  const l: string[] = [
    `Ubicación (${o.lat}, ${o.lon})${o.momento ? ` - ${horaLima(o.momento)} (hora de Perú)` : ""}`,
  ];

  for (const c of o.cruces) l.push(`ATENCIÓN: ${c.descripcion}`);

  if (o.avisos) {
    const q = o.avisos.quebradas;
    if (q) {
      const distritos = [...new Set(q.zonas.map((z) => z.distrito).filter(Boolean))].join(", ");
      l.push(
        `Aviso de posible activación de quebradas N° ${q.numero}-${q.anio}: nivel ${q.color} hasta ${horaLima(q.fin)} (${distritos}).`,
      );
    }
    for (const m of o.avisos.meteorologicos.slice(0, 4)) {
      l.push(
        `Aviso SENAMHI N° ${m.numero}: ${m.titulo.toLowerCase()} - ${m.dias.map((d) => `${d.color} ${ddmm(d.fecha)}`).join(", ")}.`,
      );
    }
    if (o.avisos.meteorologicos.length > 4) l.push(`Y ${o.avisos.meteorologicos.length - 4} avisos más.`);
    if (!q && !o.avisos.meteorologicos.length)
      l.push("Ningún aviso vigente o próximo del SENAMHI cubre este punto.");
    if (o.avisos.no_evaluables.length) {
      l.push(`No se pudieron evaluar ${o.avisos.no_evaluables.length} avisos del SENAMHI para este punto.`);
    }
  } else {
    l.push("No se pudo consultar los avisos del SENAMHI: no se puede afirmar que no haya avisos.");
  }

  if (o.peligros) {
    const zc = o.peligros.zonas_criticas;
    if (zc.length) {
      const z = zc[0];
      l.push(
        `Zonas críticas INGEMMET a menos de ${o.radio} m: ${zc.length}. La más cercana, a ${z.distancia_m} m: ${z.peligro ?? "peligro geológico"}${z.paraje ? ` (${z.paraje})` : ""}.`,
      );
    } else {
      l.push(
        `Sin zonas críticas INGEMMET inventariadas a menos de ${o.radio} m (no significa que el lugar sea seguro).`,
      );
    }
    const sc = o.peligros.sin_coordenadas_en_distritos_cercanos.length;
    if (sc) l.push(`Además hay ${sc} zonas críticas sin ubicación exacta en este distrito.`);
  } else {
    l.push("No se pudo consultar el inventario de zonas críticas del INGEMMET.");
  }

  l.push(AVISO_GENERAL);
  return l.join("\n");
}
