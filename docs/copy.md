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

- `src/copy/es.ts`: todas las cadenas, agrupadas por área (`bar`, `pieces`,
  `sheet`, `piecebar`, `props`, `notices`, `busy`, `errors`, `announce`,
  `donate`, `shortcuts`, `keys`…).
- `src/copy/index.ts`: `t('area.clave', { n, … })` interpola `{param}`,
  formatea los números (coma decimal) y elige el plural con `Intl.PluralRules`
  según `n` (`{ one: '{n} pieza', other: '{n} piezas' }`). `{app}` es siempre
  el nombre de la app (`APP_NAME`, en `src/config.ts`) y `{mod}` la tecla Ctrl
  (⌘ en Mac). `keyLabel('Mod+Shift+Z')` da el nombre visible de un atajo. Las
  claves tienen tipo (`CopyKey`): una clave que no existe no compila.
- Los componentes de React (`src/components/`) toman todos sus textos de
  `t()`, también los `aria-label` y los tooltips (`data-tip`).
- `index.html` solo trae los pocos textos que tienen que estar antes de que
  arranque la app (título, descripción, encabezado, nombre en la pantalla de
  carga y el aviso sin JavaScript), como marcadores `{{clave}}`: Vite los
  completa al servir y al compilar (`fillStaticCopy`, desde `vite.config.ts`),
  así la página llega con los textos puestos.
- Ningún otro archivo escribe textos de interfaz. Los mensajes de consola y los
  errores internos que nunca ve nadie quedan en el código.

Para sumar otro idioma: un `en.ts` con las mismas claves, elegido en
`src/copy/index.ts` (lo que falte se toma del español). Cada texto es una
frase entera, con sus parámetros: nada se arma pegando pedazos en el código.

- Los mensajes que se muestran o se anuncian juntos se unen con `sentences()`
  y `joinSentences()` (en `src/copy/index.ts`), que ponen el punto y el
  espacio del idioma (`meta.period` y `meta.sentenceGap`).
- Las listas («1, 2 y 3») salen de `formatList()` y las alternativas
  («R o Shift+R») de `choiceParts()`, con `Intl.ListFormat` del idioma.
- Cuando una frase envuelve a otra, la plantilla lo dice con su parámetro
  («{label}, rotada {deg}°», «Hojas {list}: {text}»), y un comentario en
  `es.ts` explica qué llega en cada uno.

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
- Con dos frases o más, punto en todas: «Se quitaron 3 piezas. La hoja está
  vacía.»
- Los mensajes que se juntan en la región viva van sin punto; el anunciador
  (`src/components/feedback/announcer.ts`, con `joinSentences`) agrega el
  punto al unirlos para que el lector haga la pausa.
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

- Siempre con cifras: «1 pieza», «Atajos de 1 tecla», «Rotar 90°».
- Unidad separada por un espacio que no se parte (` `): «10 mm»,
  «300 ppp», «100 %», «40 MB». Las medidas tampoco se parten:
  «210 × 297 mm». El grado va pegado: «90°».
- Coma decimal y sin punto de miles en números de 4 cifras: «0,1 mm»,
  «1189 mm».

### Patrones

| Qué | Cómo | Ejemplo |
| --- | --- | --- |
| Botón o acción | Verbo en infinitivo + objeto, lo que hace exactamente | «Quitar de la hoja», «Reducir al 85 % y acomodar» |
| Tooltip | Igual que el botón, con su atajo; la nota, solo por qué está deshabilitado | «Distribuir en horizontal» / «Selecciona 2 piezas o más de una misma hoja para distribuir» |
| Resultado de una acción | «Se» + pretérito | «Se acomodaron 7 piezas», «Se quitó foto.jpg» |
| Estado después de editar | Participio + valores | «Rotada 90°: 41,6 × 30 mm» |
| Problema vigente | Qué pasa y su consecuencia, en presente | «1 pieza se sale de la hoja y se corta al imprimir» |
| Error | Qué pasó y cómo resolverlo | «El margen no deja espacio para las piezas. Reduce el margen.» |
| Error por archivo | `nombre: qué pasó; cómo resolverlo`, en minúscula | «foto.heic: el navegador no puede abrir este formato; prueba con JPG, PNG o WebP» |
| En curso | Gerundio + «…» | «Cargando 2 de 5…» |
| Nombre accesible | Empieza con el texto visible (WCAG 2.5.3) | botón «100 %» → «100 %: tamaño real» |

