// Textos en español latinoamericano neutro. Reglas y glosario: docs/copy.md.
// Uso: src/copy/index.js. « » es un espacio que no se parte entre línea y
// línea (entre número y unidad, y dentro de las medidas).

export default {
  meta: {
    lang: 'es',
    // Coma decimal y sin punto de miles en números de 4 cifras («1189 mm»).
    numberLocale: 'es',
  },

  app: {
    name: '{app}',
    title: '{app} — Acomoda imágenes y PDF en una hoja a tamaño real',
    description:
      'Acomoda imágenes y páginas de PDF en una hoja a tamaño real y descarga un PDF listo para imprimir. Tus archivos no salen del navegador.',
    heading: '{app}: acomoda imágenes y PDF en una hoja a tamaño real',
    skip: 'Ir a la hoja',
    printOnly: 'Para imprimir a tamaño real, usa el botón «Imprimir» de {app}',
    close: 'Cerrar',
  },

  // Medidas: {value}, {w} y {h} ya vienen formateados en la unidad elegida
  units: {
    mm: 'mm',
    cm: 'cm',
    in: 'in',
    names: { mm: 'milímetros', cm: 'centímetros', in: 'pulgadas' },
    percent: '%',
    length: '{value} {unit}',
    size: '{w} × {h} {unit}',
    scale: '{n} %',
    // Al salir de un campo de medida con algo que no se entiende
    invalid: '«{text}» no es una medida válida. Se mantiene {value}.',
    // Lo mismo, cuando se entiende pero no vale ({text} ya termina en punto)
    invalidValue: '{text} Se mantiene {value}.',
    // Mientras se escribe algo que no puede ser una medida
    unreadable: 'Escribe una medida con números, por ejemplo 2,5 o 1/2 in',
  },

  // Nombres visibles de las teclas (las letras y signos se muestran tal cual)
  keys: {
    Mod: 'Ctrl',
    ModMac: '⌘',
    Control: 'Ctrl',
    Shift: 'Shift',
    Alt: 'Alt',
    Tab: 'Tab',
    Enter: 'Enter',
    Space: 'Espacio',
    Delete: 'Supr',
    Backspace: 'Retroceso',
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowRight: '→',
    ArrowDown: '↓',
    Plus: '+',
    Minus: '−',
  },

  // Barra superior
  bar: {
    add: 'Agregar',
    addTip: 'Agregar imágenes o PDF',
    arrange: 'Acomodar',
    arrangeTip: 'Acomodar las piezas sin superponerlas',
    undo: 'Deshacer',
    redo: 'Rehacer',
    shortcuts: 'Atajos de teclado',
    download: 'Descargar PDF',
    downloadNote: 'Al imprimirlo, elige «Tamaño real» o «100 %»',
    print: 'Imprimir',
    printNote: 'En el diálogo de impresión, elige «Tamaño real» o «100 %»',
  },

  // Panel «Piezas» y nombres de las piezas
  pieces: {
    title: 'Piezas',
    close: 'Cerrar el panel de piezas',
    addTitle: 'Agregar imágenes o PDF',
    addSub: 'o suéltalos aquí',
    empty: 'Todavía no hay piezas',
    emptyTip:
      'Agrega imágenes (JPG, PNG, WebP…) o PDF. Cada página es una pieza que puedes mover, girar y cambiar de tamaño.',
    listHint: 'Usa las flechas arriba y abajo para elegir una pieza, Enter para ir a ella en la hoja y Supr para quitarla',
    count: { one: '{n} pieza', other: '{n} piezas' },
    clear: 'Quitar todas',
    other: 'otra pieza',
    pastedName: 'Imagen pegada',
    rowSize: '{size}',
    rowSizePage: '{size} · pág. {page}',
    badges: {
      cut: 'Se sale de la hoja',
      pastMargin: 'Pasa el margen',
      overlap: 'Se superpone con otra pieza',
      lowRes: 'Puede verse pixelada',
    },
  },

  // La hoja en pantalla
  sheet: {
    label: 'Hoja',
    labelEmpty: 'Hoja {paper}, vacía',
    labelCount: { one: 'Hoja {paper}, {n} pieza', other: 'Hoja {paper}, {n} piezas' },
    paperLabel: '{paper} · {size}',
    landscapeName: '{paper} horizontal',
    drop: 'Suelta imágenes o PDF, pega con {mod}+V o presiona O',
    dropNoKeys: 'Suelta imágenes o PDF, pega con {mod}+V o haz clic aquí',
    private: 'Tus archivos no salen del navegador',
  },

  // Papeles: nombres visibles de los ids de src/papers.js
  papers: {
    groups: { 'iso-a': 'Serie A', 'iso-b': 'Serie B', us: 'América', photo: 'Fotográfico' },
    names: {
      A0: 'A0',
      A1: 'A1',
      A2: 'A2',
      A3: 'A3',
      A4: 'A4',
      A5: 'A5',
      A6: 'A6',
      B4: 'B4',
      B5: 'B5',
      letter: 'Carta',
      legal: 'Oficio',
      folio: 'Folio',
      tabloid: 'Tabloide',
      'photo-9x13': 'Foto 9 × 13',
      'photo-10x15': 'Foto 10 × 15',
      'photo-13x18': 'Foto 13 × 18',
      'photo-15x20': 'Foto 15 × 20',
      'photo-20x30': 'Foto 20 × 30',
    },
    custom: 'Personalizado',
    option: '{paper} ({size})',
    width: 'Ancho de la hoja',
    widthLabel: 'Ancho de la hoja, en {unit}',
    height: 'Alto de la hoja',
    heightLabel: 'Alto de la hoja, en {unit}',
    match: 'Coincide con {paper}',
    errors: {
      widthInvalid: 'Escribe el ancho con números, por ejemplo 216',
      heightInvalid: 'Escribe el alto con números, por ejemplo 330',
      widthTooSmall: 'El ancho mínimo es {min}',
      heightTooSmall: 'El alto mínimo es {min}',
      widthTooLarge: 'El ancho máximo es {max}',
      heightTooLarge: 'El alto máximo es {max}',
    },
  },

  // Nombre accesible de cada pieza en la hoja
  piece: {
    roleDescription: 'pieza',
    a11y: '{name}{page}, {size}, a {x} del borde izquierdo y {y} del superior{turned}',
    a11yPage: ' (página {page})',
    a11yTurned: ', girada {deg}°',
  },

  // Barra flotante de la pieza seleccionada
  piecebar: {
    label: 'Acciones de la pieza',
    labelFor: 'Acciones de {name}',
    rotateLeft: 'Girar 90° a la izquierda',
    rotateLeftTip: 'Girar a la izquierda',
    rotateRight: 'Girar 90° a la derecha',
    rotateRightTip: 'Girar a la derecha',
    duplicate: 'Duplicar',
    remove: 'Quitar',
    removeTip: 'Quitar de la hoja',
    hint:
      'Flechas: mover (Shift: {coarse}; Alt: {fine}). Más y menos: agrandar o reducir. R y Shift+R: girar. ' +
      'D: duplicar. M: editar las medidas. Enter: barra de acciones. Supr: quitar.',
    hintNoKeys: 'Flechas: mover (Shift: {coarse}; Alt: {fine}). Enter: barra de acciones. Supr: quitar.',
  },

  // Botones de los paneles en pantallas angostas
  dock: {
    pieces: 'Piezas',
    props: 'Propiedades',
  },

  // Panel «Propiedades»
  props: {
    title: 'Propiedades',
    close: 'Cerrar el panel de propiedades',
    piece: 'Pieza',
    empty: 'Selecciona una pieza para editarla',
    pieceNamePage: '{name} · página {page}',
    positive: 'La medida tiene que ser mayor que 0',
    x: 'X',
    xLabel: 'X: distancia desde el borde izquierdo, en {unit}',
    xTip: 'X: distancia desde el borde izquierdo',
    y: 'Y',
    yLabel: 'Y: distancia desde el borde superior, en {unit}',
    yTip: 'Y: distancia desde el borde superior',
    widthLabel: 'Ancho, en {unit}',
    widthTip: 'Ancho',
    heightLabel: 'Alto, en {unit}',
    heightTip: 'Alto',
    scaleLabel: 'Escala, en porcentaje',
    scaleTip: 'Escala',
    slider: 'Escala',
    rotated: 'Girada {deg}°',
    rotatedNote: ': el ancho y el alto son los que ocupa en la hoja',
    quick: 'Ajustes rápidos de la pieza',
    actual: '100 %',
    actualLabel: '100 %: tamaño real',
    actualTip: 'Usar el tamaño real',
    fit: 'Ajustar a la hoja',
    center: 'Centrar en la hoja',
    front: 'Traer al frente',
    frontDisabled: 'Traer al frente: disponible cuando se superpone con otra pieza',
    page: 'Página del PDF',
    pageOption: '{n} de {total}',
    fill: 'Rellenar con copias',
    fillWarning: 'Reemplaza todas las piezas de la hoja por copias de esta. Puedes deshacerlo.',
    fillSummary: { one: '{n} copia en {paper}', other: '{n} copias en {paper}' },
    fillNoFit: 'No entra en la hoja: reduce la pieza',
    fillTooMany: 'Entrarían {n} copias y el máximo es {max}: agranda la pieza',
    remove: 'Quitar de la hoja',
    resolution: {
      vector: 'Vectorial: nítida a cualquier tamaño',
      printsAt: 'Se imprime a {ppp} ppp',
      withNote: '{text} · {note}',
      ok: 'Calidad aceptable',
      low: 'Puede verse pixelada',
    },
    sheet: 'Hoja',
    size: 'Tamaño',
    orientation: 'Orientación',
    portrait: 'Vertical',
    landscape: 'Horizontal',
    margin: 'Margen',
    marginUnit: ', en {unit}',
    arrange: 'Acomodo',
    gap: 'Separación',
    gapUnit: ' entre piezas, en {unit}',
    rotate: 'Girar si conviene',
    rotateHint: 'Al acomodar y al rellenar',
    overlap: 'Permitir superposición',
    overlapHint: 'Desactivado, no se superponen al moverlas ni al agrandarlas',
    grid: 'Grilla',
    gridShow: 'Mostrar grilla',
    gridShowHint: 'Solo en pantalla: no sale en el PDF',
    gridSize: 'Tamaño de la grilla',
    gridChip: '{n} {unit}',
    gridCustom: 'Otro tamaño de grilla, en {unit}',
    snap: 'Imán',
    snapHint: 'Al arrastrar, las piezas se ajustan a la grilla',
  },

  // Píldora de avisos
  notices: {
    close: 'Cerrar aviso',
    // Para lectores de pantalla, cuando el aviso tiene un botón ({text} ya termina en punto)
    withAction: '{text} Botón «{action}» disponible en el aviso',
    cut: {
      one: '1 pieza se sale de la hoja y se corta al imprimir',
      other: '{n} piezas se salen de la hoja y se cortan al imprimir',
    },
    pastMargin: {
      one: '1 pieza pasa el margen y puede que la impresora no imprima ese borde',
      other: '{n} piezas pasan el margen y puede que la impresora no imprima esos bordes',
    },
    overlap: 'Hay piezas superpuestas',
    arranged: { one: 'Se acomodó 1 pieza', other: 'Se acomodaron {n} piezas' },
    shrunk: {
      one: 'Se acomodó 1 pieza, reducida al {pct} %',
      other: 'Se acomodaron {n} piezas, reducidas al {pct} %',
    },
    noFit: {
      one: 'La pieza no entra con su tamaño actual',
      other: 'Las piezas no entran con su tamaño actual',
    },
    shrinkAction: 'Reducir al {pct} % y acomodar',
    filled: { one: 'Se rellenó la hoja con 1 copia', other: 'Se rellenó la hoja con {n} copias' },
    reverted: 'No había espacio libre ahí, así que la pieza volvió a su lugar',
    downloaded: 'Se descargó {file}. Al imprimirlo, elige «Tamaño real» o «100 %».',
    printDialog: 'En el diálogo de impresión, elige «Tamaño real» o «100 %» y el papel {paper}',
    printTab:
      'Se abrió el PDF en otra pestaña. Imprímelo desde ahí con «Tamaño real» o «100 %» y el papel {paper}.',
    printDownload: 'Se descargó {file}. Ábrelo e imprímelo con «Tamaño real» o «100 %» y el papel {paper}.',
  },

  // Mientras se carga o se crea algo (en la píldora)
  busy: {
    loading: 'Cargando…',
    loadingFile: 'Cargando {name}…',
    loadingCount: 'Cargando {i} de {n}…',
    loadingPage: 'Cargando la página {page}…',
    pdf: 'Creando el PDF…',
    print: 'Preparando la impresión…',
  },

  // Errores: qué pasó y cómo resolverlo
  errors: {
    load: {
      one: 'No se pudo agregar 1 archivo: {list}',
      other: 'No se pudieron agregar {n} archivos: {list}',
    },
    loadSeparator: ' · ',
    loadItem: '{name}: {reason}',
    unnamedFile: 'Archivo sin nombre',
    maxReached: 'la hoja admite hasta {max} piezas ({n} sin agregar)',
    maxPieces: 'La hoja admite hasta {max} piezas. Quita alguna para duplicar esta.',
    page: 'No se pudo cargar la página {page}. Inténtalo de nuevo.',
    pdf: 'No se pudo crear el PDF. Inténtalo de nuevo.',
    marginTooBig: 'El margen no deja espacio para las piezas. Reduce el margen.',
    neverFits: 'Las piezas no entran ni reduciéndolas. Quita algunas o elige una hoja más grande.',
    shrinkFailed: 'No se pudieron acomodar las piezas ni reduciéndolas. Quita algunas e inténtalo de nuevo.',
    // Por archivo (van después de «nombre: »)
    file: {
      tooHeavy: 'pesa más de 40 MB; prueba con un archivo más pequeño',
      noSize: 'la imagen no tiene ancho ni alto definidos; guárdala como PNG o JPG',
      tooManyPixels: 'tiene {mp} MP y el máximo es 60 MP; reduce su resolución',
      unsupported: 'el navegador no puede abrir este formato; prueba con JPG, PNG o WebP',
      processFailed: 'no se pudo procesar la imagen; inténtalo de nuevo',
      password: 'el PDF tiene contraseña; guárdalo sin contraseña y vuelve a agregarlo',
      damaged: 'no se pudo leer el PDF; si está dañado, vuelve a exportarlo',
    },
  },

  // Solo para lectores de pantalla (región viva)
  announce: {
    rotated: 'Girada {deg}°: {size}',
    duplicated: { one: 'Se duplicó la pieza. Hay {n} pieza.', other: 'Se duplicó la pieza. Hay {n} piezas.' },
    fitted: 'Ajustada a la hoja: {size}',
    centered: 'Centrada en la hoja',
    actualSize: 'Tamaño real: {size}',
    frontNotNeeded: 'La pieza no se superpone con otras, así que no hace falta traerla al frente',
    front: 'Se trajo la pieza al frente',
    removed: 'Se quitó {name}',
    removedLast: 'Se quitó {name}. La hoja está vacía.',
    jumped: 'Saltó sobre {names}',
    position: 'A {x} del borde izquierdo y {y} del superior',
    noRoom: 'No hay más espacio para agrandarla',
    scaled: 'Escala {scale} %: {size}',
    undone: 'Se deshizo el último cambio',
    redone: 'Se rehízo el último cambio',
    sheet: 'Hoja {paper}',
    gridShown: 'Grilla visible, cada {size}',
    gridHidden: 'Grilla oculta',
    cleared: 'Se quitaron todas las piezas',
    added: { one: 'Se agregó 1 archivo', other: 'Se agregaron {n} archivos' },
    needSelection: 'Primero selecciona una pieza',
    deselected: 'Ninguna pieza seleccionada',
  },

  print: {
    frameTitle: 'PDF para imprimir',
    pdfTitle: '{app} {paper}',
    fallbackName: 'hoja',
  },

  // Modal de donación (al primer Imprimir o Descargar PDF)
  donate: {
    close: 'Cerrar y seguir sin aportar',
    title: '¿Te ahorró tiempo y papel?',
    body1: '{app} es gratis, sin anuncios ni marcas de agua, y no pide cuenta. Se mantiene gracias a personas como tú.',
    body2: 'Si te sirvió, con un aporte en Patreon ayudas a que siga siendo gratis y a que mejore.',
    benefits: {
      noAds: 'Sin anuncios',
      noWatermark: 'Sin marcas de agua',
      private: 'Tus archivos no salen del navegador',
    },
    cta: 'Aportar en Patreon',
    ctaNote: 'Se abre en otra pestaña y tu PDF sigue en curso',
    skip: 'Seguir sin aportar',
    never: 'No volver a mostrar en este dispositivo',
    thanks: 'Gracias por usar {app}, con o sin aporte',
  },

  // Diálogo «Preferencias» (ajustes de este navegador)
  prefs: {
    title: 'Preferencias',
    units: 'Unidades',
    unitsHint: 'Para mostrar y escribir medidas. No cambia el documento ni el PDF.',
    // Después del símbolo visible («mm»), para lectores de pantalla
    unitNames: { mm: ', milímetros', cm: ', centímetros', in: ', pulgadas' },
    unitChanged: 'Medidas en {unit}',
    singleKeys: 'Atajos de 1 tecla',
    singleKeysHint:
      'Desactívalos si usas control por voz o si se activan sin querer. Los atajos con {mod}, las flechas y Supr sobre una pieza siguen funcionando.',
  },

  // Diálogo «Atajos de teclado»
  shortcuts: {
    title: 'Atajos de teclado',
    singleKeysNote: 'Los atajos de 1 tecla se activan y desactivan en «Preferencias».',
    openPrefs: 'Abrir «Preferencias»',
    caption: 'Atajos de teclado',
    key: 'Tecla',
    action: 'Acción',
    or: ' o ',
    off: 'Desactivado',
    printLead: 'Para imprimir:',
    printTip: 'en el diálogo de impresión, elige «Tamaño real» o «100 %» para que las medidas sean exactas',
    private: 'Tus archivos no salen del navegador',
    rows: {
      tab: 'Recorrer la barra, los paneles y las piezas; en la hoja, enfocar una pieza la selecciona',
      move: 'Mover la pieza {normal} (Shift: {coarse}; Alt: {fine}). Si choca con otra, salta al otro lado.',
      scale: 'Agrandar o reducir 1 % (Shift: 10 %)',
      rotate: 'Girar 90° a la derecha o a la izquierda',
      duplicate: 'Duplicar la pieza',
      fit: 'Ajustar a la hoja',
      center: 'Centrar en la hoja',
      front: 'Traer al frente',
      toolbar: 'Sobre una pieza, ir a su barra de acciones',
      remove: 'Quitar la pieza',
      measures: 'Editar las medidas de la pieza en «Propiedades»',
      sheet: 'Ir a los ajustes de la hoja',
      list: 'Ir a la lista de piezas',
      arrange: 'Acomodar las piezas sin superponerlas',
      add: 'Agregar imágenes o PDF',
      orientation: 'Cambiar la orientación de la hoja',
      grid: 'Mostrar u ocultar la grilla',
      undo: 'Deshacer',
      redo: 'Rehacer',
      print: 'Imprimir',
      download: 'Descargar PDF',
      escape: 'En un panel, volver a la pieza o cerrar el panel; en la hoja, anular la selección',
      help: 'Mostrar estos atajos',
    },
  },
};
