import { defineConfig } from 'vite';

// Paquete de node_modules al que pertenece un módulo («pdf-lib», «@scope/x»).
const packageOf = (id) => id?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1].replace('\\', '/');

export default defineConfig({
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
