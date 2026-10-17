---
name: riesgo-punto
description: Para una ubicación en el Perú, reúne en una respuesta las zonas críticas de peligro geológico cercanas (INGEMMET) y los avisos oficiales del SENAMHI que la cubren (lluvias, quebradas/huaicos), señala coincidencias importantes y da un mensaje corto listo para enviar. Úsalo cuando alguien pregunte "¿hay peligro donde vivo?", "¿me puede afectar un huaico?" o pida una alerta para un lugar del Perú.
---

# riesgo-punto

## Flujo

1. Consigue **coordenadas** (lat/lon WGS84). En asentamientos humanos pide la ubicación compartida antes que una dirección.
2. Consulta (si no está instalado globalmente, antepone `npx @osrcmap/`):
   ```bash
   riesgo-punto consultar --lat <lat> --lon <lon> --json
   ```
   Opcional: `--radio <m>` (por defecto 2000), `--momento 2026-10-19T15:00-05:00`.
3. Para enviar por WhatsApp/SMS usa el campo `mensaje` tal cual.
4. Detalle: los comandos de `next-step` (stderr) llevan a `avisos-pe aviso <n>` y `peligros-pe zona <id>`.

## Cómo responder

- Si hay `cruces`, empieza por ellos: son coincidencias entre un aviso oficial y una zona crítica cercana.
- Cita fuentes y fechas (`avisos.datos.obtenido_en`, `peligros.datos.fecha_captura`).
- Si `completo` es `false`, di qué fuente no respondió (`fuentes.*.error`) y que **no** se puede afirmar que no haya avisos o zonas.
- **Nunca** digas que un lugar "está a salvo". **Nunca** des órdenes de evacuación ni inventes niveles. Remite a INDECI, SENAMHI y la municipalidad.

## Errores

`{"ok": false, "code", "error", "hint"}`:
- `FUERA_DE_COBERTURA`: casi siempre lat/lon invertidos.
- `FUENTES_NO_DISPONIBLES`: ninguna fuente respondió; no hay información.
- `ARGS_INVALIDOS`: revisa `riesgo-punto schema consultar`.
