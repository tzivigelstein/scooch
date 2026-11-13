<!--
BORRADOR. Marcadores a completar antes de publicar (aparecen entre comillas
invertidas en el texto; reemplaza también las comillas invertidas):

  <TITULAR>               Nombre de la persona o entidad responsable.
  <CORREO DE CONTACTO>    Correo para consultas sobre privacidad.
  <FECHA DE VIGENCIA>     Fecha desde la que rige esta versión.

Además, la sección Analítica es un marcador: hoy no hay analítica. Si se
agrega, hay que reescribirla antes de activarla (ver docs/legal/README.md).
-->

_Borrador. No es asesoramiento legal. Tiene que revisarlo una persona
profesional del derecho antes de publicarlo o de confiar en él._

# Política de privacidad

Vigente desde `<FECHA DE VIGENCIA>`.

## En resumen

- Tus archivos no salen de tu navegador. No los subimos, no los vemos y no los
  guardamos.
- No hay cuentas ni registro.
- Lo que Scooch guarda queda en tu dispositivo, y puedes borrarlo cuando
  quieras.
- Como pasa con cualquier sitio web, el proveedor que aloja Scooch (Vercel)
  recibe datos técnicos de cada visita.

## Quién es responsable

`<TITULAR>` ofrece Scooch. Cuando esta política dice _nosotros_, se refiere a
`<TITULAR>`. Puedes escribirnos a `<CORREO DE CONTACTO>`.

## Tus archivos

Las imágenes y los PDF que agregas se abren y se procesan dentro de tu
navegador. Scooch no los envía a ningún servidor: ni a nosotros ni a nadie más.

El PDF que descargas o imprimes también se crea en tu navegador. Al imprimir,
el navegador lo envía a la impresora que elijas, como cualquier otro documento.

## Qué se guarda en tu dispositivo

Para que no pierdas tu trabajo, Scooch guarda datos en el almacenamiento de tu
navegador (IndexedDB y localStorage). Esos datos quedan solo en ese navegador,
en ese dispositivo. No se envían a nosotros ni a nadie más.

**Proyectos.** En la base de datos `scooch` de IndexedDB, por cada proyecto:

- su nombre y las fechas en que se creó y se modificó;
- el documento: las hojas, el papel, los márgenes, las líneas de corte y, por
  cada pieza, su posición, tamaño, giro, recorte y el nombre del archivo del
  que viene;
- los archivos originales que agregaste (imágenes y PDF);
- vistas previas de cada pieza y, cuando hace falta, una versión convertida de
  la imagen para poder incluirla en el PDF;
- una miniatura de la primera hoja, para la lista de proyectos.

**Preferencias y datos de funcionamiento.** En localStorage, con nombres que
empiezan con `scooch:`:

- tus preferencias: unidades, atajos de 1 tecla, grilla e imán, si se permite
  la superposición, las secciones de Propiedades que cerraste y la última
  medida de papel personalizado;
- si elegiste que no se vuelva a mostrar la invitación a aportar;
- cuál fue el último proyecto abierto, para abrirlo cuando vuelvas;
- si cierras la pestaña antes de que termine de guardarse un cambio, una copia
  temporal del documento abierto (sin los archivos), que se borra cuando el
  proyecto queda guardado;
- una marca interna que indica que los datos de una versión anterior de la app
  ya se pasaron a los nombres actuales.

Si el navegador tenía datos guardados por una versión anterior de la app (con
el nombre `pliego`), Scooch los pasa una sola vez a los nombres de arriba y
después borra los anteriores.

Al guardar un proyecto con piezas, Scooch le pide al navegador que conserve
estos datos y que no los borre por su cuenta para liberar espacio. El navegador
decide si lo acepta.

Si abres Scooch en varias pestañas, las pestañas se avisan entre sí qué
proyecto tiene abierto cada una, para no pisar cambios. Esos avisos pasan por
un canal interno del navegador y no salen de tu dispositivo.

## Cómo borrar estos datos

- **Un proyecto:** en Proyectos, usa Eliminar. El proyecto se borra del
  navegador con todos sus archivos. No se puede deshacer.
- **Todo:** en la configuración de tu navegador, borra los datos que guardó
  este sitio. La opción suele estar en la sección de privacidad o de datos de
  sitios, según el navegador. Eso borra los proyectos y las preferencias.

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

Para consultas sobre privacidad, escribe a `<CORREO DE CONTACTO>`.
