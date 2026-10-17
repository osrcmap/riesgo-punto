import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unirNegativos } from "../src/cli.js";

const CLI = join(import.meta.dir, "../src/bin.ts");
const FX = join(import.meta.dir, "fixtures");
const FALSOS = join(import.meta.dir, "falsos");
const MONTERO = ["--lat", "-4.6540", "--lon", "-79.8539"];

type Modo = string | undefined;
async function correr(
  args: string[],
  o: { peligros?: Modo; avisos?: Modo; peligrosReal?: boolean; timeout?: number } = {},
) {
  const log = join(mkdtempSync(join(tmpdir(), "riesgo-punto-")), "args.log");
  const env: Record<string, string> = { ...(process.env as Record<string, string>), FALSO_LOG: log };
  // avisos-pe siempre falso: el real necesita al SENAMHI, que no responde desde CI.
  env.RIESGO_PUNTO_AVISOS_CLI = join(FALSOS, "avisos.mjs");
  if (!o.peligrosReal) env.RIESGO_PUNTO_PELIGROS_CLI = join(FALSOS, "peligros.mjs");
  if (o.peligros) env.FALSO_PELIGROS = o.peligros;
  if (o.avisos) env.FALSO_AVISOS = o.avisos;
  if (o.timeout) env.RIESGO_PUNTO_TIMEOUT_MS = String(o.timeout);
  const proc = Bun.spawn([process.execPath, CLI, ...args, "--json"], { stdout: "pipe", stderr: "pipe", env });
  const out = (await new Response(proc.stdout).text()).trim();
  const code = await proc.exited;
  let llamadas: { nombre: string; args: string[] }[] = [];
  try {
    llamadas = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  } catch {}
  return { code, json: out.startsWith("{") ? JSON.parse(out) : null, llamadas };
}
const ok = (lugar: string) => ({
  peligros: `archivo:${join(FX, `peligros-${lugar}.json`)}`,
  avisos: `archivo:${join(FX, `avisos-${lugar}.json`)}`,
});

test("unirNegativos", () => {
  expect(unirNegativos(["consultar", "--lat", "-4.6", "--lon", "-79"])).toEqual([
    "consultar",
    "--lat=-4.6",
    "--lon=-79",
  ]);
});

describe("consultar", () => {
  test("combina ambas fuentes, con cruce y mensaje", async () => {
    const { code, json } = await correr(["consultar", ...MONTERO], ok("montero"));
    expect(code).toBe(0);
    expect(json.completo).toBe(true);
    expect(json.resumen).toMatchObject({ cruces: 1, zonas_criticas_cercanas: 1, nivel_maximo_en_curso: 4 });
    expect(json.cruces[0].tipo).toBe("lluvia_y_zona_critica");
    expect(json.mensaje).toContain("ATENCIÓN");
    expect(json.peligros.datos.fuente).toContain("INGEMMET");
  });

  test("pasa radio, momento y sin-cache a las fuentes", async () => {
    const { llamadas } = await correr(
      ["consultar", ...MONTERO, "--radio", "500", "--momento", "2026-10-18T15:00-05:00", "--sin-cache"],
      ok("montero"),
    );
    const p = llamadas.find((l) => l.nombre === "PELIGROS")?.args ?? [];
    const a = llamadas.find((l) => l.nombre === "AVISOS")?.args ?? [];
    expect(p).toEqual(["cerca", "--lat", "-4.654", "--lon", "-79.8539", "--radio", "500", "--json"]);
    expect(a).toEqual([
      "punto",
      "--lat",
      "-4.654",
      "--lon",
      "-79.8539",
      "--momento",
      "2026-10-18T15:00-05:00",
      "--sin-cache",
      "--json",
    ]);
  });

  test("avisos-pe falla → respuesta parcial explícita: avisos null, no []", async () => {
    const { code, json } = await correr(["consultar", ...MONTERO], {
      ...ok("montero"),
      avisos: "error:FUENTE_NO_DISPONIBLE",
    });
    expect(code).toBe(0);
    expect(json.completo).toBe(false);
    expect(json.avisos).toBeNull();
    expect(json.resumen.avisos).toBeNull();
    expect(json.fuentes.avisos).toMatchObject({ ok: false, error: { code: "FUENTE_NO_DISPONIBLE" } });
    expect(json.mensaje).toContain("no se puede afirmar que no haya avisos");
    expect(json.cruces).toEqual([]);
  });

  test("salida no JSON o con otra forma → la fuente se marca como fallida (no se adivina)", async () => {
    const basura = await correr(["consultar", ...MONTERO], { ...ok("montero"), peligros: "basura" });
    expect(basura.json.fuentes.peligros.error.code).toBe("FORMATO_INESPERADO");
    expect(basura.json.peligros).toBeNull();
    const forma = await correr(["consultar", ...MONTERO], { ...ok("montero"), avisos: "forma" });
    expect(forma.json.fuentes.avisos.error.code).toBe("FORMATO_INESPERADO");
  });

  test("fuente que no responde → TIEMPO_AGOTADO", async () => {
    const { json } = await correr(["consultar", ...MONTERO], {
      ...ok("montero"),
      avisos: "lento",
      timeout: 1500,
    });
    expect(json.fuentes.avisos.error.code).toBe("TIEMPO_AGOTADO");
    expect(json.peligros).not.toBeNull();
  });

  test("ambas fallan → FUENTES_NO_DISPONIBLES (exit 1)", async () => {
    const { code, json } = await correr(["consultar", ...MONTERO], { peligros: "basura", avisos: "error:X" });
    expect([code, json.code]).toEqual([1, "FUENTES_NO_DISPONIBLES"]);
    expect(json.hint).toContain("no se puede afirmar que no haya peligro");
  });

  test("lat/lon invertidos → FUERA_DE_COBERTURA sin llamar a las fuentes", async () => {
    const { code, json, llamadas } = await correr(
      ["consultar", "--lat", "-79.85", "--lon", "-4.65"],
      ok("montero"),
    );
    expect([code, json.code, llamadas.length]).toEqual([2, "FUERA_DE_COBERTURA", 0]);
  });
});

test("contrato con peligros-pe real (instalado como dependencia)", async () => {
  // avisos-pe real necesita al SENAMHI (no responde desde CI): se simula.
  const { json, llamadas } = await correr(["consultar", ...MONTERO], {
    avisos: `archivo:${join(FX, "avisos-montero.json")}`,
    peligrosReal: true,
  });
  expect(llamadas.map((l) => l.nombre)).toEqual(["AVISOS"]); // peligros-pe real no escribe en el log; avisos es el falso
  expect(json.fuentes.peligros).toEqual({ ok: true });
  expect(json.peligros.zonas_criticas[0]).toMatchObject({ paraje: "Pueblo Nuevo-Las Viudas, Montero" });
}, 30_000); // peligros-pe carga 30 MB de datos: en CI tarda más de 5 s

test("doctor resume a ambas piezas", async () => {
  const { code, json } = await correr(["doctor", "--sin-red"], ok("montero"));
  expect(code).toBe(0);
  expect(json.checks.map((c: any) => [c.name, c.ok])).toEqual([
    ["peligros-pe", true],
    ["avisos-pe", true],
  ]);
});
