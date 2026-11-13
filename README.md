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
yarn test         # pruebas unitarias (node --test)
```

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
  config.js       nombre de la app, papeles, límites y claves de almacenamiento
  store.js        estado de la hoja e historial de deshacer/rehacer
  sheetview.js    la hoja en pantalla y los gestos con el puntero
  panels.js       panel «Propiedades»
  piecelist.js    panel «Piezas»
  layout.js       acomodar, reducir y rellenar con copias
  pack.js         empaquetado de rectángulos (módulo puro)
  collide.js      colisiones entre rectángulos (módulo puro)
  assets.js       lectura de imágenes y PDF (pdf.js se carga al abrir el primer PDF)
  export.js       armado del PDF (pdf-lib se carga al exportar o imprimir)
  output.js       descarga e impresión
  …               avisos, atajos, tooltips, paneles plegables, donación
test/             pruebas de los módulos puros
```
