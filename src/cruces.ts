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
  "Fuentes: SENAMHI e INGEMMET. No es una orden de evacuación: ante una emergencia sigue las indicaciones de INDECI y de tu municipalidad.";

/** Qué hacer según el nivel, resumido de las recomendaciones oficiales del SENAMHI. */
const QUE_HACER: Record<number, string> = {
  2: "Nivel amarillo: mantente informado.",
  3: "Nivel naranja: prepárate y sigue las indicaciones de las autoridades.",
  4: "Nivel rojo: sé extremadamente precavido y sigue las indicaciones de las autoridades.",
};

/** Nombre corto de los avisos que no son de lluvia: van juntos en una sola línea. */
function corto(titulo: string): string {
  if (/HELADA/i.test(titulo)) return "heladas";
  if (/FRIAJE/i.test(titulo)) return "friaje";
  if (/VIENTO/i.test(titulo)) return "viento";
  if (/INCREMENTO DE TEMPERATURA/i.test(titulo)) return "calor";
  if (/DESCENSO DE TEMPERATURA/i.test(titulo)) return "frío";
  return titulo.toLowerCase();
}

const oracion = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const distancia = (m: number) => (m < 1000 ? `${m} m` : `${Number((m / 1000).toFixed(1))} km`);
const fechaLima = (iso: string) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
const SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "hoy", "mañana" o "lun 20". `hoy` es la fecha de la consulta en Lima (AAAA-MM-DD). */
function cuando(fecha: string, hoy: string | null): string {
  if (fecha === hoy) return "hoy";
  if (hoy && Date.parse(fecha) - Date.parse(hoy) === 86_400_000) return "mañana";
  return `${SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()]} ${Number(fecha.slice(8, 10))}`;
}

/** "Flujo de detritos" → "huaico (flujo de detritos)": así lo llama la gente. */
function peligroTexto(p: string | null | undefined): string {
  const t = minusculas(p);
  return /flujo/i.test(t) && !/huaico|huayco/i.test(t) ? `huaico (${t})` : t;
}

type Meteorologico = SalidaAvisos["meteorologicos"][number];
const diasVigentes = (m: Meteorologico) => m.dias.filter((d) => d.estado !== "terminado");

/**
 * Texto corto para Telegram/WhatsApp/SMS, en orden de importancia: coincidencias, lluvias y
 * huaicos, zonas de peligro cercanas y, en una línea, los demás avisos. Solo hechos con su fuente.
 * Nunca dice "estás a salvo": si una fuente falló, lo dice explícitamente.
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
  const hoy = o.momento ? fechaLima(o.momento) : null;
  const bloques: string[][] = [[`📍 ${o.lat}, ${o.lon}${o.momento ? ` · ${horaLima(o.momento)}` : ""}`]];

  for (const c of o.cruces) {
    const z = c.zonas[0];
    const que =
      c.tipo === "activacion_quebradas_y_zona_critica"
        ? "el SENAMHI avisa posible activación de quebradas aquí"
        : "hay aviso de lluvias del SENAMHI para esta zona";
    bloques.push([
      `⚠️ ATENCIÓN: ${que} y a ${distancia(z.distancia_m)} hay una zona crítica por ${peligroTexto(z.peligro)}.`,
    ]);
  }

  const lluvias = ["🌧️ Lluvias y huaicos"];
  if (o.avisos) {
    const q = o.avisos.quebradas;
    if (q) {
      lluvias.push(
        `Aviso N° ${q.numero} de posible activación de quebradas (huaicos): nivel ${q.color} hasta ${cuando(fechaLima(q.fin), hoy)} a las ${horaLima(q.fin).slice(6)}.`,
      );
      const rec = q.zonas.find((z) => z.recomendacion)?.recomendacion;
      if (rec) lluvias.push(`Recomendación del SENAMHI: ${rec}`);
    }
    const deLluvia = o.avisos.meteorologicos.filter((m) => ES_LLUVIA.test(m.titulo));
    for (const m of deLluvia.slice(0, 3)) {
      lluvias.push(`Aviso N° ${m.numero}: ${oracion(m.titulo)}.`);
      const dias = diasVigentes(m);
      if (dias.length) {
        lluvias.push(`${mayuscula(dias.map((d) => `${cuando(d.fecha, hoy)} ${d.color}`).join(" · "))}.`);
        const que = QUE_HACER[Math.max(...dias.map((d) => d.nivel))];
        if (que) lluvias.push(que);
      }
    }
    if (deLluvia.length > 3) lluvias.push(`Y ${deLluvia.length - 3} avisos de lluvia más.`);
    if (!q && !deLluvia.length) {
      lluvias.push(
        "Por ahora el SENAMHI no tiene avisos de lluvia ni de activación de quebradas para este lugar.",
      );
    }
    if (o.avisos.no_evaluables.length) {
      lluvias.push(
        `No pude revisar ${o.avisos.no_evaluables.length} avisos del SENAMHI para este lugar: revisa senamhi.gob.pe.`,
      );
    }
  } else {
    lluvias.push(
      "⚠️ No pude consultar al SENAMHI: no se puede afirmar que no haya avisos. Revisa senamhi.gob.pe.",
    );
  }
  bloques.push(lluvias);

  const zonas = ["⛰️ Zonas de peligro cerca (INGEMMET)"];
  if (o.peligros) {
    const zc = o.peligros.zonas_criticas;
    if (zc.length) {
      const z = zc[0];
      zonas.push(
        `La más cercana, a ${distancia(z.distancia_m)}: ${peligroTexto(z.peligro)}${z.paraje ? ` en ${z.paraje}` : ""}.`,
      );
      const total = o.peligros.resumen.zonas_criticas ?? zc.length;
      if (total > 1) zonas.push(`En total hay ${total} zonas críticas a menos de ${distancia(o.radio)}.`);
    } else {
      zonas.push(
        `No hay zonas críticas registradas a menos de ${distancia(o.radio)}, pero eso no significa que el lugar sea seguro.`,
      );
    }
    const sc = o.peligros.sin_coordenadas_en_distritos_cercanos.length;
    if (sc) zonas.push(`Además hay ${sc} zonas críticas sin ubicación exacta en este distrito.`);
  } else {
    zonas.push("⚠️ No pude consultar las zonas críticas del INGEMMET.");
  }
  bloques.push(zonas);

  // Los demás avisos (calor, viento, frío…) en una línea: por tipo, el día de nivel más alto; el más grave primero.
  const otros = new Map<string, { nivel: number; texto: string }>();
  for (const m of o.avisos?.meteorologicos ?? []) {
    if (ES_LLUVIA.test(m.titulo)) continue;
    for (const d of diasVigentes(m)) {
      const k = corto(m.titulo);
      if ((otros.get(k)?.nivel ?? 0) < d.nivel)
        otros.set(k, { nivel: d.nivel, texto: `${k} (${d.color} ${cuando(d.fecha, hoy)})` });
    }
  }
  if (otros.size)
    bloques.push([
      `🌡️ Otros avisos del SENAMHI: ${[...otros.values()]
        .sort((x, y) => y.nivel - x.nivel)
        .map((x) => x.texto)
        .join(", ")}.`,
    ]);

  bloques.push([AVISO_GENERAL]);
  return bloques.map((b) => b.join("\n")).join("\n\n");
}
