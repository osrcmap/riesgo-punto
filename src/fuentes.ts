// Ejecuta las otras piezas (peligros-pe, avisos-pe) como CLIs y valida su salida JSON.
// Su JSON es el contrato: si cambia de forma, la fuente se marca como fallida (no se adivina).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { z } from "zod";

const require = createRequire(import.meta.url);

export type Fuente = "peligros" | "avisos";

const PAQUETES: Record<Fuente, { paquete: string; env: string; timeoutMs: number }> = {
  peligros: { paquete: "@osrcmap/peligros-pe", env: "RIESGO_PUNTO_PELIGROS_CLI", timeoutMs: 30_000 },
  // avisos-pe reintenta hasta 3 veces con 45 s de espera cada una.
  avisos: { paquete: "@osrcmap/avisos-pe", env: "RIESGO_PUNTO_AVISOS_CLI", timeoutMs: 150_000 },
};

/** Ruta al CLI instalado; RIESGO_PUNTO_*_CLI la sobrescribe (pruebas o instalaciones propias). */
export function rutaCli(f: Fuente): string {
  const p = PAQUETES[f];
  const propia = process.env[p.env];
  if (propia) return propia;
  const pkg =
    f === "peligros"
      ? require.resolve("@osrcmap/peligros-pe/package.json")
      : require.resolve("@osrcmap/avisos-pe/package.json");
  return join(dirname(pkg), "dist/cli.js");
}

export type ErrorFuente = { code: string; message: string; hint?: string };
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: ErrorFuente };

/** Corre `node <cli> ...args --json` y devuelve su JSON validado. Nunca lanza. */
export function ejecutar<T>(f: Fuente, args: string[], esquema: z.ZodType<T>): Promise<Resultado<T>> {
  // RIESGO_PUNTO_TIMEOUT_MS acota la espera (pruebas, o bots que prefieren fallar rápido).
  const timeoutMs = Number(process.env.RIESGO_PUNTO_TIMEOUT_MS) || PAQUETES[f].timeoutMs;
  return new Promise((resolver) => {
    let cli: string;
    try {
      cli = rutaCli(f);
    } catch (e) {
      return resolver({
        ok: false,
        error: {
          code: "FUENTE_NO_INSTALADA",
          message: `No se encontró ${PAQUETES[f].paquete}: ${(e as Error).message}`,
        },
      });
    }
    const hijo = spawn(process.execPath, [cli, ...args, "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    hijo.stdout.on("data", (d) => (out += d));
    hijo.stderr.resume(); // next-steps: no nos interesan, pero hay que drenarlos
    const reloj = setTimeout(() => {
      hijo.kill("SIGKILL");
      resolver({
        ok: false,
        error: {
          code: "TIEMPO_AGOTADO",
          message: `${PAQUETES[f].paquete} no respondió en ${timeoutMs / 1000} s.`,
        },
      });
    }, timeoutMs);
    hijo.on("error", (e) => {
      clearTimeout(reloj);
      resolver({ ok: false, error: { code: "FUENTE_NO_EJECUTABLE", message: e.message } });
    });
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      let json: any;
      try {
        json = JSON.parse(out.trim());
      } catch {
        return resolver({
          ok: false,
          error: {
            code: "FORMATO_INESPERADO",
            message: `${PAQUETES[f].paquete} no devolvió JSON (código ${codigo}).`,
          },
        });
      }
      if (json?.ok === false) {
        return resolver({
          ok: false,
          error: { code: String(json.code ?? "ERROR"), message: String(json.error ?? ""), hint: json.hint },
        });
      }
      const r = esquema.safeParse(json);
      if (!r.success || codigo !== 0) {
        return resolver({
          ok: false,
          error: {
            code: "FORMATO_INESPERADO",
            message: `${PAQUETES[f].paquete} respondió con una forma inesperada (código ${codigo}): ${
              r.success ? "" : z.prettifyError(r.error).slice(0, 300)
            }`,
          },
        });
      }
      resolver({ ok: true, data: r.data });
    });
  });
}

// ---------- Contratos (solo los campos que usamos; el resto pasa intacto) ----------

const texto = z.string().nullable().optional();

export const SalidaPeligros = z.looseObject({
  ok: z.literal(true),
  resumen: z.looseObject({
    zonas_criticas: z.number().nullable(),
    peligros: z.number().nullable(),
    mas_cercano_m: z.number().nullable(),
  }),
  zonas_criticas: z.array(
    z.looseObject({
      id: z.string(),
      distancia_m: z.number(),
      categorias: z.array(z.string()),
      peligro: texto,
      paraje: texto,
      distrito: texto,
    }),
  ),
  peligros: z.array(
    z.looseObject({ id: z.string(), distancia_m: z.number(), categorias: z.array(z.string()) }),
  ),
  sin_coordenadas_en_distritos_cercanos: z.array(z.looseObject({ id: z.string(), paraje: texto })),
  datos: z.looseObject({ fuente: z.string(), fecha_captura: z.string(), dias_desde_captura: z.number() }),
});
export type SalidaPeligros = z.infer<typeof SalidaPeligros>;

const Dia = z.looseObject({
  fecha: z.string(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(["proximo", "en_curso", "terminado"]),
  nivel: z.number().int().min(1).max(4),
  color: z.string(),
});

export const SalidaAvisos = z.looseObject({
  ok: z.literal(true),
  consulta: z.looseObject({ momento: z.string() }),
  resumen: z.looseObject({
    nivel_maximo_en_curso: z.number().nullable(),
    nivel_maximo_proximo: z.number().nullable(),
    avisos: z.number(),
  }),
  meteorologicos: z.array(
    z.looseObject({
      numero: z.number(),
      anio: z.number(),
      titulo: z.string(),
      url: z.string(),
      dias: z.array(Dia),
    }),
  ),
  quebradas: z
    .looseObject({
      numero: z.number(),
      anio: z.number(),
      fin: z.string(),
      estado: z.string(),
      color: z.string(),
      zonas: z.array(
        z.looseObject({
          distrito: texto,
          provincia: texto,
          color: z.string(),
          descripcion: texto,
          recomendacion: texto,
        }),
      ),
    })
    .nullable(),
  no_evaluables: z.array(z.looseObject({ numero: z.number(), anio: z.number(), motivo: z.string() })),
  datos: z.looseObject({ obtenido_en: z.string().nullable() }),
});
export type SalidaAvisos = z.infer<typeof SalidaAvisos>;
