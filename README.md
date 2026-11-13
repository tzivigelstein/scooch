# Pliego

Web app para acomodar imágenes y páginas de PDF en una hoja a tamaño real y
descargar o imprimir un PDF exacto. Todo pasa en el navegador: los archivos no
se suben a ningún servidor.

JavaScript sin framework (módulos ES) con [Vite](https://vite.dev) para
desarrollar y armar el build.

## Desarrollo

Requiere Node.js 20.19+ o 22.12+ y Yarn 1.

```sh
yarn install      # dependencias
yarn dev          # servidor de desarrollo con recarga en caliente
yarn build        # build de producción en dist/
yarn preview      # sirve dist/ para probar el build
yarn test         # pruebas unitarias (Vitest)
yarn e2e          # pruebas de navegador (Playwright, ver e2e/run.mjs)
```

## Proyectos y privacidad

Cada trabajo es un proyecto que se guarda solo en este navegador (IndexedDB):
el documento, sus archivos originales y las vistas previas ya rasterizadas.
Nada se sube a ningún servidor. Si el navegador no permite IndexedDB (algunas
ventanas privadas), la app funciona igual pero no guarda, y lo avisa.

Con la app abierta en varias pestañas, cada proyecto lo guarda una sola: la
que lo abre se lo pide a las otras por `BroadcastChannel`, y la que lo tenía
guarda lo pendiente, deja de guardar y avisa («Editar aquí» lo recupera,
recargándolo). Así nunca se pisan cambios en silencio.

## Pantallas grandes

Hasta 1600 px de ancho la interfaz mide siempre lo mismo. Desde ahí crece de
a poco hasta 1,25 × hacia los 2800 px: todo está en rem y el tamaño de letra
raíz (`html` en `src/styles.css`) parte del 100 % del navegador, así respeta
el zoom y el tamaño de letra elegido. Los paneles (`--left-w` y `--right-w`,
en `:root`) además crecen con la pantalla hasta un tope. La hoja tiene su
propio zoom (ocupa el alto disponible) y no cambia con esto.

## Despliegue en Vercel

Importa el repositorio en Vercel: detecta Vite y no hace falta configurar
nada (instala con `yarn install`, compila con `vite build` y publica `dist/`).
`vercel.json` solo agrega cabeceras de caché largas para los archivos con hash
de `dist/assets/`.

## Estructura

```
index.html        página única (Vite la usa como entrada)
src/
  app.js          arranque: arma la interfaz y conecta las acciones
  styles.css      estilos
  copy/           todos los textos de la interfaz (es.js) y t(clave, params)
  config.js       nombre de la app, límites y claves de almacenamiento
  store.js        documento (hojas y piezas), assets e historial de deshacer
  sheetview.js    las hojas en pantalla, una debajo de otra, y los gestos
                  (mover, escalar y elegir con un recuadro)
  panels.js       panel Propiedades (campos de longitud: lengthfield.js)
  piecelist.js    panel Piezas, agrupado por hoja (selección múltiple)
  groupactions.js acciones sobre la selección: aplica los planes de group.js,
                  con un paso de deshacer, y los anuncia
  layout.js       acomodar, reducir, ubicar lo nuevo y rellenar con copias
  measure.js      medidas y nombres de papel en la unidad elegida
  prefs.js        diálogo Preferencias (unidades, atajos de 1 tecla)
  projects.js     proyecto abierto, guardado automático y varias pestañas
  projectsui.js   nombre del proyecto en la barra y diálogo Proyectos
  idbstorage.js   almacenamiento de proyectos en IndexedDB
  assets.js       lectura de imágenes y PDF (pdf.js se carga recién al
                  necesitarlo) y binarios para guardar y restaurar
  export.js       armado del PDF, una página por hoja, con recorte y líneas
                  de corte (pdf-lib se carga al exportar o imprimir)
  output.js       descarga e impresión
  módulos puros (sin DOM, con pruebas en test/):
    pack.js         empaquetado de rectángulos en una o varias hojas
    sheets.js       varias hojas: repartir, ubicar lo nuevo, problemas por hoja
    projectdoc.js   formato versionado del proyecto (serializar, migrar, validar)
    projectstore.js lógica de proyectos sobre un almacenamiento intercambiable
    group.js        operaciones de grupo: planes de mover, girar, escalar,
                    alinear, distribuir y soltar, y reglas de la selección
    align.js        alinear, distribuir y transformar rectángulos
    crop.js         recorte, tamaños de foto y geometría en pantalla y en el PDF
    cutmarks.js     líneas de corte (marcas en las esquinas o contorno)
    units.js, papers.js, collide.js, placement.js, humanize.js
  …               avisos, atajos, tooltips, paneles plegables, diálogos y donación
test/             pruebas de los módulos puros (y del armado del PDF)
docs/copy.md      guía de copy: reglas, glosario y ejemplos
vite.config.js    completa los textos de index.html y nombra los chunks diferidos
```
