import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { renderDoctor, runDoctor } from "./agent/doctor.js";
import { detectMode, type EmitOptions, emit } from "./agent/json-mode.js";
import { emitNextSteps, type NextStep } from "./agent/next-steps.js";
import { AVISO_GENERAL, cruces, ES_LLUVIA, mensaje } from "./cruces.js";
import { ERRORES, exitCode, fallo } from "./errores.js";
import { AppError } from "./foundation/error-map.js";
import { type ErrorFuente, ejecutar, type Fuente, SalidaAvisos, SalidaPeligros } from "./fuentes.js";

const enPeru = (lon: number, lat: number) => lon >= -81.5 && lon <= -68.5 && lat >= -18.5 && lat <= 0.1;
const aNumero = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);

const ENTRADAS = {
  consultar: z.strictObject({
    lat: z.preprocess(aNumero, z.number().min(-90).max(90)).describe("Latitud WGS84 (Perú: -18.5 a 0.1)"),
    lon: z
      .preprocess(aNumero, z.number().min(-180).max(180))
      .describe("Longitud WGS84 (Perú: -81.5 a -68.5)"),
    radio: z
      .preprocess(aNumero, z.number().min(1).max(50_000).default(2000))
      .describe(
        "Metros para buscar zonas críticas y peligros (se mide al punto de referencia de cada registro)",
      ),
    momento: z
      .string()
      .regex(/(Z|[+-]\d{2}:\d{2})$/, "ISO 8601 con zona horaria, p. ej. 2026-10-18T15:00-05:00")
      .optional()
      .describe("Momento para evaluar los avisos (por defecto, ahora)"),
    "sin-cache": z.boolean().default(false).describe("avisos-pe ignora su caché de 10 minutos"),
  }),
  schema: z.strictObject({ comando: z.enum(["consultar", "schema", "doctor"]).optional() }),
  doctor: z.strictObject({ "sin-red": z.boolean().default(false) }),
};
type Comando = keyof typeof ENTRADAS;

const DESCRIPCIONES: Record<Comando, string> = {
  consultar:
    "Zonas críticas y peligros cercanos (peligros-pe) y avisos que cubren el punto (avisos-pe), con cruces y un mensaje corto.",
  schema: "Describe entradas y salidas (JSON Schema).",
  doctor: "Revisa que peligros-pe y avisos-pe estén instalados y sanos (corre sus doctor).",
};
const SALIDA_CONSULTAR =
  "{ ok, completo, consulta, resumen, cruces: { tipo, descripcion, aviso, zonas[] }[], mensaje: string, peligros: <salida de peligros-pe cerca> | null, avisos: <salida de avisos-pe punto> | null, fuentes: { peligros, avisos }: { ok, error? }, aviso }";

function leerParams(v: string | undefined): Record<string, unknown> {
  if (!v) return {};
  let p: unknown;
  try {
    p = JSON.parse(v.startsWith("@") ? readFileSync(v.slice(1), "utf8") : v);
  } catch (e) {
    throw fallo("PARAMS_INVALIDOS", `No se pudo leer --params ${v}.`, e);
  }
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw fallo("PARAMS_INVALIDOS", "--params debe ser un objeto JSON.");
  return p as Record<string, unknown>;
}

/** Las coordenadas del Perú son negativas y parseArgs toma "-12.05" como otra opción. */
export function unirNegativos(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && !a.includes("=") && /^-\d/.test(argv[i + 1] ?? ""))
      out.push(`${a}=${argv[++i]}`);
    else out.push(a);
  }
  return out;
}

type Resultado = { valor: unknown; pasos?: NextStep[]; humano?: () => void; fallido?: boolean };

