# Limitaciones

riesgo-punto hereda las limitaciones de sus fuentes: lee también las de [peligros-pe](https://github.com/osrcmap/peligros-pe/blob/main/LIMITATIONS.md) y [avisos-pe](https://github.com/osrcmap/avisos-pe/blob/main/LIMITATIONS.md).

## Lo esencial

- **No genera alertas ni niveles propios.** Combina fuentes oficiales y señala coincidencias (cruces) como hechos.
- **Ausencia de cruces o de avisos ≠ seguridad.** El inventario de zonas críticas es parcial y los avisos son regionales.
- **No es una orden de evacuación.**

## Cruces

- La clasificación "aviso de lluvia" se hace por el título oficial del aviso (precipitación, lluvia, granizo, nevada, tormenta, chubasco). Un aviso de lluvia con otro título no generaría cruce.
- Las categorías "activables por lluvia" (flujo, inundación, deslizamiento, caída, erosión) salen de la clasificación por palabras clave de peligros-pe.
- Solo se cruzan **zonas críticas** (las priorizadas por INGEMMET), no los ~37,000 peligros del inventario general, que sí se informan en `peligros`.
- La distancia es al punto de referencia de la zona, no al borde del área que puede afectar.

## Fuentes

- **avisos-pe necesita conexión al SENAMHI desde el Perú.** Desde servidores en el extranjero o la nube, los avisos salen como no disponibles (`avisos: null`, `completo: false`).
- peligros-pe trae sus datos en el paquete (sin red); su antigüedad está en `peligros.datos.dias_desde_captura`.
- Si una pieza tarda más que el tiempo de espera (30 s / 150 s), se marca `TIEMPO_AGOTADO`.

## Mensaje

- Prioriza lluvias y huaicos: detalla hasta 3 avisos de lluvia y el de activación de quebradas. Los demás avisos (calor, viento, frío…) van en una sola línea con su nivel más alto. Si un aviso de lluvia tiene un título que no reconoce `ES_LLUVIA`, quedaría en esa línea.
- Muestra la zona crítica más cercana y el total; el detalle completo está en `peligros` y `avisos`.
- La línea "qué hacer" por nivel resume las recomendaciones oficiales del SENAMHI; no es una instrucción propia.
- Las horas se muestran en hora de Perú (UTC-5).
