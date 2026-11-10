# ¿Cuánto es realmente?

Un sitio visual para dimensionar una cifra enorme: el **perjuicio patrimonial preliminar estimado**
que el Ministerio Público presentó en la imputación del llamado caso ueno.

La pregunta es simple: si compráramos o construyéramos **una cosa por día, empezando hoy**
(una vivienda social, un aula, una ambulancia, un hospital...), ¿qué fecha marcaría el
calendario cuando se termina la plata?

Es un sitio hermano de [caso-ueno.rickovelar.com](https://caso-ueno.rickovelar.com/), pero
independiente.

## Sobre la cifra (leer antes de citar)

- Es un perjuicio patrimonial **preliminar estimado**, según la imputación fiscal.
- Corresponde a depósitos de instituciones estatales y previsionales.
- **No es un monto probado como perdido.** El caso está en etapa de investigación: las personas
  imputadas no fueron acusadas ni condenadas, y parte de los depósitos se está devolviendo a
  través del Fondo de Garantía.
- El sitio no nombra a ninguna persona y no usa la marca, el logo ni los colores del banco.

Si escribís sobre esto, usá siempre la atribución: "según la imputación fiscal", "perjuicio
patrimonial preliminar estimado".

## Cómo correrlo

Hace falta Node 20 o más nuevo.

```sh
npm install
npm run dev        # http://localhost:5173
npm run validate   # revisa los CSV y muestra la tabla de resultados
npm run build      # valida y genera el sitio en dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

`dist/` es un sitio estático: se puede publicar en cualquier hosting de archivos. Los CSV se
publican tal cual en `dist/data/`, para que se puedan descargar.

## Cómo funcionan los datos

**Todo número que muestra el sitio sale de los CSV de [`data/`](data/).** No hay cifras escritas
en el código. La explicación completa está en [`data/README.md`](data/README.md). En corto:

1. La cifra es la suma de los dos componentes de `data/caso.csv`. La parte en dólares se pasa a
   guaraníes con el tipo de cambio marcado `use=1` en `data/tipo_de_cambio.csv`.
2. El costo de cada cosa es la **mediana** de sus filas con `use=1` en `data/precios.csv`.
3. Unidades = cifra ÷ costo, redondeado hacia abajo.
4. Una unidad cada `period_days` días (columna de `data/items.csv`), empezando hoy.
   La fecha final es hoy + unidades × `period_days`.

`npm run validate` revisa las columnas, que cada cosa habilitada tenga al menos un precio usado,
que cada precio tenga URL, que los números se lean bien y que haya un solo tipo de cambio en uso.
También imprime la tabla de cosa → costo → unidades → duración para revisar a ojo.

`items.csv` tiene dos columnas de presentación: `model` (qué modelo 3D se dibuja: `casa`, `aula`,
`usf`, `ambulancia`, `camioneta`, `deportivo`, `moto`, `torre`, `hospital`) y `emoji`
(se usa si el navegador no puede dibujar 3D).

## Corregir o agregar un dato

1. Editá el CSV que corresponda en `data/`. Toda fila nueva de `precios.csv` necesita una URL
   donde se pueda leer el precio. Si un dato no es comparable, dejalo con `use=0` y explicá por
   qué en `notes_es`.
2. Corré `npm run validate` y fijate que la tabla tenga sentido.
3. Mandá el cambio (pull request o issue) con la fuente.

## Cómo está hecho

- [Vite](https://vite.dev/) + JavaScript sin framework + [three.js](https://threejs.org/).
- `src/lib/`: lectura de CSV, cálculos y formato de números (los usa también el validador).
- `src/scene/models.js`: los modelos 3D, armados en código con formas simples. Cada uno devuelve
  una sola geometría; se puede reemplazar por un glTF CC0 sin tocar el resto.
- `src/lib/calendar.js`: el calendario de la corrida (una celda por día, semanas de lunes a
  domingo, meses de 7 × 6, años de 4 × 3 meses). Cada unidad tiene su día; no hay agrupamiento.
- `src/scene/stage.js`: la escena. El calendario se imprime en el piso con shaders (un rectángulo
  por año y uno por mes) y los modelos se cargan solo para los meses que se ven, con un tope fijo
  de instancias. De lejos se ven los meses y los años pintados según lo lleno que están.
- `src/ui/timeline.js` y `src/ui/stepper.js`: la línea de tiempo de abajo y el scroll, que avanza
  de a días, semanas, meses o años según la velocidad. Todo lo que se ve depende de la fecha
  marcada, así que se puede ir y volver. El modo «Explorar» cambia el scroll y los gestos por
  mover, acercar y girar la cámara.
- Respeta `prefers-reduced-motion` (sin movimientos automáticos de cámara ni caídas) y muestra el
  resultado sin animación si no hay WebGL.

## Licencia

[MIT](LICENSE). Los datos tienen sus fuentes indicadas en cada fila.
