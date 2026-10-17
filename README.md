# riesgo-punto

Para un punto del Perú, en una sola respuesta:

- **Zonas críticas y peligros cercanos** del inventario del INGEMMET ([`peligros-pe`](https://github.com/osrcmap/peligros-pe)).
- **Avisos del SENAMHI** que cubren el punto, día por día, incluido el de posible activación de quebradas ([`avisos-pe`](https://github.com/osrcmap/avisos-pe)).
- **Cruces**: cuando un aviso de lluvia o de quebradas coincide con una zona crítica cercana que la lluvia puede activar.
- **Un mensaje corto** listo para enviar por WhatsApp o SMS.

Es el núcleo para bots de alerta, paneles municipales y agentes durante El Niño 2026-2027.

> **Información de referencia, no una alerta propia.** riesgo-punto no inventa niveles: solo combina y cita fuentes oficiales. No es una orden de evacuación. Ante una emergencia sigue a INDECI, SENAMHI y tu municipalidad.

## Uso

```bash
npm i -g @osrcmap/riesgo-punto        # instala también peligros-pe y avisos-pe

riesgo-punto consultar --lat -4.654 --lon -79.8539
riesgo-punto consultar --lat -11.9437 --lon -76.7036 --radio 1000 --momento 2026-10-18T15:00-05:00
riesgo-punto doctor
```

```text
Ubicación (-4.654, -79.8539) - 17/10 10:00 (hora de Perú)
ATENCIÓN: El punto está dentro del aviso N° 421-2026 del SENAMHI (precipitaciones en la sierra norte y costa norte: amarillo el 17/10, naranja el 18/10, amarillo el 19/10) y a 288 m de una zona crítica por flujo de detritos, deslizamiento (INGEMMET).
Aviso SENAMHI N° 421: precipitaciones en la sierra norte y costa norte - amarillo 17/10, naranja 18/10, amarillo 19/10.
Aviso SENAMHI N° 419: incremento de temperatura diurna en la costa y sierra - rojo 17/10, naranja 18/10, naranja 19/10.
Zonas críticas INGEMMET a menos de 2000 m: 1. La más cercana, a 288 m: Flujo de detritos, deslizamiento (Pueblo Nuevo-Las Viudas, Montero).
Información de referencia de fuentes oficiales (SENAMHI, INGEMMET). No es una orden de evacuación. ...
```

> **Ejecútalo desde el Perú.** El SENAMHI no responde a servidores en el extranjero o en la nube. Fuera del Perú, `consultar` devuelve las zonas del INGEMMET y marca los avisos como no disponibles.

## Respuesta (`--json`)

| Campo | Contenido |
|---|---|
| `completo` | `true` si ambas fuentes respondieron |
| `resumen` | cruces, zonas críticas y peligros cercanos, avisos, nivel máximo en curso y próximo, si hay aviso de quebradas. `null` si la fuente no respondió |
| `cruces[]` | `{ tipo, descripcion, aviso, zonas[] }` (ver abajo) |
| `mensaje` | Texto corto con hechos, fuentes y aviso general |
| `peligros` | Salida completa de `peligros-pe cerca`, o `null` |
| `avisos` | Salida completa de `avisos-pe punto`, o `null` |
| `fuentes` | `{ peligros, avisos }`: `{ ok }` o `{ ok: false, error: { code, message, hint } }` |

**Si una fuente falla**, la respuesta sigue siendo útil pero explícita: su campo es `null` (nunca `[]`), `completo` es `false` y el `mensaje` dice que no se puede afirmar que no haya avisos. Si fallan ambas, el error es `FUENTES_NO_DISPONIBLES`.

### Cruces

| Tipo | Cuándo |
|---|---|
| `activacion_quebradas_y_zona_critica` | El punto está en una zona del aviso de posible activación de quebradas **y** hay una zona crítica por **flujo** (huaico) dentro del radio |
| `lluvia_y_zona_critica` | El punto está en un aviso de **lluvia** (título con precipitación, lluvia, granizo, nevada, tormenta o chubasco) de nivel amarillo o mayor **y** hay una zona crítica por flujo, inundación, deslizamiento, caída o erosión dentro del radio |

Avisos de temperatura o viento no generan cruces. Los cruces son hechos verificables con sus fuentes, no un nivel de riesgo nuevo.

### Para agentes

- `schema consultar` da el JSON Schema de la entrada; `--params @consulta.json` en lugar de flags.
- Errores: `{ "ok": false, "code", "error", "hint" }`; salida `2` uso incorrecto, `1` fuentes o internos.
- Ver [`SKILL.md`](SKILL.md).

## Cómo funciona

riesgo-punto ejecuta `peligros-pe` y `avisos-pe` (dependencias npm) y valida su JSON contra el contrato que usa: si una pieza cambia de forma, esa fuente se marca `FORMATO_INESPERADO` en vez de adivinar. Variables `RIESGO_PUNTO_PELIGROS_CLI` / `RIESGO_PUNTO_AVISOS_CLI` permiten usar otras instalaciones, y `RIESGO_PUNTO_TIMEOUT_MS` acota la espera (por defecto 30 s para peligros-pe y 150 s para avisos-pe).

## Desarrollo

```bash
bun install
bun test                   # fuentes reales capturadas + CLIs falsos para cada falla
bun run typecheck && bun run lint
bun run build && node scripts/humo.mjs
```

Bloques de [cligentic](https://github.com/Railly/cligentic) (MIT) en `src/agent`, `src/foundation` y `src/platform`.

## Licencia

Código: MIT. Los datos son del SENAMHI y del INGEMMET; atribúyelos siempre a su fuente.
