import { defineConfig } from 'vite';
import { fillHtml } from './src/copy/index.js';

// Paquete de node_modules al que pertenece un módulo («pdf-lib», «@scope/x»).
const packageOf = (id) => id?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1].replace('\\', '/');

export default defineConfig({
  plugins: [
    {
      // Completa los data-i18n de index.html con los textos de src/copy, en dev y en
      // el build: la página llega con los textos puestos, sin parpadeo.
      name: 'pliego-copy',
      transformIndexHtml: (html) => fillHtml(html),
    },
  ],
  build: {
    rolldownOptions: {
      output: {
        // Los chunks diferidos de dependencias (pdf.js, pdf-lib) llevan el nombre del
        // paquete; si no, pdf-lib saldría como «es-[hash].js» por su carpeta de origen.
        chunkFileNames: (chunk) => `assets/${packageOf(chunk.facadeModuleId)?.replace('/', '-') ?? '[name]'}-[hash].js`,
      },
    },
  },
});
