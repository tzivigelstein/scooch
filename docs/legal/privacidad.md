_Borrador. No es asesoramiento legal. Tiene que revisarlo una persona
profesional del derecho antes de publicarlo o de confiar en él._

# Política de privacidad

Vigente desde el 19 de noviembre de 2026.

## En resumen

- Tus archivos no salen de tu navegador. No los subimos, no los vemos y no los
  guardamos.
- No hay cuentas ni registro.
- Lo que Scooch guarda queda en tu dispositivo, y puedes borrarlo cuando
  quieras.
- Como pasa con cualquier sitio web, el proveedor que aloja Scooch (Vercel)
  recibe datos técnicos de cada visita.

## Quién es responsable

Tzivi Santiago Gelstein ofrece Scooch. Cuando esta política dice _nosotros_,
se refiere a él. Puedes escribirnos a
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).

## Tus archivos

Las imágenes y los PDF que agregas se abren y se procesan dentro de tu
navegador. Scooch no los envía a ningún servidor: ni a nosotros ni a nadie más.

El PDF que descargas o imprimes también se crea en tu navegador. Al imprimir,
el navegador lo envía a la impresora que elijas, como cualquier otro documento.

Lo mismo vale para las imágenes que pegas en Scooch: se tratan como un archivo
que agregas. Al copiar o cortar piezas, Scooch deja en el portapapeles de tu
sistema solo una línea de texto (por ejemplo, «2 piezas de Scooch») y la hora
de la copia, no las imágenes.

## Qué se guarda en tu dispositivo

Para que no pierdas tu trabajo y para recordar tus preferencias, Scooch guarda
datos en el almacenamiento de tu navegador: IndexedDB y localStorage.
Esos datos quedan solo en ese navegador, en ese dispositivo. No se envían a
nosotros ni a nadie más. Scooch no guarda cookies.

### Tus proyectos

En la base de datos `scooch` de IndexedDB:

- **Proyectos.** Por cada proyecto: su nombre; cuándo se creó, cuándo se
  guardó y cuándo lo abriste por última vez; cuántas hojas y piezas tiene; una
  miniatura de la primera hoja, para la lista de Proyectos, y el documento. El
  documento tiene las hojas, el papel, el margen, la separación, la rotación
  automática, si se permite la superposición de piezas, las líneas de corte y,
  por cada pieza, su posición, tamaño, rotación y recorte, con el nombre y las
  medidas del archivo del que viene.
- **Archivos.** Los archivos originales que agregaste (imágenes y PDF), una
  vista previa de cada pieza y, cuando hace falta, una versión convertida de
  la imagen para incluirla en el PDF. Cada archivo se guarda una sola vez,
  aunque lo usen varias piezas o varios proyectos: para reconocerlo, tu
  navegador calcula una huella de su contenido (un _hash_), que tampoco sale
  de tu dispositivo.
- **Historial para deshacer.** Los últimos pasos de cada proyecto (hasta 50),
  para que Deshacer y Rehacer sigan funcionando si recargas la página o
  vuelves a abrir el proyecto. Incluye las piezas que esos pasos pueden
  devolver, con sus archivos, aunque ya las hayas quitado de la hoja.
- **Piezas cortadas.** Las piezas que cortaste con Cortar y todavía no
  pegaste, con sus archivos, para que no se pierdan si recargas la página. Se
  borran al pegarlas, o al copiar o cortar otras piezas.

Un archivo se borra del navegador cuando ya no lo usa ningún proyecto, ningún
historial para deshacer ni ninguna pieza cortada.

### Preferencias y datos de funcionamiento

En localStorage, con nombres que empiezan con `scooch:`:

- **Unidades:** mm, cm o in, como elegiste en Preferencias.
- **Tema:** automático, claro u oscuro.
- **Idioma:** automático (el de tu navegador) o el que elegiste en
  Preferencias.
- **Atajos de 1 tecla:** si están activados.
- **Vista:** el zoom (Ver la hoja entera, Ver el ancho de la hoja o el
  porcentaje que elegiste, pero nunca hasta dónde te desplazaste) y lo que
  elegiste en Alinear a y Distribuir con.
- **Grilla e imán:** si se ve la grilla, su tamaño y si el imán está activado.
- **Secciones de Propiedades:** las que cerraste, y si dejaste abierto Más
  opciones en las líneas de corte.
- **Avisos al imprimir:** si se muestran el consejo antes de imprimir o
  descargar y el resumen después, o si elegiste No volver a mostrar.
- **Papel personalizado:** la última medida de papel que escribiste.
- **Acciones recientes:** las últimas 5 acciones que elegiste en Buscar
  acciones.
- **Consejos de uso:** si se muestran, los que elegiste no volver a ver y,
  para saber cuándo ofrecer uno, cuántas veces hiciste algunas acciones con
  un botón o un menú en lugar de su atajo y cuáles ya hiciste de la forma
  más rápida. Son solo cifras y nombres de acciones, no lo que hay en tus
  proyectos.
