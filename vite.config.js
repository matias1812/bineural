import { defineConfig } from 'vite';
import { resolve } from 'path';

// App multi-página: cada HTML raíz se compila como entrada independiente.
// Añade aquí cualquier página nueva que crees.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'que-son-las-ondas-binaurales': resolve(__dirname, 'que-son-las-ondas-binaurales.html'),
        beneficios: resolve(__dirname, 'beneficios.html'),
        'como-usar': resolve(__dirname, 'como-usar.html'),
        'sobre-nosotros': resolve(__dirname, 'sobre-nosotros.html'),
        privacidad: resolve(__dirname, 'privacidad.html'),
        descargar: resolve(__dirname, 'descargar.html'),
      },
    },
  },
});
