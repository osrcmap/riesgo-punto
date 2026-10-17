import { describe, expect, test } from "bun:test";
import { cruces, mensaje } from "../src/cruces.js";
import { SalidaAvisos, SalidaPeligros } from "../src/fuentes.js";

// Salidas reales de peligros-pe 0.1.3 y avisos-pe 0.1.1 (17/10/2026, momento 10:00 en Lima).
const fx = async (n: string) => JSON.parse(await Bun.file(`${import.meta.dir}/fixtures/${n}.json`).text());
const caso = async (lugar: string) => ({
  p: SalidaPeligros.parse(await fx(`peligros-${lugar}`)),
  a: SalidaAvisos.parse(await fx(`avisos-${lugar}`)),
});

describe("cruces", () => {
  test("Montero: aviso de lluvias + zona crítica de flujo a 288 m", async () => {
    const { p, a } = await caso("montero");
    const cs = cruces(p, a);
    expect(cs.map((c) => [c.tipo, (c.aviso as any).numero, c.zonas[0].distancia_m])).toEqual([
      ["lluvia_y_zona_critica", 421, 288],
    ]);
    expect(cs[0].descripcion).toContain("naranja el 18/10");
  });

  test("Chosica: el aviso es de temperatura, no de lluvia → sin cruce aunque haya zonas de flujo", async () => {
    const { p, a } = await caso("chosica");
    expect(p.zonas_criticas.length).toBeGreaterThan(0);
    expect(cruces(p, a)).toEqual([]);
  });

  test("El Carmen: aviso de quebradas pero sin zona crítica cercana → sin cruce", async () => {
    const { p, a } = await caso("elcarmen");
    expect(a.quebradas).not.toBeNull();
    expect(cruces(p, a)).toEqual([]);
  });

  test("quebradas + zona crítica de flujo → cruce de activación de quebradas", async () => {
    const { a } = await caso("elcarmen");
    const { p } = await caso("montero");
    expect(cruces(p, a).map((c) => c.tipo)).toContain("activacion_quebradas_y_zona_critica");
  });

  test("sin una de las fuentes no hay cruces", async () => {
    const { p, a } = await caso("montero");
    expect(cruces(null, a)).toEqual([]);
    expect(cruces(p, null)).toEqual([]);
  });
});

describe("mensaje", () => {
  const base = { lat: -4.654, lon: -79.8539, radio: 2000, momento: "2026-10-17T10:00:00-05:00", errores: {} };

  test("incluye el cruce, los avisos, la zona y el aviso general", async () => {
    const { p, a } = await caso("montero");
    const m = mensaje({ ...base, peligros: p, avisos: a, cruces: cruces(p, a) });
    expect(m).toContain("ATENCIÓN: El punto está dentro del aviso N° 421-2026");
    expect(m).toContain("a 288 m: Flujo de detritos, deslizamiento (Pueblo Nuevo-Las Viudas, Montero)");
    expect(m).toContain("No es una orden de evacuación");
  });

  test("si avisos falló, lo dice: nunca 'no hay avisos'", async () => {
    const { p } = await caso("montero");
    const m = mensaje({ ...base, peligros: p, avisos: null, cruces: [] });
    expect(m).toContain("no se puede afirmar que no haya avisos");
    expect(m).not.toContain("Ningún aviso");
  });

  test("sin zonas cercanas aclara que no significa seguridad", async () => {
    const { p, a } = await caso("elcarmen");
    const m = mensaje({ ...base, peligros: p, avisos: a, cruces: [] });
    expect(m).toContain("no significa que el lugar sea seguro");
    expect(m).toContain("Aviso de posible activación de quebradas N° 289-2026");
  });
});
