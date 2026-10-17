import { AppError, type ErrorMap } from "./foundation/error-map.js";

export const ERRORES = {
  ARGS_INVALIDOS: {
    name: "ArgsInvalidos",
    human: "Parámetros inválidos.",
    hint: "Revisa los parámetros con `riesgo-punto schema <comando>`.",
  },
  COMANDO_DESCONOCIDO: {
    name: "ComandoDesconocido",
    human: "Comando desconocido.",
    hint: "Comandos: consultar, schema, doctor. Usa `riesgo-punto --help`.",
  },
  PARAMS_INVALIDOS: {
    name: "ParamsInvalidos",
    human: "No se pudo leer --params.",
    hint: "--params acepta un objeto JSON en línea o @ruta/al/archivo.json.",
  },
  FUERA_DE_COBERTURA: {
    name: "FueraDeCobertura",
    human: "El punto está fuera del Perú.",
    hint: "Verifica el orden: --lat es la latitud (Perú: -18.5 a 0.1) y --lon la longitud (Perú: -81.5 a -68.5).",
  },
  FUENTES_NO_DISPONIBLES: {
    name: "FuentesNoDisponibles",
    human: "No se pudo consultar ninguna fuente.",
    hint: "No hay información para este punto: no se puede afirmar que no haya peligro. Revisa `riesgo-punto doctor`.",
  },
  ERROR_INTERNO: {
    name: "ErrorInterno",
    human: "Error inesperado.",
    hint: "Abre un issue con el comando exacto que corriste.",
  },
} satisfies ErrorMap;

export type Codigo = keyof typeof ERRORES;

export const exitCode = (code: string) =>
  ["ARGS_INVALIDOS", "COMANDO_DESCONOCIDO", "PARAMS_INVALIDOS", "FUERA_DE_COBERTURA"].includes(code) ? 2 : 1;

export const fallo = (code: Codigo, detalle?: string, causa?: unknown) =>
  new AppError(code, detalle ? { ...ERRORES[code], human: detalle } : ERRORES[code], causa);
