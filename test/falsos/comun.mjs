// CLI falso de una fuente. Comportamiento según FALSO_<NOMBRE>:
//   archivo:<ruta>  imprime ese JSON | error:<CODE>  responde error estructurado
//   basura          no-JSON          | forma           JSON con otra forma
//   lento           no responde
import { appendFileSync, readFileSync } from "node:fs";

export function responder(nombre) {
  const args = process.argv.slice(2);
  if (process.env.FALSO_LOG) appendFileSync(process.env.FALSO_LOG, `${JSON.stringify({ nombre, args })}\n`);
  const modo = process.env[`FALSO_${nombre}`] ?? "";
  if (args.includes("--version")) return console.log(JSON.stringify({ ok: true, version: "9.9.9" }));
  if (args[0] === "doctor")
    return console.log(JSON.stringify({ ok: true, checks: [{ name: "x", ok: true, detail: "bien" }] }));
  if (modo.startsWith("archivo:")) return console.log(readFileSync(modo.slice(8), "utf8").trim());
  if (modo.startsWith("error:")) {
    console.log(
      JSON.stringify({ ok: false, code: modo.slice(6), error: "falla simulada", hint: "pista simulada" }),
    );
    process.exitCode = 1;
    return;
  }
  if (modo === "basura") return console.log("esto no es JSON");
  if (modo === "forma") return console.log(JSON.stringify({ ok: true, otra: "cosa" }));
  if (modo === "lento") return setTimeout(() => {}, 3_600_000);
  throw new Error(`modo desconocido: ${modo}`);
}