async function cmdConsultar(e: z.infer<typeof ENTRADAS.consultar>): Promise<Resultado> {
  if (!enPeru(e.lon, e.lat)) throw fallo("FUERA_DE_COBERTURA", `(${e.lat}, ${e.lon}) está fuera del Perú.`);
  const coords = ["--lat", String(e.lat), "--lon", String(e.lon)];
  const [rp, ra] = await Promise.all([
    ejecutar("peligros", ["cerca", ...coords, "--radio", String(e.radio)], SalidaPeligros),
    ejecutar(
      "avisos",
      [
        "punto",
        ...coords,
        ...(e.momento ? ["--momento", e.momento] : []),
        ...(e["sin-cache"] ? ["--sin-cache"] : []),
      ],
      SalidaAvisos,
    ),
  ]);
  if (!rp.ok && !ra.ok) {
    throw fallo(
      "FUENTES_NO_DISPONIBLES",
      `peligros-pe: ${rp.error.code} (${rp.error.message}); avisos-pe: ${ra.error.code} (${ra.error.message})`,
    );
  }
  const peligros = rp.ok ? rp.data : null;
  const avisos = ra.ok ? ra.data : null;
  const errores: Partial<Record<Fuente, ErrorFuente>> = {};
  if (!rp.ok) errores.peligros = rp.error;
  if (!ra.ok) errores.avisos = ra.error;
  const cs = cruces(peligros, avisos);
  const momento = avisos?.consulta.momento ?? e.momento ?? null;

  const valor = {
    ok: true,
    completo: rp.ok && ra.ok,
    consulta: { lat: e.lat, lon: e.lon, radio_m: e.radio, momento },
    resumen: {
      cruces: cs.length,
      zonas_criticas_cercanas: peligros?.resumen.zonas_criticas ?? null,
      peligros_cercanos: peligros?.resumen.peligros ?? null,
      registro_mas_cercano_m: peligros?.resumen.mas_cercano_m ?? null,
      avisos: avisos?.resumen.avisos ?? null,
      nivel_maximo_en_curso: avisos?.resumen.nivel_maximo_en_curso ?? null,
      nivel_maximo_proximo: avisos?.resumen.nivel_maximo_proximo ?? null,
      activacion_quebradas: avisos ? Boolean(avisos.quebradas) : null,
      // Los avisos de lluvia son los que activan huaicos: el bot avisa de estos (y de cualquier nivel rojo).
      avisos_de_lluvia: avisos
        ? avisos.meteorologicos
            .filter((m) => ES_LLUVIA.test(m.titulo))
            .map((m) => ({ numero: m.numero, anio: m.anio }))
        : null,
    },
    cruces: cs,
    mensaje: mensaje({
      lat: e.lat,
      lon: e.lon,
      radio: e.radio,
      momento,
      peligros,
      avisos,
      errores,
      cruces: cs,
    }),
    peligros,
    avisos,
    fuentes: {
      peligros: rp.ok ? { ok: true } : { ok: false, error: rp.error },
      avisos: ra.ok ? { ok: true } : { ok: false, error: ra.error },
    },
    aviso: AVISO_GENERAL,
  };
  const pasos: NextStep[] = [];
  if (!ra.ok)
    pasos.push({ command: "riesgo-punto doctor", description: "Ver por qué no respondió avisos-pe" });
  for (const m of avisos?.meteorologicos ?? []) {
    pasos.push({
      command: `avisos-pe aviso ${m.numero} --anio ${m.anio}`,
      description: "Texto oficial del aviso",
      optional: true,
    });
  }
  const z0 = peligros?.zonas_criticas[0];
  if (z0)
    pasos.push({
      command: `peligros-pe zona ${z0.id}`,
      description: "Detalle y boletín de la zona crítica",
      optional: true,
    });
  return { valor, pasos, humano: () => process.stdout.write(`${valor.mensaje}\n`) };
}

function cmdSchema(e: z.infer<typeof ENTRADAS.schema>): Resultado {
  if (!e.comando) {
    return {
      valor: {
        ok: true,
        comandos: Object.entries(DESCRIPCIONES).map(([nombre, descripcion]) => ({ nombre, descripcion })),
        flags_globales: {
          "--json": "Fuerza salida JSON.",
          "--params": "Entrada como objeto JSON o @archivo.json.",
        },
      },
    };
  }
  return {
    valor: {
      ok: true,
      comando: e.comando,
      descripcion: DESCRIPCIONES[e.comando],
      entrada: z.toJSONSchema(ENTRADAS[e.comando], { io: "input" }),
      salida: e.comando === "consultar" ? SALIDA_CONSULTAR : "{ ok, checks: { name, ok, detail }[] }",
    },
  };
}