### Avisos: visibles o solo anunciados

- Lo que se ve en el lienzo (en la hoja que está a la vista) solo se anuncia
  a los lectores de pantalla: acomodar sin sumar hojas, ajustar, centrar,
  rotar, duplicar o pegar en una hoja, un tamaño de foto.
- El aviso (la píldora) es para lo que no se ve ahí: un problema, un error,
  piezas que quedaron repartidas en otras hojas («Se agregaron 7 archivos en
  las hojas 1 y 2»), o un cambio difícil de rehacer a mano.
- Lo que reemplaza o quita varias cosas a la vez (quitar varias piezas, una
  hoja con piezas, rellenar con copias, «Quitar todas») ofrece «Deshacer» en
  el aviso. Con «Deshacer» a mano no hace falta preguntar antes.
- Cuando el resultado cae en otra hoja, la vista va hasta ahí y se anuncia la
  hoja («Se agregó 1 archivo a la hoja 2»).
- La marca de éxito es solo para lo que salió bien; lo que hay que saber (una
  hoja que quedó vacía, una pieza que pasó a otra hoja) va como información.

### Textos de ayuda

Un control que necesita una frase para explicar qué hace es un control mal
nombrado: se cambia el nombre («Rotación automática», «Tamaño de foto»,
«Separación (5 mm)», «Distancia a la esquina») en lugar de agregar la frase.
Los tooltips repiten el nombre (y el atajo) y no explican. Una nota queda
solo para una consecuencia que no se ve y que importa.

### Íconos junto a texto

- Los interruptores no llevan ícono, y ninguna etiqueta lleva su tecla: el
  atajo va en el tooltip y en `aria-keyshortcuts`.
- Un ícono, un significado: «Duplicar» es siempre la copia con un «+»; las
  tijeras son «Cortar» (el distintivo de «Se sale de la hoja» es otro).
- Campos compactos: una letra antes del valor (X, Y, An, Al) y la unidad
  después; la escala, solo con su «%».

### Enlaces dentro de una frase

Una frase con un enlace es un solo texto: la parte enlazada se marca con
`<link>…</link>` y `splitLink(clave, params)` (en `src/copy/index.ts`) la
separa en antes, enlace y después, que el componente arma sin interpretar
HTML. Así la frase se traduce entera: «Los atajos de 1 tecla se activan en
`<link>Preferencias</link>`». Si abre un diálogo (no navega), el enlace es un
`<button>` con aspecto de enlace (`.link-btn`).

### Nombre de la app

Nunca se escribe el nombre: se usa `{app}`. Las frases no pueden depender de
su género («Para usar {app}, activa JavaScript», no «Para usarlo…»; «Se
mantiene gracias a personas como tú», no «Lo mantengo…»).

## Glosario

