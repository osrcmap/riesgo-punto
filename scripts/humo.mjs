// Prueba de humo del paquete compilado (dist/cli.js) con el Node que la ejecute (>= 20). Sin red.
//  1. Copia aislada (sin node_modules) con fuentes falsas: el bundle es autónomo.
//  2. Build del repo con peligros-pe real instalado: encuentra sus dependencias.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const fx = (n) => join(raiz, "test/fixtures", n);
const falsos = {
  RIESGO_PUNTO_AVISOS_CLI: join(raiz, "test/falsos/avisos.mjs"),
  FALSO_AVISOS: `archivo:${fx("avisos-montero.json")}`,
};

function correr(cli, args, env) {
  const r = spawnSync(process.execPath, [cli, ...args, "--json"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.ok(r.stdout.trim(), `sin salida para: ${args.join(" ")}\nstderr: ${r.stderr}`);
  return { code: r.status, json: JSON.parse(r.stdout) };
}
const MONTERO = ["consultar", "--lat", "-4.6540", "--lon", "-79.8539"];

// 1. Aislado
const aislado = mkdtempSync(join(tmpdir(), "riesgo-punto-humo-"));
for (const f of ["dist", "package.json"]) cpSync(join(raiz, f), join(aislado, f), { recursive: true });
const cliAislado = join(aislado, "dist/cli.js");
const env1 = {
  ...falsos,
  RIESGO_PUNTO_PELIGROS_CLI: join(raiz, "test/falsos/peligros.mjs"),
  FALSO_PELIGROS: `archivo:${fx("peligros-montero.json")}`,
};
assert.equal(correr(cliAislado, ["--version"], env1).json.version, pkg.version);
const r1 = correr(cliAislado, MONTERO, env1);
assert.equal(r1.code, 0);
assert.equal(r1.json.cruces[0].tipo, "lluvia_y_zona_critica");
assert.equal(
  correr(cliAislado, ["consultar", "--lat", "-79.8", "--lon", "-4.6"], env1).json.code,
  "FUERA_DE_COBERTURA",
);

// 2. Con peligros-pe real (node_modules del repo)
const r2 = correr(join(raiz, "dist/cli.js"), MONTERO, falsos);
assert.deepEqual(r2.json.fuentes.peligros, { ok: true }, JSON.stringify(r2.json.fuentes));
assert.ok(r2.json.peligros.zonas_criticas.length > 0);

console.log(`humo ok: node ${process.version}, ${pkg.name}@${pkg.version}`);
