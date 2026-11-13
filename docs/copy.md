# Guía de copy

Cómo se escriben los textos de la interfaz: todo lo que se ve, lo que aparece
en tooltips y lo que se anuncia a lectores de pantalla.

Las reglas son un resumen propio que deriva de las pautas de escritura de
Material Design (Google):
[Content design](https://m3.material.io/foundations/content-design/overview)
y [Writing](https://m2.material.io/design/communication/writing.html). El
idioma es español latinoamericano neutro, como el es-419 de los productos de
Google.

## Dónde viven los textos

- `src/copy/es.js`: todas las cadenas, agrupadas por área (`bar`, `pieces`,
  `sheet`, `piecebar`, `props`, `notices`, `busy`, `errors`, `announce`,
  `donate`, `shortcuts`, `keys`…).
- `src/copy/index.js`: `t('area.clave', { n, … })` interpola `{param}`,
  formatea los números (coma decimal) y elige el plural con `Intl.PluralRules`
  según `n` (`{ one: '{n} pieza', other: '{n} piezas' }`). `{app}` es siempre
  el nombre de la app (`APP_NAME`, en `src/config.js`) y `{mod}` la tecla Ctrl
  (⌘ en Mac). `keyLabel('Mod+Shift+Z')` da el nombre visible de un atajo.
- `index.html` no tiene textos: cada elemento lleva su clave (`data-i18n` para
  el contenido; `data-i18n-label`, `-tip`, `-note` y `-content` para
  `aria-label`, `data-tip`, `data-tip-note` y `content`; `data-i18n-params` con
  parámetros en JSON). Vite los completa al servir y al compilar, así la
  página llega con los textos puestos.
- Ningún otro archivo escribe textos de interfaz. Los mensajes de consola y los
  errores internos que nunca ve nadie quedan en el código.

Para sumar otro idioma: un `en.js` con las mismas claves, elegido en
`src/copy/index.js` (lo que falte se toma del español).

## Reglas

### Voz y tono

- Frases cortas y directas. Lo importante primero.
- Segunda persona, tuteo: «Selecciona una pieza para editarla».
- Presente para describir estados e instrucciones: «La hoja está vacía»,
  «Se imprime a 300 ppp».
- Sin exclamaciones ni relleno («por favor», «simplemente», «solo tienes que»).
- Sin culpar: el problema es de la situación, no de la persona. «El margen no
  deja espacio para las piezas», no «Pusiste un margen demasiado grande».
- Mismo término para lo mismo, siempre (ver el glosario).

### Español latinoamericano neutro

- Imperativos de tú: «Suelta», «elige», «presiona», «selecciona», «agrega»,
  «quita», «reduce», «prueba», «guárdalo», «vuelve».
- Nada de voseo: no «soltá», «elegí», «apretá», «podés», «usás».
- Vocabulario general: «aquí» (no «acá»), «presionar» (no «apretar»),
  «reducir» (no «achicar»), «más pequeño» (no «más chico»).

### Mayúsculas y puntuación

- Mayúscula solo en la primera palabra (y en nombres propios y siglas) en
  títulos, etiquetas, botones y tooltips: «Atajos de teclado», «Descargar PDF».
- Sin punto final en etiquetas, botones, tooltips, encabezados y mensajes de
  una sola frase: «Hay piezas superpuestas».
- Con dos frases o más, punto en todas: «Se descargó pliego-a4.pdf. Al
  imprimirlo, elige «Tamaño real» o «100 %».»
- Los mensajes que se juntan en la región viva van sin punto; `live.js`
  agrega el punto al unirlos para que el lector haga la pausa.
- Comillas angulares « » solo para citar opciones de interfaces ajenas (el
  diálogo de impresión del navegador: elige «Tamaño real» o «100 %») y lo que
  escribió o nombró la persona (un proyecto: Se abrió «Tarjetas»; una medida
  que no se entiende: «hola» no es una medida válida).
- Las secciones, botones y diálogos propios van sin comillas: «usa el botón
  Imprimir», «Abrir Proyectos», «en Propiedades». Si el nombre lleva a ese
  lugar, va como enlace en la misma frase (ver «Enlaces dentro de una frase»).
  En esta guía, las comillas solo delimitan los ejemplos.
- «…» solo para lo que está en curso: «Creando el PDF…».

### Números y unidades

- Siempre con cifras: «1 pieza», «Atajos de 1 tecla», «Girar 90°».
- Unidad separada por un espacio que no se parte (` `): «10 mm»,
  «300 ppp», «100 %», «40 MB». Las medidas tampoco se parten:
  «210 × 297 mm». El grado va pegado: «90°».
- Coma decimal y sin punto de miles en números de 4 cifras: «0,1 mm»,
  «1189 mm».

### Patrones

| Qué | Cómo | Ejemplo |
| --- | --- | --- |
| Botón o acción | Verbo en infinitivo + objeto, lo que hace exactamente | «Quitar de la hoja», «Reducir al 85 % y acomodar» |
| Tooltip | Igual que el botón; la nota, una instrucción breve | «Descargar PDF» / «Al imprimirlo, elige «Tamaño real» o «100 %»» |
| Resultado de una acción | «Se» + pretérito | «Se acomodaron 7 piezas», «Se quitó foto.jpg» |
| Estado después de editar | Participio + valores | «Girada 90°: 41,6 × 30 mm» |
| Problema vigente | Qué pasa y su consecuencia, en presente | «1 pieza se sale de la hoja y se corta al imprimir» |
| Error | Qué pasó y cómo resolverlo | «El margen no deja espacio para las piezas. Reduce el margen.» |
| Error por archivo | `nombre: qué pasó; cómo resolverlo`, en minúscula | «foto.heic: el navegador no puede abrir este formato; prueba con JPG, PNG o WebP» |
| En curso | Gerundio + «…» | «Cargando 2 de 5…» |
| Nombre accesible | Empieza con el texto visible (WCAG 2.5.3) | botón «100 %» → «100 %: tamaño real» |

### Enlaces dentro de una frase

Una frase con un enlace es un solo texto: la parte enlazada se marca con
`<link>…</link>` y `linkedText(clave, params, crearEnlace)` (en
`src/copy/index.js`) arma los nodos sin interpretar HTML. Así la frase se
traduce entera: «Los atajos de 1 tecla se activan en
`<link>Preferencias</link>`». Si abre un diálogo (no navega), el enlace es un
`<button>` con aspecto de enlace (`.link-btn`).

### Nombre de la app

Nunca se escribe el nombre: se usa `{app}`. Las frases no pueden depender de
su género («Gracias por usar {app}», no «Gracias por usarlo»; «Se mantiene
gracias a personas como tú», no «Lo mantengo…»).

## Glosario

| Término | Para | No usar |
| --- | --- | --- |
| pieza | cada imagen o página de PDF que está en la hoja | elemento, imagen, objeto |
| hoja | cada página que se arma e imprime («Hoja 2 de 3»; el PDF sale con una página por hoja) | página (salvo «página del PDF»), lienzo |
| hoja actual | la de la pieza seleccionada o, sin selección, la que más se ve | hoja activa |
| agregar hoja / quitar hoja | sumar una hoja vacía al final / sacar una hoja con sus piezas | nueva página, borrar hoja |
| acomodar | ubicar todas las piezas sin superponerlas, en las hojas que hagan falta | autoacomodar, organizar, acomodo (como título) |
| distribución | la sección del panel con la separación, el giro y la superposición | acomodo |
| girar | rotar 90° | rotar |
| seleccionar / selección | elegir piezas para actuar sobre ellas («3 piezas seleccionadas», «agregar a la selección o quitarla») | marcar, elegir (como término) |
| recuadro | el rectángulo que se arrastra en un lugar vacío para seleccionar | lazo, marquesina |
| seleccionar iguales | seleccionar las piezas del mismo archivo de origen | similares, duplicados |
| alinear | llevar las piezas a un mismo borde o centro, de la selección o del área útil | justificar, ajustar |
| distribuir / repartir parejo | separar las piezas con la separación de Distribución / con el mismo espacio entre la primera y la última | espaciar, equidistar |
| área útil | la hoja menos el margen | zona imprimible, área segura |
| quitar | sacar piezas de la hoja («Quitar todas») | eliminar, borrar, vaciar |
| agregar | sumar archivos a la hoja (mientras tanto, «Cargando…») | sumar, subir, importar |
| agrandar / reducir | cambiar el tamaño de una pieza | achicar, ampliar, escalar (como verbo) |
| escala | el porcentaje de tamaño | zoom |
| superponerse / superposición | piezas que se pisan | pisar, solapar |
| separación | espacio entre piezas al acomodar | espaciado, margen entre piezas |
| margen | borde de la hoja que se deja libre | sangría, borde |
| grilla | la cuadrícula de ayuda | cuadrícula, rejilla |
| imán | que las piezas se ajusten a la grilla al arrastrar | ajuste, snap |
| copias | piezas repetidas con «Rellenar con copias» | réplicas, clones |
| duplicar | hacer una copia de la pieza («Duplicar ×5»: 5 copias de cada seleccionada) | clonar |
| imprimir | mandar el PDF a la impresora | — |
| descargar PDF | guardar el PDF | exportar, bajar |
| deshacer / rehacer | historial | revertir |
| propiedades | el panel de la derecha | ajustes, inspector |
| recorte / líneas de corte | la parte de la imagen que se ve / las marcas para cortar las piezas impresas | crop, guías |
| atajos de teclado | combinaciones de teclas | accesos rápidos, teclas rápidas |
| barra de acciones | la barra flotante de la pieza | menú, toolbar |
| aviso | la píldora de mensajes | notificación, toast |
| aporte / aportar | la donación en Patreon | donar, donación, apoyar |
| proyecto | cada trabajo guardado en el navegador (nombre, hojas, piezas y archivos) | documento, archivo, diseño |
| nuevo proyecto | empezar otro en blanco; el abierto queda guardado | limpiar, vaciar (eso es «Quitar todas») |
| guardado / guardar | lo que hace solo el navegador con el proyecto («Guardado», «Guardando…») | sincronizar, subir, nube |
| eliminar | borrar un proyecto del navegador, para siempre (no se puede deshacer) | quitar (es para piezas y hojas), borrar |
| cambiar el nombre | renombrar un proyecto | renombrar, editar el título |
| preferencias | ajustes de este navegador (unidades, atajos de 1 tecla) | configuración, ajustes |
| unidades | mm, cm o in para mostrar y escribir medidas | sistema de medida |
| personalizado | papel con ancho y alto a elección | a medida, custom |
| pág. | solo en la lista de piezas, por espacio | — |

Teclas: Ctrl (⌘ en Mac), Shift, Alt, Tab, Enter, Espacio, Supr, Retroceso,
Esc. Las letras y los signos se muestran tal cual.

## Antes y después

| Antes | Después | Por qué |
| --- | --- | --- |
| Soltá imágenes o PDF, pegá con Ctrl+V o apretá O | Suelta imágenes o PDF, pega con Ctrl+V o presiona O | Tuteo neutro; «presionar» |
| o soltalos acá | o suéltalos aquí | Tuteo neutro; «aquí» |
| Seleccioná una pieza para editarla. | Selecciona una pieza para editarla | Tuteo; sin punto en una sola frase |
| Rotar si conviene | Girar si conviene | Glosario: girar |
| Rotada a 90°: 41,6 × 30 mm. | Girada 90°: 41,6 × 30 mm | Glosario; estado con participio; sin punto |
| Hay elementos superpuestos. | Hay piezas superpuestas | Glosario: pieza |
| 7 elementos acomodados. | Se acomodaron 7 piezas | Glosario; resultado con «Se» + pretérito |
| No entran todos con su tamaño actual. | Las piezas no entran con su tamaño actual | Sujeto explícito; sin punto |
| 1 elemento se sale de la hoja y se va a cortar. | 1 pieza se sale de la hoja y se corta al imprimir | Glosario; presente |
| El margen no deja lugar en la hoja: achicalo. | El margen no deja espacio para las piezas. Reduce el margen. | Qué pasó + cómo resolverlo; sin voseo |
| No hay forma de que entren todos, ni achicándolos. Quitá algunos o elegí una hoja más grande. | Las piezas no entran ni reduciéndolas. Quita algunas o elige una hoja más grande. | Glosario; tuteo |
| No entra: achicá el elemento. | No entra en la hoja: reduce la pieza | Glosario; tuteo; sin punto |
| No se pudo armar el PDF: (error técnico) | No se pudo crear el PDF. Inténtalo de nuevo. | Sin jerga técnica; cómo seguir |
| el PDF tiene contraseña; guardalo sin contraseña y volvé a cargarlo | el PDF tiene contraseña; guárdalo sin contraseña y vuelve a agregarlo | Tuteo; glosario: agregar |
| el navegador no puede abrir este formato | el navegador no puede abrir este formato; prueba con JPG, PNG o WebP | Cómo resolverlo |
| PDF descargado (pliego-a4.pdf). Al imprimir, elegí «Tamaño real» o «100 %». | Se descargó pliego-a4.pdf. Al imprimirlo, elige «Tamaño real» o «100 %». | Resultado con «Se»; tuteo |
| Se abrió el PDF: imprimilo desde ahí. Al imprimir, elegí… | Se abrió el PDF en otra pestaña. Imprímelo desde ahí con «Tamaño real» o «100 %» y el papel A4. | Dice dónde; tuteo; más corto |
| Vaciar la hoja | Quitar todas | Glosario: quitar |
| Ahí no había lugar libre: la pieza volvió a su lugar. | No había espacio libre ahí, así que la pieza volvió a su lugar | Una sola frase; sin repetir «lugar» |
| Apagalos si usás control por voz o se te disparan sin querer. | Desactívalos si usas control por voz o si se activan sin querer. | Tuteo; registro neutro |
| Atajos de una tecla | Atajos de 1 tecla | Números con cifras (como «Verificación en 2 pasos») |
| Apoyar en Patreon / Seguir sin donar | Aportar en Patreon / Seguir sin aportar | Un solo término para la donación |
| {app} es gratis… Lo mantengo con el aporte de quienes lo usan. | {app} es gratis, sin anuncios ni marcas de agua, y no pide cuenta. Se mantiene gracias a personas como tú. | Sin depender del género del nombre |
| Gracias por usarlo, con o sin aporte. | Gracias por usar {app}, con o sin aporte | Sin depender del género; sin punto |

## Decisiones tomadas

- **Retroceso** para la tecla Backspace y **Supr** para Delete, como en la
  documentación en español de Google y Microsoft. Shift y Enter quedan así,
  porque así aparecen en la mayoría de los teclados latinoamericanos.
- **Distribución** como título de la sección de separación, giro y
  superposición. Antes era «Acomodo», que se podía leer como el botón
  «Acomodar» (una acción) y no como un grupo de ajustes. «Distribuir», como
  verbo, queda para repartir piezas con espacios iguales.
- **Atajos de 1 tecla**, con cifra, como pide la regla de números.
- **Eliminar** solo para proyectos: es irreversible y por eso usa otra
  palabra que «quitar» (piezas y hojas, que se pueden deshacer).
- **Preferencias** para los ajustes de este navegador (no del documento): se
  abre con el engranaje y no entra en el historial.
- **Medidas en la unidad elegida**: los textos con medidas reciben el número
  ya formateado («{w} × {h} {unit}»), nunca «mm» fijo.
- **Coma decimal**, como en la mayor parte de Sudamérica (es-419 de Google usa
  punto). Si se cambia, es solo `meta.numberLocale` en `es.js`.
