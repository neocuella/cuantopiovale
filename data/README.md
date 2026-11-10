# Datos

Todo número que muestra el sitio sale de estos archivos. No hay cifras escritas en el código.
Son CSV en UTF-8, con coma como separador y punto como separador decimal.

| Archivo | Qué contiene |
|---|---|
| `caso.csv` | Los dos componentes de la cifra de la imputación fiscal (guaraníes y dólares). |
| `caso_fuentes.csv` | Las notas de prensa de donde sale la cifra y qué dice cada una. |
| `tipo_de_cambio.csv` | Tipo de cambio del BCP. La fila con `use=1` es la que usa el sitio. |
| `items.csv` | Las cosas con las que se compara la cifra. `enabled=1` son las que se muestran. |
| `precios.csv` | Cada precio encontrado para cada cosa, con su fuente. |
| `referencias.csv` | Datos de escala: salario mínimo, población, billetes, edificios, presupuesto. |
| `hitos.csv` | Marcas que aparecen en la línea de tiempo (elecciones, mundiales, etc.). |

## Cómo se calcula

1. **La cifra.** Se suman los dos componentes de `caso.csv`. La parte en dólares se pasa a
   guaraníes con el tipo de cambio marcado `use=1` en `tipo_de_cambio.csv`. Todo el cálculo
   se hace en guaraníes, porque la mayor parte de la cifra y casi todos los precios están en
   guaraníes y el dólar varió mucho en 2026.
2. **El costo de cada cosa.** Es la **mediana** de las filas de `precios.csv` de esa cosa
   que tienen `use=1`. Los precios en dólares se pasan a guaraníes con el mismo tipo de cambio.
   Si una cosa se compra por partes, cada fila dice cuál en `component_es` (la cama de terapia
   intensiva tiene cama, monitor y respirador): se saca la mediana de cada parte y se suman.
3. **Cuántas alcanzan.** Cifra dividida por costo unitario, redondeado hacia abajo.
4. **Hasta cuándo.** Una unidad cada `period_days` días (columna de `items.csv`), empezando hoy.

## Qué precios se usan (`use`)

- Se usan los datos de **2024 en adelante**. Los anteriores quedan en el archivo con `use=0`
  como referencia.
- Si hay menos de tres datos comparables desde 2024, se incluyen los de 2022 y 2023
  (pasa con las ambulancias).
- Quedan con `use=0` los datos que no son comparables: precios referenciales no adjudicados,
  variantes del mismo producto, obras de otro tipo. La columna `notes_es` dice por qué.
- Los precios son nominales del año indicado. No están ajustados por inflación.

## Tipos de fuente (`source_type`)

- `dncp`: registro del portal de Contrataciones Públicas. El `tender_id` es el ID de licitación
  y la URL apunta al registro en la API abierta de la DNCP.
- `anuncio_oficial`: comunicado de una institución pública.
- `prensa`: nota de un medio que cita el monto de un contrato o una entrega.
- `anuncio_comercial`: precio publicado por un vendedor.
- `precio_de_lista`: precio de lista del fabricante.

## Sobre la cifra

Es un **perjuicio patrimonial preliminar estimado** por el Ministerio Público en la imputación
del 7 de noviembre de 2026 (Causa Penal N.º 92/2026). Corresponde a depósitos de instituciones
estatales y previsionales en ueno bank a septiembre de 2026. No es un monto probado como
perdido ni robado: el caso está en etapa de investigación, las personas imputadas no fueron
acusadas ni condenadas, y parte de los depósitos se está devolviendo a través del Fondo de
Garantía. La cifra sale de notas de prensa; el acta de imputación no fue encontrada publicada.

## Pendientes conocidos

- Leer la cifra directamente del acta de imputación cuando se publique.
- Precio oficial de lista de la Toyota Hilux en Paraguay (hoy: anuncio de concesionaria).
- Precio del Lamborghini en Paraguay (hoy: precio de lista de Estados Unidos de 2022).
- Confirmar el salario mínimo en la Gaceta Oficial.
- Matrícula escolar, para poder mostrar el almuerzo escolar.

## Corregir o agregar un dato

Editá el CSV que corresponda y corré `npm run validate`. Toda fila nueva de `precios.csv`
necesita una URL donde se pueda leer el precio.
