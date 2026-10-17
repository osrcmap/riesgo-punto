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

  test("Montero: primero la coincidencia, luego lluvias, zonas, otros avisos y aviso general", async () => {
    const { p, a } = await caso("montero");
    const m = mensaje({ ...base, peligros: p, avisos: a, cruces: cruces(p, a) });
    expect(m).toContain(
      "⚠️ ATENCIÓN: hay aviso de lluvias del SENAMHI para esta zona y a 288 m hay una zona crítica por huaico (flujo de detritos, deslizamiento).",
    );
    expect(m).toContain("Aviso N° 421: Precipitaciones en la sierra norte y costa norte.");
    expect(m).toContain("Hoy amarillo · mañana naranja · lun 19 amarillo.");
    expect(m).toContain("Nivel naranja: prepárate");
    expect(m).toContain(
      "a 288 m: huaico (flujo de detritos, deslizamiento) en Pueblo Nuevo-Las Viudas, Montero.",
    );
    expect(m).toContain("No es una orden de evacuación");
    const orden = ["ATENCIÓN", "Lluvias y huaicos", "Zonas de peligro", "Otros avisos", "Fuentes:"].map((t) =>
      m.indexOf(t),
    );
    expect(orden).toEqual([...orden].sort((x, y) => x - y));
  });

  test("los avisos que no son de lluvia van en una línea, por tipo y con su nivel más alto", async () => {
    const { p, a } = await caso("montero");
    const viento = (numero: number, color: string, nivel: number, fecha: string) => ({
      ...a.meteorologicos[1],
      numero,
      titulo: "INCREMENTO DE VIENTO EN LA COSTA",
      dias: [{ ...a.meteorologicos[1].dias[0], fecha, color, nivel, estado: "proximo" as const }],
    });
    const conViento = {
      ...a,
      meteorologicos: [
        ...a.meteorologicos,
        viento(418, "amarillo", 2, "2026-10-17"),
        viento(423, "naranja", 3, "2026-10-20"),
      ],
    };
    const m = mensaje({ ...base, peligros: p, avisos: conViento, cruces: [] });
    expect(m).toContain("🌡️ Otros avisos del SENAMHI: calor (rojo hoy), viento (naranja mar 20).");
    expect(m).not.toContain("INCREMENTO");
  });

  test("si avisos falló, lo dice: nunca 'no hay avisos'", async () => {
    const { p } = await caso("montero");
    const m = mensaje({ ...base, peligros: p, avisos: null, cruces: [] });
    expect(m).toContain("no se puede afirmar que no haya avisos");
    expect(m).not.toContain("no tiene avisos");
  });

  test("si peligros falló, lo dice", async () => {
    const { a } = await caso("montero");
    const m = mensaje({ ...base, peligros: null, avisos: a, cruces: [] });
    expect(m).toContain("No pude consultar las zonas críticas del INGEMMET");
    expect(m).not.toContain("No hay zonas críticas");
  });

  test("sin zonas cercanas aclara que no significa seguridad; aviso de quebradas con recomendación oficial", async () => {
    const { p, a } = await caso("elcarmen");
    const m = mensaje({ ...base, peligros: p, avisos: a, cruces: [] });
    expect(m).toContain("no significa que el lugar sea seguro");
    expect(m).toContain(
      "Aviso N° 289 de posible activación de quebradas (huaicos): nivel amarillo hasta hoy a las 13:00.",
    );
    expect(m).toContain("Recomendación del SENAMHI: Estar atentos");
  });

  test("Chosica: sin avisos de lluvia lo dice, y el calor queda en otros avisos", async () => {
    const { p, a } = await caso("chosica");
    const m = mensaje({ ...base, peligros: p, avisos: a, cruces: [] });
    expect(m).toContain("no tiene avisos de lluvia ni de activación de quebradas");
    expect(m).toContain("a 1.1 km: huaico (flujo) en Qda. Santo Domingo");
    expect(m).toContain("En total hay 4 zonas críticas a menos de 2 km.");
    expect(m).toContain("Otros avisos del SENAMHI: calor (naranja hoy).");
  });
});