async function cmdDoctor(e: z.infer<typeof ENTRADAS.doctor>): Promise<Resultado> {
  const Doctor = z.looseObject({
    ok: z.boolean(),
    checks: z.array(z.looseObject({ name: z.string(), ok: z.boolean(), detail: z.string() })),
  });
  const Version = z.looseObject({ ok: z.literal(true), version: z.string() });
  const revisar = (f: Fuente) => async () => {
    const [v, d] = await Promise.all([
      ejecutar(f, ["--version"], Version),
      ejecutar(f, ["doctor", ...(e["sin-red"] ? ["--sin-red"] : [])], Doctor),
    ]);
    const nombre = f === "peligros" ? "peligros-pe" : "avisos-pe";
    if (!v.ok) return { name: nombre, ok: false, detail: `${v.error.code}: ${v.error.message}` };
    // doctor sale con código 1 cuando algo falla: lo leemos igual desde su JSON.
    if (!d.ok)
      return {
        name: nombre,
        ok: false,
        detail: `${v.data.version} — doctor: ${d.error.code} ${d.error.message}`,
      };
    const malos = d.data.checks.filter((c) => !c.ok);
    return {
      name: nombre,
      ok: d.data.ok,
      detail: `${v.data.version} — ${malos.length ? malos.map((c) => `${c.name}: ${c.detail}`).join("; ") : `${d.data.checks.length} chequeos ok`}`,
    };
  };
  const r = await runDoctor([revisar("peligros"), revisar("avisos")]);
  return { valor: r, fallido: !r.ok };
}

const AYUDA = `riesgo-punto ${pkg.version} — zonas críticas (INGEMMET) y avisos (SENAMHI) para un punto del Perú

Uso:
  riesgo-punto consultar --lat -4.654 --lon -79.854 [--radio 2000] [--momento 2026-10-18T15:00-05:00]
  riesgo-punto schema [comando]
  riesgo-punto doctor [--sin-red]

Flags globales: --json, --params <json|@archivo>, --sin-cache, -h/--help, --version

Información de referencia de fuentes oficiales; no es una orden de evacuación.
`;

function parsear(argv: string[]) {
  return parseArgs({
    args: unirNegativos(argv),
    allowPositionals: true,
    strict: true,
    options: {
      lat: { type: "string" },
      lon: { type: "string" },
      radio: { type: "string" },
      momento: { type: "string" },
      "sin-cache": { type: "boolean" },
      "sin-red": { type: "boolean" },
      json: { type: "boolean" },
      params: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
}

async function main(argv: string[]) {
  let parsed: ReturnType<typeof parsear>;
  try {
    parsed = parsear(argv);
  } catch (err) {
    throw fallo("ARGS_INVALIDOS", err instanceof Error ? err.message : String(err), err);
  }
  const { values, positionals } = parsed;
  const opts: EmitOptions = { json: values.json };
  if (values.version) return emit({ ok: true, version: pkg.version }, opts, (v) => console.log(v.version));
  const comando = positionals[0];
  if (values.help || !comando) return void process.stdout.write(AYUDA);
  if (!(comando in ENTRADAS)) throw fallo("COMANDO_DESCONOCIDO", `Comando desconocido: ${comando}.`);
  const cmd = comando as Comando;

  const { json: _j, params, help: _h, version: _v, ...flags } = values;
  const crudo: Record<string, unknown> = { ...leerParams(params) };
  for (const [k, v] of Object.entries(flags)) if (v !== undefined) crudo[k] = v;
  if (positionals[1] !== undefined) {
    if (cmd !== "schema" || positionals.length > 2) {
      throw fallo("ARGS_INVALIDOS", `Argumentos de más: ${positionals.slice(1).join(" ")}`);
    }
    crudo.comando = positionals[1];
  }
  const entrada = ENTRADAS[cmd].safeParse(crudo);
  if (!entrada.success) throw fallo("ARGS_INVALIDOS", z.prettifyError(entrada.error));
  const e: any = entrada.data;

  const r =
    cmd === "consultar" ? await cmdConsultar(e) : cmd === "schema" ? cmdSchema(e) : await cmdDoctor(e);
  if (cmd === "doctor") renderDoctor(r.valor as any, opts);
  else emit(r.valor, opts, r.humano ? () => r.humano?.() : undefined);
  emitNextSteps(r.pasos ?? [], opts);
  if (r.fallido) process.exitCode = 1;
}

/** Punto de entrada (lo llama src/bin.ts). Nunca lanza: todo error sale estructurado con su exit code. */
export async function ejecutarCli(argv: string[]): Promise<void> {
  try {
    await main(argv);
  } catch (err: unknown) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            "ERROR_INTERNO",
            { ...ERRORES.ERROR_INTERNO, human: err instanceof Error ? err.message : String(err) },
            err,
          );
    if (detectMode({ json: argv.includes("--json") }) === "json") {
      process.stdout.write(`${JSON.stringify(appErr.toJSON())}\n`);
    } else {
      process.stderr.write(`✗ ${appErr.human}\n${appErr.hint ? `  ${appErr.hint}\n` : ""}`);
    }
    process.exitCode = exitCode(appErr.code);
  }
}
