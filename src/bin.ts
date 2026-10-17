#!/usr/bin/env node
// Ejecutable del paquete. Separado de cli.ts para no depender de import.meta.main.
import { ejecutarCli } from "./cli.js";

await ejecutarCli(process.argv.slice(2));