- **Hojas ahorradas:** el total de hojas que ahorraste en este dispositivo,
  que muestra el resumen después de imprimir; una cifra redonda que
  alcanzaste, si el resumen todavía no te la mostró, y a qué comparación le
  toca el próximo resumen. Para no contar dos veces el mismo PDF, también una clave corta de
  cada uno de los últimos 50 PDF y del último que imprimiste, que se suma al
  total más tarde. La clave se calcula a partir del contenido del PDF, pero no
  permite reconstruirlo ni ver sus imágenes.
- **Invitación a aportar:** si elegiste que no se vuelva a mostrar.
- **Último proyecto:** cuál fue el último proyecto abierto, para abrirlo cuando
  vuelvas.
- **Copia temporal:** si cierras la pestaña antes de que termine de guardarse
  un cambio, una copia del documento abierto (sin los archivos), que se usa
  al volver y se borra cuando el proyecto queda guardado.
- **Marca de versión anterior:** una marca interna que indica que los datos de
  una versión anterior de la app ya se pasaron a los nombres actuales.

Si el navegador tenía datos guardados por una versión anterior de la app (con
el nombre `pliego`), Scooch los pasa una sola vez a los nombres de arriba y
después borra los anteriores. Algunas preferencias que guardaban las versiones
anteriores pueden seguir en el navegador, como si se permitía la superposición
de piezas (hoy se guarda con cada proyecto): Scooch ya no las cambia, solo las
lee para abrir los proyectos de esa época como estaban.

Al guardar un proyecto con piezas, Scooch le pide al navegador que conserve
estos datos y que no los borre por su cuenta para liberar espacio. El navegador
decide si lo acepta. En Proyectos, Scooch también le pregunta cuánto espacio
ocupan los datos y cuánto queda, para mostrártelo.

Si abres Scooch en varias pestañas, las pestañas se avisan entre sí qué
proyecto tiene abierto cada una, para no pisar cambios. Esos avisos pasan por
mecanismos internos del navegador (un canal entre pestañas y un bloqueo por
proyecto) y no salen de tu dispositivo.

## Cómo borrar estos datos

- **Un proyecto:** en Proyectos, usa Eliminar. El proyecto se borra del
  navegador con su historial para deshacer y su copia temporal, y sus archivos
  también, salvo los que todavía use otro proyecto o una pieza cortada. No se
  puede deshacer.
- **Todo:** en la configuración de tu navegador, borra los datos que guardó
  este sitio. La opción suele estar en la sección de privacidad o de datos de
  sitios, según el navegador. Eso borra los proyectos, sus archivos e
  historiales, las piezas cortadas y las preferencias.

En algunas ventanas privadas, el navegador no permite guardar proyectos.
Scooch te lo avisa, y lo que hagas se pierde al cerrar la pestaña.

Como tus archivos y tus proyectos están solo en tu dispositivo, no podemos
verlos, entregártelos ni borrarlos por ti.

## Lo que no hacemos

- No pedimos cuenta, nombre, correo ni ningún otro dato personal para usar
  Scooch.
- Scooch no usa cookies, publicidad, rastreadores ni herramientas de
  analítica.
- Scooch no carga nada de otros servidores: el código, las fuentes y las
  bibliotecas se sirven desde el mismo sitio.
- No vendemos datos personales.

## Otros servicios

### Alojamiento: Vercel

El sitio está alojado en Vercel. Como pasa con cualquier servidor web, cuando
tu navegador pide las páginas y los archivos de Scooch, Vercel recibe datos
técnicos de cada solicitud. Por ejemplo: tu dirección IP, el navegador y el
sistema que usas, la página que pediste, la fecha y la hora. Vercel trata esos
datos según su propia
[política de privacidad](https://vercel.com/legal/privacy-notice).

Tus imágenes, tus PDF y tus proyectos nunca forman parte de esas solicitudes.

### Aportes: Patreon

Si aparece la opción de aportar y abres el enlace Aportar en Patreon, vas al
sitio de Patreon, en otra pestaña. Scooch no le envía a Patreon datos tuyos ni
de tus archivos. Si no abres el enlace, Patreon no recibe nada. Lo que hagas
en Patreon se rige por su
[política de privacidad](https://privacy.patreon.com/).

### Analítica

> **PENDIENTE: completar solo si se agrega analítica.** Hoy Scooch no usa
> herramientas de analítica. Si se agrega alguna, esta sección tiene que decir
> cuál es, qué datos recoge, para qué, si usa cookies u otros identificadores,
> quién los procesa y dónde, cuánto tiempo se guardan y cómo desactivarla. Hay
> que actualizar también [Lo que no hacemos](#lo-que-no-hacemos) y la fecha de
> vigencia, antes de activarla.

## Menores de edad

Scooch no pide datos personales a nadie, tampoco a menores de edad. Si eres
menor, usa Scooch con el acompañamiento de una persona adulta responsable,
sobre todo si vas a imprimir fotos de otras personas.

## Cambios en esta política

Podemos actualizar esta política, por ejemplo cuando cambie la app. La fecha de
vigencia de arriba indica cuál es la versión actual. Si un cambio afecta lo que
se guarda o lo que se envía, lo vamos a explicar en esta página.

## Contacto

Para consultas sobre privacidad, escribe a
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).