| Término | Para | No usar |
| --- | --- | --- |
| pieza | cada imagen o página de PDF que está en la hoja | elemento, imagen, objeto |
| hoja | cada página que se arma e imprime («Hoja 2 de 3»; el PDF sale con una página por hoja) | página (salvo «página del PDF»), lienzo |
| hoja actual | la de la pieza seleccionada o, sin selección, la que más se ve | hoja activa |
| agregar hoja / quitar hoja | sumar una hoja vacía al final / sacar una hoja con sus piezas | nueva página, borrar hoja |
| acomodar | ubicar todas las piezas sin superponerlas, en las hojas que hagan falta | autoacomodar, organizar, acomodo (como título) |
| distribución | la sección del panel con la separación, la rotación automática y la superposición | acomodo |
| rotar / rotación | dar vuelta una pieza 90° («Rotar a la derecha», «Rotada 90°») | girar, giro |
| rotación automática | que acomodar y rellenar con copias puedan rotar piezas para que entren mejor | girar si conviene |
| seleccionar / selección | elegir piezas para actuar sobre ellas («3 piezas seleccionadas», «agregar a la selección o quitarla») | marcar, elegir (como término) |
| recuadro | el rectángulo que se arrastra en un lugar vacío para seleccionar | lazo, marquesina |
| seleccionar iguales | seleccionar las piezas del mismo archivo de origen | similares, duplicados |
| alinear | llevar las piezas a un mismo borde o centro, de la selección o del área útil | justificar, ajustar |
| ajustar a la hoja | agrandar o reducir una pieza para que ocupe el área útil (no es alinear) | maximizar, encajar |
| distribuir / repartir parejo | separar las piezas con la separación de Distribución / con el mismo espacio entre la primera y la última | espaciar, equidistar |
| área útil | la hoja menos el margen | zona imprimible, área segura |
| quitar | sacar piezas de la hoja («Quitar todas») | eliminar, borrar, vaciar |
| agregar | sumar archivos a la hoja (mientras tanto, «Cargando…») | sumar, subir, importar |
| agrandar / reducir | cambiar el tamaño de una pieza | achicar, ampliar, escalar (como verbo) |
| escala | el porcentaje de tamaño de una pieza | zoom |
| zoom | cuánto se acercan las hojas en pantalla («Ver la hoja entera»); no cambia el PDF | escala, acercamiento |
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
| pestaña | cada parte de Propiedades: Pieza y Hojas (la del navegador, «pestaña» a secas cuando no hay duda: «En otra pestaña») | solapa |
| recorte / líneas de corte | la parte de la imagen que se ve / las marcas para cortar las piezas impresas | crop, guías |
| margen de corte | lo que se deja alrededor de cada imagen para cortarla (negativo: el corte entra en la imagen) | sangrado, bleed |
| marcas | las líneas en L de las esquinas, con «Esquinas» («Largo de las marcas», «Distancia a la esquina») | guías, crop marks |
| atajos de teclado | combinaciones de teclas | accesos rápidos, teclas rápidas |
| barra de acciones | la barra flotante de la pieza | menú, toolbar |
| aviso | la píldora de mensajes (ver «Avisos: visibles o solo anunciados») | notificación, toast |
| aporte / aportar | la donación en Patreon | donar, donación, apoyar |
| proyecto | cada trabajo guardado en el navegador (nombre, hojas, piezas y archivos) | documento, archivo, diseño |
| nuevo proyecto | empezar otro en blanco; el abierto queda guardado | limpiar, vaciar (eso es «Quitar todas») |
| guardar | lo que hace solo el navegador con el proyecto («Los cambios se guardan automáticamente»; solo se ve cuando no se puede: «No se guardó», «Sin guardar», «En otra pestaña») | sincronizar, subir, nube |
| eliminar | borrar un proyecto del navegador, para siempre (no se puede deshacer) | quitar (es para piezas y hojas), borrar |
| cambiar el nombre | renombrar un proyecto | renombrar, editar el título |
| preferencias | ajustes de este navegador (unidades, atajos de 1 tecla) | configuración, ajustes |
| unidades | mm, cm o in para mostrar y escribir medidas | sistema de medida |
| tema | los colores de la interfaz: automático (como el sistema), claro u oscuro; la hoja siempre es blanca | apariencia, modo |
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
| Girar si conviene | Rotación automática | Glosario: rotar; la opción se nombra, no se explica |
| Girada a 90°: 41,6 × 30 mm. | Rotada 90°: 41,6 × 30 mm | Glosario; estado con participio; sin punto |
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
| PDF descargado (scooch-a4.pdf). Al imprimir, elegí «Tamaño real» o «100 %». | Se descargó scooch-a4.pdf | Resultado con «Se»; cómo imprimirlo lo dice «Antes de descargar» |
| Se abrió el PDF: imprimilo desde ahí. Al imprimir, elegí… | Se abrió el PDF en otra pestaña. Imprímelo desde ahí. | Dice dónde; tuteo; más corto |
| Vaciar la hoja | Quitar todas | Glosario: quitar |
| Ahí no había lugar libre: la pieza volvió a su lugar. | No hay espacio ahí. La pieza volvió a su lugar. | Sin relleno («así que»); qué pasa y qué hizo |
| Apagalos si usás control por voz o se te disparan sin querer. | Desactívalos si usas control por voz o si se activan sin querer. | Tuteo; registro neutro |
| Atajos de una tecla | Atajos de 1 tecla | Números con cifras (como «Verificación en 2 pasos») |
| Apoyar en Patreon | Aportar en Patreon | Un solo término para la donación |
| Se admiten hasta 200 piezas en total, así que ya no entran más copias | Ya hay 200 piezas, el máximo. Quita alguna para duplicar. | Sin relleno; qué pasó y cómo seguir |
| No se pudo completar la acción en Proyectos | No se pudo duplicar «Tarjetas». Inténtalo de nuevo. | Un error por acción, que dice cuál falló |
| Se aplica a todas las hojas (sobre la pestaña Hoja) | Pestaña Hojas | El nombre dice lo que explicaba la nota |
| Configurar · Usar 5 mm · Guardar como nuevo | Usar separación de 5 mm · Guardar como proyecto nuevo | El botón dice exactamente qué hace |

## Decisiones tomadas

- **Retroceso** para la tecla Backspace y **Supr** para Delete, como en la
  documentación en español de Google y Microsoft. Shift y Enter quedan así,
  porque así aparecen en la mayoría de los teclados latinoamericanos.
- **Distribución** como título de la sección de separación, rotación
  automática y superposición. Antes era «Acomodo», que se podía leer como el botón
  «Acomodar» (una acción) y no como un grupo de ajustes. «Distribuir», como
  verbo, queda para repartir piezas con espacios iguales.
- **Atajos de 1 tecla**, con cifra, como pide la regla de números.
- **Rotar** en lugar de girar (2026-11), como en la mayoría de las apps de
  diseño en español. El interruptor de Distribución se llama **Rotación
  automática**: el nombre alcanza y no lleva texto de ayuda.
- **Eliminar** solo para proyectos: es irreversible y por eso usa otra
  palabra que «quitar» (piezas y hojas, que se pueden deshacer).
- **Preferencias** para los ajustes de este navegador (no del documento): se
  abre con el engranaje y no entra en el historial.
- **Hojas** como nombre de la pestaña de Propiedades con el papel, la
  distribución, las líneas de corte y la grilla: se aplica a todas las hojas.
- **Quitar una hoja con piezas** no pregunta: el aviso ofrece «Deshacer».
  «Quitar todas» sí pregunta (decisión del dueño) y además ofrece «Deshacer».
- **En otra pestaña** para el proyecto que se abrió en otra pestaña del
  navegador, distinto de **Sin guardar** (el navegador no permite guardar).
- **Ver la hoja entera / Ver el ancho de la hoja** para el zoom: «ajustar»
  es de «Ajustar a la hoja», que cambia el tamaño de una pieza.
- **Medidas en la unidad elegida**: los textos con medidas reciben el número
  ya formateado («{w} × {h} {unit}»), nunca «mm» fijo.
- **Coma decimal**, como en la mayor parte de Sudamérica (es-419 de Google usa
  punto). Si se cambia, es solo `meta.numberLocale` en `es.ts`.
