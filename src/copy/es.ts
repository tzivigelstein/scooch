// UI texts in neutral Latin American Spanish. Rules and glossary: docs/copy.md.
// Used through src/copy/index.ts. « » is a no-break space (between a number
// and its unit, and inside measurements).

const es = {
  meta: {
    lang: 'es',
    // Decimal comma and no thousands separator in 4-digit numbers («1189 mm»).
    numberLocale: 'es',
    // How messages become sentences when they are joined (see sentences in index.ts).
    period: '.',
    sentenceGap: ' ',
  },

  app: {
    name: '{app}',
    title: '{app} — Acomoda imágenes y PDF en una hoja a tamaño real',
    description:
      'Acomoda imágenes y páginas de PDF en una hoja a tamaño real y descarga un PDF listo para imprimir. Tus archivos no salen del navegador.',
    heading: '{app}: acomoda imágenes y PDF en una hoja a tamaño real',
    skip: 'Ir a la hoja',
    printOnly: 'Para imprimir a tamaño real, usa el botón Imprimir de {app}',
    // Without JavaScript the page shows only this
    noscript: 'Para usar {app}, activa JavaScript en el navegador',
    close: 'Cerrar',
  },

  // Lengths: {value}, {w} and {h} come already formatted in the chosen unit
  units: {
    mm: 'mm',
    cm: 'cm',
    in: 'in',
    names: { mm: 'milímetros', cm: 'centímetros', in: 'pulgadas' },
    percent: '%',
    length: '{value} {unit}',
    size: '{w} × {h} {unit}',
    scale: '{n} %',
    // Leaving a length field with something that can't be read
    invalid: '«{text}» no es una medida válida. Se mantiene {value}.',
    // While typing something that can't become a length
    unreadable: 'Escribe una medida con números, por ejemplo 2,5 o 1/2 in',
    // Next to a field while what is typed is out of its range ({value} already formatted)
    max: 'Máximo {value}',
    min: 'Mínimo {value}',
  },

  // Visible key names (letters and symbols are shown as they are)
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
    PageUp: 'Re Pág',
    PageDown: 'Av Pág',
    Plus: '+',
    Minus: '−',
    Click: 'clic',
    ContextMenu: 'Menú',
    Drag: 'arrastrar',
    DoubleClick: 'doble clic',
    Wheel: 'rueda',
    // On Apple devices the modifiers are symbols, written together before the key («⇧⌘Z»)
    AltMac: '⌥',
    ShiftMac: '⇧',
    ControlMac: '⌃',
    // What screen readers say for each symbol
    spoken: { ModMac: 'Comando', AltMac: 'Opción', ShiftMac: 'Shift', ControlMac: 'Control' },
  },

  // Top bar
  bar: {
    add: 'Agregar',
    addTip: 'Agregar imágenes o PDF',
    arrange: 'Acomodar',
    arrangeTip: 'Acomodar las piezas sin superponerlas',
    undo: 'Deshacer',
    redo: 'Rehacer',
    shortcuts: 'Atajos de teclado',
    download: 'Descargar PDF',
    print: 'Imprimir',
  },

  // «Piezas» panel and piece names
  pieces: {
    title: 'Piezas',
    close: 'Cerrar el panel de piezas',
    addTitle: 'Agregar imágenes o PDF',
    addSub: 'o suéltalos aquí',
    empty: 'Todavía no hay piezas',
    emptyTip:
      'Agrega imágenes (JPG, PNG, WebP…) o PDF. Cada página es una pieza que puedes mover, rotar y cambiar de tamaño.',
    listHint:
      'Usa las flechas arriba y abajo para seleccionar una pieza (con Shift, varias seguidas; con {mod}, solo mover el foco), Shift+Espacio para agregar la enfocada a la selección o quitarla, Enter para ir a ella en la hoja y Supr para quitar las seleccionadas',
    count: { one: '{n} pieza', other: '{n} piezas' },
    // List headings with several sheets
    groupTitle: 'Hoja {i}',
    groupEmpty: 'Vacía',
    clear: 'Quitar todas',
    other: 'otra pieza',
    pastedName: 'Imagen pegada',
    rowSize: '{size}',
    rowSizePage: '{size} · pág. {page}',
    // A row's badges: their tooltips, and after the row's text for screen readers ({text}: the badge's)
    badgeSpoken: '. {text}',
    badges: {
      cut: 'Se sale de la hoja',
      pastMargin: 'Pasa el margen',
      overlap: 'Se superpone con otra pieza',
      lowRes: 'Puede verse pixelada',
    },
  },

  // The sheet on screen
  sheet: {
    numbered: 'Hoja {i} de {total}',
    // The title above each sheet is a button ({label}: «Hoja 2 de 3»)
    changePaper: 'Cambiar el papel',
    changePaperLabel: '{label}: cambiar el papel',
    changePaperHint: 'Lleva a Papel, en la pestaña Proyecto de Propiedades',
    // Each sheet's name for screen readers ({label}: «Hoja 2 de 3»)
    groupLabel: { one: '{label}, {n} pieza', other: '{label}, {n} piezas' },
    groupEmpty: '{label}, vacía',
    emptyHint: 'Hoja vacía',
    add: 'Agregar hoja',
    remove: 'Quitar hoja',
    removeLabel: 'Quitar la hoja {i}',
    // While dragging pieces out of the sheets: where dropping them creates a sheet
    dropNew: 'Suelta para crear una hoja',
    paperLabel: '{paper} · {size}',
    landscapeName: '{paper} horizontal',
    drop: 'Suelta imágenes o PDF, pega con {mod}+V o presiona O',
    dropNoKeys: 'Suelta imágenes o PDF, pega con {mod}+V o haz clic aquí',
    private: 'Tus archivos no salen del navegador',
    // On the sheet while «Duplicar» is hovered: how many copies would go to other sheets
    moreCopies: '+{n}',
  },

  // Papers: visible names of the ids in src/core/papers.js
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
    },
  },

  // Accessible name of each piece on the sheet («rotada», «seleccionada»: of the piece, feminine)
  piece: {
    roleDescription: 'pieza',
    a11y: '{name}, {size}, a {x} del borde izquierdo y {y} del superior',
    a11yPage: '{name} (página {page}), {size}, a {x} del borde izquierdo y {y} del superior',
    // {label}: the name above
    a11yTurned: '{label}, rotada {deg}°',
    // With several selected (or a pinned selection), each selected one's name
    a11ySelected: '{label}, seleccionada',
  },

  // Floating toolbar of the selected piece
  piecebar: {
    label: 'Acciones de la pieza',
    labelFor: 'Acciones de {name}',
    labelGroup: 'Acciones de {n} piezas',
    rotateLeft: 'Rotar 90° a la izquierda',
    rotateLeftTip: 'Rotar a la izquierda',
    rotateRight: 'Rotar 90° a la derecha',
    rotateRightTip: 'Rotar a la derecha',
    duplicate: 'Duplicar',
    remove: 'Quitar',
    removeTip: 'Quitar de la hoja',
    hint:
      'Flechas: mover (Shift: {coarse}; Alt: {fine}). Más y menos: agrandar o reducir. R y Shift+R: rotar. ' +
      'D: duplicar. M: ir a sus propiedades. Enter: barra de acciones. Shift+Espacio: agregar a la selección o quitar. Supr: quitar.',
    hintNoKeys:
      'Flechas: mover (Shift: {coarse}; Alt: {fine}). Enter: barra de acciones. Shift+Espacio: agregar a la selección o quitar. Supr: quitar.',
  },

  // Panel buttons on narrow screens
  dock: {
    pieces: 'Piezas',
    props: 'Propiedades',
  },

  // «Propiedades» panel
  props: {
    title: 'Propiedades',
    close: 'Cerrar el panel de propiedades',
    tabs: { piece: 'Pieza', project: 'Proyecto' },
    piece: 'Pieza',
    empty: 'Selecciona una pieza para editarla',
    pieceNamePage: '{name} · página {page}',
    x: 'X',
    xLabel: 'X: distancia desde el borde izquierdo, en {unit}',
    xTip: 'X: distancia desde el borde izquierdo',
    y: 'Y',
    yLabel: 'Y: distancia desde el borde superior, en {unit}',
    yTip: 'Y: distancia desde el borde superior',
    // Inside the compact fields, before the value (like X and Y): «An» and «Al»
    widthPrefix: 'An',
    heightPrefix: 'Al',
    widthLabel: 'Ancho, en {unit}',
    widthTip: 'Ancho',
    heightLabel: 'Alto, en {unit}',
    heightTip: 'Alto',
    scaleLabel: 'Escala, en porcentaje',
    scaleTip: 'Escala',
    slider: 'Escala',
    rotated: 'Rotada {deg}°',
    quick: 'Acciones rápidas de la pieza',
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
    fillWarningSheet: 'Reemplaza las piezas de la hoja {i} por copias de esta. Las demás hojas no cambian. Puedes deshacerlo.',
    fillSummary: { one: '{n} copia en {paper}', other: '{n} copias en {paper}' },
    fillSummarySheet: { one: '{n} copia en la hoja {i}', other: '{n} copias en la hoja {i}' },
    fillNoFit: 'No entra en la hoja: reduce la pieza',
    fillTooMany: { one: 'Entraría 1 copia y el máximo es {max}: agranda la pieza', other: 'Entrarían {n} copias y el máximo es {max}: agranda la pieza' },
    remove: 'Quitar de la hoja',
    removeMany: { one: 'Quitar 1 pieza', other: 'Quitar {n} piezas' },
    // Copies and «Seleccionar iguales»
    duplicate: 'Duplicar',
    duplicateTimes: 'Duplicar ×{n}',
    duplicateGroup: 'Duplicar',
    times: '×',
    duplicateCount: 'Copias de cada pieza',
    duplicateLabel: { one: 'Duplicar: 1 copia de cada pieza seleccionada', other: 'Duplicar: {n} copias de cada pieza seleccionada' },
    duplicateTip: { one: 'Agrega 1 copia de cada pieza en los huecos libres', other: 'Agrega {n} copias de cada pieza en los huecos libres' },
    duplicateMax: { one: 'Como mucho, 1 copia de cada pieza (máximo de {max} piezas)', other: 'Como mucho, {n} copias de cada pieza (máximo de {max} piezas)' },
    selectSame: 'Seleccionar iguales',
    selectSameTip: 'Seleccionar las piezas del mismo archivo',
    // With several selected
    groupOnSheet: 'En la hoja {i}',
    groupOnSheets: 'En {n} hojas. Medidas de la hoja {i}.',
    mixed: 'Mixta',
    // Align and distribute
    align: 'Alinear',
    alignTo: 'Alinear a',
    alignToSelection: 'Selección',
    alignToSheet: 'Hoja',
    alignSheetNote: 'Alinear al área útil de la hoja',
    alignSheetTip: 'Contra el área útil de la hoja (dentro del margen)',
    alignSelectionTip: 'Contra la caja de la selección',
    alignLeft: 'Alinear a la izquierda',
    alignCenterX: 'Centrar en horizontal',
    alignRight: 'Alinear a la derecha',
    alignTop: 'Alinear arriba',
    alignCenterY: 'Centrar en vertical',
    alignBottom: 'Alinear abajo',
    distribute: 'Distribuir',
    distributeBy: 'Distribuir con',
    // The gap of «Distribución», already formatted: «Separación (5 mm)»
    distributeGap: 'Separación ({gap})',
    distributeEven: 'Repartir parejo',
    distributeX: 'Distribuir en horizontal',
    distributeY: 'Distribuir en vertical',
    distributeNeedTwo: 'Selecciona 2 piezas o más de una misma hoja para distribuir',
    distributeNeedThree: 'Selecciona 3 piezas o más de una misma hoja para repartir parejo',
    resolution: {
      vector: 'Vectorial: nítida a cualquier tamaño',
      printsAt: 'Se imprime a {ppp} ppp',
      withNote: '{text} · {note}',
      ok: 'Calidad aceptable',
      low: 'Puede verse pixelada',
    },
    sheet: 'Papel',
    size: 'Tamaño',
    orientation: 'Orientación',
    portrait: 'Vertical',
    landscape: 'Horizontal',
    margin: 'Margen',
    marginLabel: 'Margen, en {unit}',
    arrange: 'Distribución',
    gap: 'Separación',
    gapLabel: 'Separación entre piezas, en {unit}',
    rotate: 'Rotación automática',
    overlap: 'Permitir superposición',
    grid: 'Grilla',
    gridShow: 'Mostrar grilla',
    gridSize: 'Tamaño de la grilla',
    gridChip: '{n} {unit}',
    gridCustom: 'Otro tamaño de grilla, en {unit}',
    snap: 'Imán',
    snapHint: 'Al arrastrar, las piezas se ajustan a la grilla',
  },

  // Crop and standard photo sizes (ids in src/core/crop.js)
  crop: {
    size: 'Tamaño de foto',
    original: 'Original',
    custom: 'Recorte libre',
    mixed: 'Mixto',
    option: '{name} · {size}',
    groups: { print: 'Fotos', id: 'Documentos', instant: 'Otros' },
    names: {
      '9x13': '9 × 13',
      '10x15': '10 × 15',
      '13x18': '13 × 18',
      '15x20': '15 × 20',
      '20x25': '20 × 25',
      '20x30': '20 × 30',
      '10x10': '10 × 10',
      'id-4x4': 'Carné 4 × 4',
      'passport-35x45': 'Pasaporte 3,5 × 4,5',
      'visa-5x5': 'Visa 5 × 5',
      instant: 'Instantánea',
    },
    start: 'Recortar',
    startSingle: 'Recortar: disponible con una sola pieza seleccionada',
    // Crop mode
    frameRole: 'recorte',
    frameLabel: 'Recorte de {name}: {size}',
    help: 'Arrastra la imagen o usa las flechas para moverla (Shift: más rápido). Rueda, más y menos: acercar o alejar. Arrastra los bordes o usa Alt+flechas para cambiar el tamaño del recorte. Enter: aplicar. Esc: cancelar.',
    // With a standard photo size ({name}: crop.names)
    helpLocked: 'Arrastra la imagen o usa las flechas para moverla (Shift: más rápido). Rueda, más y menos: acercar o alejar. Arrastra los bordes o usa Alt+flechas para cambiar el tamaño del recorte, que mantiene la proporción de {name}. Enter: aplicar. Esc: cancelar.',
    bar: 'Recorte',
    zoomIn: 'Acercar la imagen',
    zoomOut: 'Alejar la imagen',
    apply: 'Aplicar',
    applyTip: 'Aplicar el recorte',
    cancel: 'Cancelar',
    cancelTip: 'Cancelar el recorte',
    moved: 'Se ve desde el {x} % por la izquierda y el {y} % por arriba',
    zoomed: 'Se ve el {pct} % de la imagen',
    resized: 'Recorte de {size}',
    edge: 'La imagen ya llegó al borde',
    applied: 'Se recortó {name}: {size}',
    canceled: 'Se canceló el recorte',
    unchanged: 'El recorte no cambió',
  },

  // «Líneas de corte» in the Proyecto tab (modes and stroke: src/core/cutmarks.js)
  cuts: {
    title: 'Líneas de corte',
    modes: { none: 'Ninguna', corners: 'Esquinas', outline: 'Contorno', contour: 'Silueta' },
    more: 'Más opciones',
    margin: 'Margen de corte',
    marginLabel: 'Margen de corte, en {unit}',
    length: 'Largo de las marcas',
    lengthLabel: 'Largo de las marcas, en {unit}',
    offset: 'Distancia a la esquina',
    offsetLabel: 'Distancia a la esquina, en {unit}',
    weight: 'Grosor',
    weights: { thin: 'Fina', medium: 'Media', thick: 'Gruesa' },
    weightTip: '{n} pt',
    color: 'Color',
    colors: { black: 'Negro', gray: 'Gris', custom: 'Otro' },
    picker: 'Color de las líneas de corte',
    hex: 'Código hexadecimal del color, por ejemplo #1A2B3C',
    hexInvalid: 'Escribe un color como #1A2B3C',
    dash: 'Trazo',
    dashes: { solid: 'Continuo', dotted: 'Punteado' },
    gapNote: 'Con una separación menor que {value}, las marcas tocan las piezas vecinas',
    gapFix: 'Usar separación de {value}',
    gapFixed: 'Se cambió la separación a {value}. Acomoda las piezas para aplicarla.',
  },

  // The canvas zoom (a screen measure: 100 % is not the printed size)
  zoom: {
    control: 'Zoom',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    level: '{pct} %',
    levelLabel: '{pct} %: zoom de la vista',
    levelTip: 'Zoom de la vista (no cambia el PDF)',
    menu: 'Zoom',
    fit: 'Ver la hoja entera',
    width: 'Ver el ancho de la hoja',
    preset: '{pct} %',
    fitDone: 'Se ve la hoja entera',
    widthDone: 'Se ve el ancho de la hoja',
    changed: 'Zoom {pct} %',
  },

  // Context menus (pieces, an empty sheet) and their shortcuts; disabled items say why
  menu: {
    piece: 'Acciones de la pieza',
    pieces: 'Acciones de {n} piezas',
    sheet: 'Acciones de la hoja {i}',
    rotateLeft: 'Rotar a la izquierda',
    rotateRight: 'Rotar a la derecha',
    duplicate: 'Duplicar',
    copy: 'Copiar',
    cut: 'Cortar',
    paste: 'Pegar',
    front: 'Traer al frente',
    crop: 'Recortar',
    selectSame: 'Seleccionar iguales',
    newSheet: 'Mover a una hoja nueva',
    remove: 'Quitar',
    selectSheet: 'Seleccionar todo en esta hoja',
    arrange: 'Acomodar',
    addSheet: 'Agregar hoja',
    reasons: {
      paste: 'Primero copia piezas. Para pegar una imagen copiada en otra app, usa {mod}+V.',
      single: 'Disponible con una sola pieza seleccionada',
      front: 'Disponible cuando se superpone con otra pieza',
      oneSheet: 'Disponible cuando las piezas están en una misma hoja',
      emptySheet: 'La hoja está vacía',
      noPieces: 'Todavía no hay piezas',
    },
  },

  // Notice pill
  notices: {
    close: 'Cerrar aviso',
    // For screen readers, after the notice's text when it has a button
    actionAvailable: 'Botón {action} disponible en el aviso',
    cut: {
      one: '1 pieza se sale de la hoja y se corta al imprimir',
      other: '{n} piezas se salen de la hoja y se cortan al imprimir',
    },
    pastMargin: {
      one: '1 pieza pasa el margen y puede que la impresora no imprima ese borde',
      other: '{n} piezas pasan el margen y puede que la impresora no imprima esos bordes',
    },
    overlap: 'Hay piezas superpuestas',
    // With several sheets ({list}: «1 y 3»)
    overlapIn: { one: 'Hoja {list}: hay piezas superpuestas', other: 'Hojas {list}: hay piezas superpuestas' },
    // The sheets a problem is on, before it ({text}: notices.cut or notices.pastMargin): «Hojas 1 y 3: 2 piezas se salen…»
    inSheets: { one: 'Hoja {list}: {text}', other: 'Hojas {list}: {text}' },
    arranged: { one: 'Se acomodó 1 pieza', other: 'Se acomodaron {n} piezas' },
    arrangedSheets: { one: 'Se acomodó 1 pieza en {sheets} hojas', other: 'Se acomodaron {n} piezas en {sheets} hojas' },
    unplaced: {
      one: '{names} no entra en la hoja ni sola: quedó donde estaba',
      other: '{n} piezas no entran en la hoja ni solas y quedaron donde estaban: {names}',
    },
    shrinkToOne: 'Reducir al {pct} % para usar 1 hoja',
    fitted: { one: 'Se ajustó 1 pieza a la hoja', other: 'Se ajustaron {n} piezas a la hoja' },
    shrunk: {
      one: 'Se acomodó 1 pieza, reducida al {pct} %',
      other: 'Se acomodaron {n} piezas, reducidas al {pct} %',
    },
    filled: { one: 'Se rellenó la hoja con 1 copia', other: 'Se rellenó la hoja con {n} copias' },
    filledSheet: { one: 'Se rellenó la hoja {i} con 1 copia', other: 'Se rellenó la hoja {i} con {n} copias' },
    duplicatedTimesSheets: { one: 'Se agregó 1 copia en {sheets} hojas', other: 'Se agregaron {n} copias en {sheets} hojas' },
    // A group operation that wasn't applied, by operation
    wouldOverlap: {
      align: 'No se puede alinear: las piezas se superpondrían',
      distribute: 'No se puede distribuir: las piezas se superpondrían',
      rotate: 'No se puede rotar: las piezas se superpondrían',
      scale: 'No se puede cambiar el tamaño: las piezas se superpondrían',
      move: 'No se puede mover: las piezas se superpondrían',
    },
    wouldLeave: {
      align: 'No se puede alinear: alguna pieza quedaría fuera de la hoja',
      distribute: 'No se puede distribuir: alguna pieza quedaría fuera de la hoja',
      rotate: 'No se puede rotar: alguna pieza quedaría fuera de la hoja',
      scale: 'No se puede cambiar el tamaño: alguna pieza quedaría fuera de la hoja',
      move: 'No se puede mover: alguna pieza quedaría fuera de la hoja',
    },
    scaleLimit: 'No se puede cambiar el tamaño: la escala de cada pieza va de 1 % a 1000 %',
    // Standard photo sizes ({name}: crop.names; {size} already formatted)
    sized: 'Se recortó a {name}: {size}',
    sizedMany: { one: 'Se recortó 1 pieza a {name}', other: 'Se recortaron {n} piezas a {name}' },
    uncropped: 'Se quitó el recorte',
    uncroppedMany: { one: 'Se quitó el recorte de 1 pieza', other: 'Se quitó el recorte de {n} piezas' },
    movedAside: { one: '1 pieza se movió a un lugar libre para no superponerse', other: '{n} piezas se movieron a lugares libres para no superponerse' },
    // Pieces that changed size and had no room left on their sheet
    movedToSheet: { one: '1 pieza pasó a la hoja {i} para no superponerse', other: '{n} piezas pasaron a la hoja {i} para no superponerse' },
    // On several sheets, so always 2 pieces or more
    movedToSheets: '{n} piezas pasaron a las hojas {list} para no superponerse',
    sheetEmptied: 'La hoja {i} quedó vacía',
    cleared: { one: 'Se quitó 1 pieza', other: 'Se quitaron las {n} piezas' },
    pageCropDropped: 'Se quitó el recorte: la página {page} tiene otro tamaño',
    // Several pieces removed at once, a sheet with its pieces (the notice offers «Deshacer»)
    removedMany: { one: 'Se quitó 1 pieza', other: 'Se quitaron {n} piezas' },
    removedManyLast: { one: 'Se quitó 1 pieza. La hoja está vacía.', other: 'Se quitaron {n} piezas. La hoja está vacía.' },
    sheetRemoved: { one: 'Se quitó la hoja {i} con 1 pieza', other: 'Se quitó la hoja {i} con {n} piezas' },
    // Added files spread over several sheets, so always 2 or more ({list}: «2 y 3»); the view shows the first one
    addedOnSheets: 'Se agregaron {n} archivos en las hojas {list}',
    pastedSheets: { one: 'Se pegó 1 pieza en {sheets} hojas', other: 'Se pegaron {n} piezas en {sheets} hojas' },
    duplicatedManySheets: {
      one: 'Se agregó 1 copia en {sheets} hojas. Hay {total} piezas.',
      other: 'Se agregaron {n} copias en {sheets} hojas. Hay {total} piezas.',
    },
    sizeOutOfRange: { one: '{names} no se puede llevar a ese tamaño: su escala pasaría de 1 % a 1000 %', other: '{n} piezas no se pueden llevar a ese tamaño: su escala pasaría de 1 % a 1000 %' },
    downloaded: 'Se descargó {file}',
    // Ctrl+S: there is nothing to save by hand
    autosave: 'Los cambios se guardan automáticamente',
    // Projects
    saveFailed: 'No se pudo guardar el proyecto. Vuelve a intentarlo.',
    quota: 'No hay espacio para guardar el proyecto. Elimina proyectos que no uses y vuelve a intentarlo.',
    openFailed: 'No se pudo abrir «{name}» porque sus datos están dañados',
    openNewer: '«{name}» se guardó con una versión más nueva de {app}. Recarga la página para abrirlo.',
    reload: 'Recargar la página',
    openError: 'No se pudo abrir el proyecto. Inténtalo de nuevo.',
    // Each action of «Proyectos» that failed
    renameFailed: 'No se pudo cambiar el nombre. Inténtalo de nuevo.',
    duplicateFailed: 'No se pudo duplicar «{name}». Inténtalo de nuevo.',
    deleteFailed: 'No se pudo eliminar «{name}». Inténtalo de nuevo.',
    createFailed: 'No se pudo crear el proyecto nuevo. Inténtalo de nuevo.',
    takenOver: 'Este proyecto se abrió en otra pestaña. Aquí ya no se guardan los cambios.',
    deletedElsewhere: 'Este proyecto se eliminó en otra pestaña. Aquí ya no se guardan los cambios.',
    saveAsNew: 'Guardar como proyecto nuevo',
    deleteProject: 'Eliminar proyecto',
    seeProjects: 'Ver proyectos',
    printTab: 'Se abrió el PDF en otra pestaña. Imprímelo desde ahí.',
    printDownload: 'Se descargó {file}. Ábrelo para imprimirlo.',
  },

  // While something loads or is created (in the pill)
  busy: {
    loading: 'Cargando…',
    loadingFile: 'Cargando {name}…',
    loadingCount: 'Cargando {i} de {n}…',
    loadingPage: 'Cargando la página {page}…',
    pdf: 'Creando el PDF…',
    print: 'Preparando la impresión…',
    openingProject: 'Abriendo el proyecto…',
  },

  // Errors: what happened and how to fix it
  errors: {
    load: {
      one: 'No se pudo agregar 1 archivo: {list}',
      other: 'No se pudieron agregar {n} archivos: {list}',
    },
    loadSeparator: ' · ',
    loadItem: '{name}: {reason}',
    unnamedFile: 'Archivo sin nombre',
    maxReached: 'se admiten hasta {max} piezas en total ({n} sin agregar)',
    maxPieces: 'Se admiten hasta {max} piezas en total. Quita alguna para duplicar esta.',
    maxCopies: {
      zero: 'Ya hay {max} piezas, el máximo. Quita alguna para duplicar.',
      one: 'Solo entra 1 copia más de cada pieza (máximo {max} piezas)',
      other: 'Solo entran {n} copias más de cada pieza (máximo {max} piezas)',
    },
    maxPaste: {
      zero: 'Ya hay {max} piezas, el máximo. Quita alguna para pegar.',
      one: 'Solo entra 1 pieza más (máximo {max} piezas)',
      other: 'Solo entran {n} piezas más (máximo {max} piezas)',
    },
    page: 'No se pudo cargar la página {page}. Inténtalo de nuevo.',
    pdf: 'No se pudo crear el PDF. Inténtalo de nuevo.',
    marginTooBig: 'El margen no deja espacio para las piezas. Reduce el margen.',
    shrinkFailed: 'No se pudieron acomodar las piezas ni reduciéndolas. Quita algunas e inténtalo de nuevo.',
    // Per file (they follow «name: »)
    file: {
      tooHeavy: 'pesa más de 40 MB; prueba con un archivo más pequeño',
      noSize: 'la imagen no tiene ancho ni alto definidos; guárdala como PNG o JPG',
      tooManyPixels: 'tiene {mp} MP y el máximo es 60 MP; reduce su resolución',
      unsupported: 'el navegador no puede abrir este formato; prueba con JPG, PNG o WebP',
      processFailed: 'no se pudo procesar el archivo; inténtalo de nuevo',
      password: 'el PDF tiene contraseña; guárdalo sin contraseña y vuelve a agregarlo',
      damaged: 'no se pudo leer el PDF; si está dañado, vuelve a exportarlo',
    },
  },

  // Screen readers only (live region)
  announce: {
    rotated: 'Rotada {deg}°: {size}',
    duplicated: { one: 'Se duplicó la pieza. Hay {n} pieza.', other: 'Se duplicó la pieza. Hay {n} piezas.' },
    duplicatedTo: {
      one: 'Se duplicó la pieza en la hoja {i}. Hay {n} pieza.',
      other: 'Se duplicó la pieza en la hoja {i}. Hay {n} piezas.',
    },
    fitted: 'Ajustada a la hoja: {size}',
    centered: 'Centrada en la hoja',
    actualSize: 'Tamaño real: {size}',
    frontNotNeeded: 'La pieza no se superpone con otras: no hace falta traerla al frente',
    front: 'Se trajo la pieza al frente',
    removed: 'Se quitó {name}',
    removedLast: 'Se quitó {name}. La hoja está vacía.',
    jumped: 'Saltó sobre {names}',
    position: 'A {x} del borde izquierdo y {y} del superior',
    noRoom: 'No hay más espacio para agrandarla',
    scaled: 'Escala {scale} %: {size}',
    arrangedAlready: { one: 'La pieza ya está acomodada', other: 'Las piezas ya están acomodadas' },
    // A photo size or «Original» that changes nothing
    sizedAlready: { one: 'La pieza ya tiene ese tamaño', other: 'Las piezas ya tienen ese tamaño' },
    uncroppedAlready: { one: 'La pieza no tiene recorte', other: 'Las piezas no tienen recorte' },
    undone: 'Se deshizo el último cambio',
    redone: 'Se rehízo el último cambio',
    sheet: 'Hoja {paper}',
    gridShown: 'Grilla visible, cada {size}',
    gridHidden: 'Grilla oculta',
    snapOn: 'Imán activado',
    snapOff: 'Imán desactivado',
    addedTo: { one: 'Se agregó 1 archivo a la hoja {i}', other: 'Se agregaron {n} archivos a la hoja {i}' },
    sheetAdded: 'Se agregó la hoja {i}',
    sheetRemovedEmpty: 'Se quitó la hoja {i}',
    movedToSheet: 'Se movió a la hoja {i} de {total}',
    // A drop where the piece can't go: it goes back (the canvas shows it; this is for screen readers)
    reverted: 'No hay espacio ahí. La pieza volvió a su lugar.',
    revertedGroup: 'No hay espacio ahí. Las piezas volvieron a su lugar.',
    movedToNewSheet: { one: 'Se creó la hoja {i} y se movió 1 pieza', other: 'Se creó la hoja {i} y se movieron {n} piezas' },
    firstSheet: 'Es la primera hoja',
    lastSheet: 'Es la última hoja',
    needSelection: 'Primero selecciona una pieza',
    projectOpened: 'Se abrió «{name}»',
    projectCreated: 'Se creó un proyecto nuevo. «{name}» quedó guardado.',
    projectReplaced: 'Ahora está abierto «{name}»',
    projectDuplicated: 'Se duplicó «{name}»',
    projectRenamed: 'Ahora se llama «{name}»',
    projectDeleted: 'Se eliminó «{name}»',
    projectSaved: 'Se guardó el proyecto',
    deselected: 'Ninguna pieza seleccionada',
    // Clipboard
    copied: { one: 'Se copió 1 pieza', other: 'Se copiaron {n} piezas' },
    cut: { one: 'Se cortó 1 pieza', other: 'Se cortaron {n} piezas' },
    pasted: { one: 'Se pegó 1 pieza en la hoja {i}', other: 'Se pegaron {n} piezas en la hoja {i}' },
    nothingToPaste: 'No hay piezas copiadas para pegar',
    // The text that goes to the system clipboard with the copied pieces
    copiedText: { one: '1 pieza de {app}', other: '{n} piezas de {app}' },
    // The properties panel switched tabs on its own (after a keyboard action)
    propsPiece: 'Propiedades muestra la pestaña Pieza',
    propsProject: 'Propiedades muestra la pestaña Proyecto',
    // Multiple selection
    selectedCount: { one: '1 pieza seleccionada', other: '{n} piezas seleccionadas' },
    selectionPinned: '1 pieza seleccionada. Ve a otra con Tab y agrégala con Shift+Espacio.',
    selectedSheet: { one: 'Se seleccionó 1 pieza de la hoja {i}', other: 'Se seleccionaron las {n} piezas de la hoja {i}' },
    selectedAll: { one: 'Se seleccionó la única pieza', other: 'Se seleccionaron las {n} piezas de todas las hojas' },
    noPieces: 'No hay piezas para seleccionar',
    singleOnly: 'Disponible con una sola pieza seleccionada',
    groupRotatedRight: { one: 'Se rotó 1 pieza 90° a la derecha', other: 'Se rotaron {n} piezas 90° a la derecha' },
    groupRotatedLeft: { one: 'Se rotó 1 pieza 90° a la izquierda', other: 'Se rotaron {n} piezas 90° a la izquierda' },
    groupScaled: { one: 'Se cambió el tamaño de 1 pieza: {size}', other: 'Se cambió el tamaño de {n} piezas: {size}' },
    noRoomGroup: 'No hay más espacio para agrandarlas',
    noSmallerGroup: 'No se pueden reducir más',
    actualSizeGroup: { one: '1 pieza a tamaño real', other: '{n} piezas a tamaño real' },
    duplicatedMany: {
      one: 'Se agregó 1 copia. Hay {total} piezas.',
      other: 'Se agregaron {n} copias. Hay {total} piezas.',
    },
    duplicatedTimes: { one: 'Se agregó 1 copia en la hoja {i}', other: 'Se agregaron {n} copias en la hoja {i}' },
    // Against the selection's box, by mode
    aligned: {
      left: { one: 'Se alineó 1 pieza a la izquierda', other: 'Se alinearon {n} piezas a la izquierda' },
      centerX: { one: 'Se alineó 1 pieza al centro en horizontal', other: 'Se alinearon {n} piezas al centro en horizontal' },
      right: { one: 'Se alineó 1 pieza a la derecha', other: 'Se alinearon {n} piezas a la derecha' },
      top: { one: 'Se alineó 1 pieza arriba', other: 'Se alinearon {n} piezas arriba' },
      centerY: { one: 'Se alineó 1 pieza al centro en vertical', other: 'Se alinearon {n} piezas al centro en vertical' },
      bottom: { one: 'Se alineó 1 pieza abajo', other: 'Se alinearon {n} piezas abajo' },
    },
    // Against the printable area, by mode
    alignedSheet: {
      left: { one: 'Se alineó 1 pieza a la izquierda del área útil', other: 'Se alinearon {n} piezas a la izquierda del área útil' },
      centerX: { one: 'Se alineó 1 pieza al centro en horizontal del área útil', other: 'Se alinearon {n} piezas al centro en horizontal del área útil' },
      right: { one: 'Se alineó 1 pieza a la derecha del área útil', other: 'Se alinearon {n} piezas a la derecha del área útil' },
      top: { one: 'Se alineó 1 pieza arriba del área útil', other: 'Se alinearon {n} piezas arriba del área útil' },
      centerY: { one: 'Se alineó 1 pieza al centro en vertical del área útil', other: 'Se alinearon {n} piezas al centro en vertical del área útil' },
      bottom: { one: 'Se alineó 1 pieza abajo del área útil', other: 'Se alinearon {n} piezas abajo del área útil' },
    },
    alignedAlready: { one: 'La pieza ya estaba alineada', other: 'Las piezas ya estaban alineadas' },
    // By axis ({gap} already formatted)
    distributedGap: {
      x: { one: 'Se distribuyó 1 pieza en horizontal, a {gap}', other: 'Se distribuyeron {n} piezas en horizontal, a {gap} una de otra' },
      y: { one: 'Se distribuyó 1 pieza en vertical, a {gap}', other: 'Se distribuyeron {n} piezas en vertical, a {gap} una de otra' },
    },
    distributedEven: {
      x: { one: 'Se repartió 1 pieza parejo en horizontal', other: 'Se repartieron {n} piezas parejo en horizontal' },
      y: { one: 'Se repartió 1 pieza parejo en vertical', other: 'Se repartieron {n} piezas parejo en vertical' },
    },
    distributedAlready: 'Las piezas ya estaban distribuidas',
    selectedSame: { one: 'Se seleccionó 1 pieza: no hay otras del mismo archivo', other: 'Se seleccionaron {n} piezas del mismo archivo' },
    selectedSameSheets: { one: 'Se seleccionó 1 pieza del mismo archivo', other: 'Se seleccionaron {n} piezas del mismo archivo, en {sheets} hojas' },
  },

  print: {
    frameTitle: 'PDF para imprimir',
    pdfTitle: '{app} {paper}',
    fallbackName: 'hoja',
  },

  // The request for a donation, in the summary after printing
  donate: {
    title: '¿Te ahorró tiempo y papel?',
    body: '{app} es gratis, sin anuncios ni marcas de agua. Se mantiene gracias a personas como tú.',
    cta: 'Aportar en Patreon',
    ctaNote: 'Se abre en otra pestaña',
    never: 'No volver a mostrar',
  },

  // The advice before printing or downloading
  printTip: {
    title: 'Antes de imprimir',
    titleDownload: 'Antes de descargar',
    lead: 'En el diálogo de impresión, elige:',
    leadDownload: 'Cuando lo imprimas, elige:',
    scaleStep: 'Escala: «Tamaño real» o «100 %»',
    paperStep: 'Papel: {paper}',
    // The drawing of a print dialog (the browser's options, as they read there)
    scale: 'Escala',
    paper: 'Papel',
    fit: 'Ajustar a la página',
    actual: '100 %',
    never: 'No volver a mostrar',
    print: 'Imprimir',
    download: 'Descargar',
    cancel: 'Cancelar',
  },

  // The summary after printing or downloading (what the PDF saves)
  summary: {
    // The dialog's title: the sheets saved or, with none, that the PDF is ready
    saved: { one: 'Ahorraste {n} hoja', other: 'Ahorraste {n} hojas' },
    ready: 'El PDF está listo',
    done: 'Listo',
    percent: '{n} %',
    // {pct}: «60 %», shown bigger than the rest
    less: '{pct} menos papel',
    usage: { one: '{pct} de la hoja aprovechada', other: '{pct} de las hojas aprovechadas' },
    sheets: { one: 'Usaste {n} hoja en lugar de {baseline}', other: 'Usaste {n} hojas en lugar de {baseline}' },
    // The comparison drawn with sheets: a row for each way of printing, with its count
    oneEach: 'Una pieza por hoja',
    withApp: 'Con {app}',
    count: { one: '{n} hoja', other: '{n} hojas' },
    // The sheets beyond the ones drawn
    more: '+{n}',
    total: { one: 'Llevas {n} hoja ahorrada', other: 'Llevas {n} hojas ahorradas' },
    // {fact}: one of summary.facts
    totalWith: { one: 'Llevas {n} hoja ahorrada: {fact}', other: 'Llevas {n} hojas ahorradas: {fact}' },
    equivalent: 'Equivale a {fact}',
    facts: {
      grams: 'unos {n} g de papel',
      kg: 'unos {n} kg de papel',
      stack: 'una pila de papel de {n} cm',
      reams: { one: '{n} resma de 500 hojas', other: '{n} resmas de 500 hojas' },
    },
    milestone: 'Llegaste a {n} hojas ahorradas',
    suggest: 'Con <link>Acomodar</link> podrían entrar en una hoja menos',
  },

  // Projects saved in the browser
  projects: {
    title: 'Proyectos',
    untitled: 'Sin título',
    copyName: '{name} (copia)',
    nameLabel: '{name}: cambiar el nombre',
    nameField: 'Nombre del proyecto',
    renameTip: 'Cambiar el nombre',
    // Next to the name, only when something stops the project from being saved
    status: {
      error: 'No se guardó',
      off: 'Sin guardar',
      readonly: 'En otra pestaña',
    },
    statusTip: {
      error: 'No se pudo guardar el último cambio',
      off: 'Este navegador no permite guardar proyectos',
      readonly: 'El proyecto está abierto en otra pestaña',
    },
    retry: 'Reintentar',
    takeOver: 'Editar aquí',
    new: 'Nuevo proyecto',
    newNote: 'El proyecto abierto se guarda solo',
    empty: 'Todavía no hay proyectos',
    unavailable: 'Este navegador no permite guardar proyectos (por ejemplo, en una ventana privada). Lo que hagas se pierde al cerrar la pestaña.',
    current: 'Abierto',
    damaged: 'Dañado',
    damagedMeta: 'No se puede abrir: sus datos están dañados',
    // Saved by a newer version of the app: nothing is wrong with it
    newer: 'Versión más nueva',
    newerMeta: 'Se guardó con una versión más nueva de {app}. Recarga la página para abrirlo.',
    meta: '{when} · {sheets} · {pieces}',
    sheets: { one: '{n} hoja', other: '{n} hojas' },
    open: 'Abrir «{name}»',
    openCurrent: 'Volver a «{name}» (abierto)',
    duplicate: 'Duplicar',
    duplicateLabel: 'Duplicar «{name}»',
    rename: 'Cambiar el nombre',
    renameLabel: 'Cambiar el nombre de «{name}»',
    delete: 'Eliminar',
    deleteLabel: 'Eliminar «{name}»',
    deleteTitle: '¿Eliminar «{name}»?',
    deleteBody: 'Se borra de este navegador con todos sus archivos. No se puede deshacer.',
    deleteConfirm: 'Eliminar proyecto',
    // The space this browser keeps for the app: a bar with what is used
    usageName: 'Espacio usado en este navegador',
    usage: '{used} de {quota} usados',
    usagePercent: '{n} %',
    usageLess: 'menos de 1 %',
    usageValue: '{usage} ({percent})',
    usageLow: 'Queda poco espacio. Elimina proyectos que no uses.',
  },

  // Short confirmations
  confirm: {
    cancel: 'Cancelar',
    // «Quitar todas»
    clearTitle: { one: '¿Quitar la pieza?', other: '¿Quitar las {n} piezas?' },
    clearTitleSheets: { one: '¿Quitar la pieza de las {sheets} hojas?', other: '¿Quitar las {n} piezas de las {sheets} hojas?' },
    clearBody: 'Se puede deshacer',
    clearBodySheets: 'Queda 1 hoja vacía. Se puede deshacer.',
  },

  // A link that opens the app with a new project set up (docs/deep-links.md); {paper}: «A4», «Carta horizontal»
  deepLink: {
    created: 'Se creó un proyecto nuevo con papel {paper}',
    // {name}: crop.names; {size} already formatted
    createdSized: 'Se creó un proyecto nuevo con papel {paper}. Las fotos que agregues se recortan a {name}: {size}.',
    createdCustom: 'Se creó un proyecto nuevo con papel {paper}. Las fotos que agregues se recortan a {size}.',
  },

  // Links to the site's legal pages (at the foot of Preferencias)
  legal: {
    terms: 'Términos de uso',
    privacy: 'Política de privacidad',
    separator: ' · ',
  },

  // «Preferencias» dialog (settings of this browser)
  prefs: {
    title: 'Preferencias',
    theme: 'Tema',
    themes: { auto: 'Automático', light: 'Claro', dark: 'Oscuro' },
    printing: 'Impresión',
    printTip: 'Consejo antes de imprimir',
    printSummary: 'Resumen después de imprimir',
    units: 'Unidades',
    // Each unit's accessible name: its visible symbol, then its name (units.names)
    unitLabel: '{symbol}, {name}',
    unitChanged: 'Medidas en {unit}',
    keyboard: 'Teclado',
    singleKeys: 'Atajos de 1 tecla',
    singleKeysHint:
      'Desactívalos si usas control por voz o si se activan sin querer. Los atajos con {mod}, las flechas y Supr sobre una pieza siguen funcionando.',
  },

  // «Atajos de teclado» dialog
  shortcuts: {
    title: 'Atajos de teclado',
    // The part between <link> and </link> is a button that opens Preferencias (see splitLink).
    singleKeysNote: 'Los atajos de 1 tecla se activan en <link>Preferencias</link>',
    search: 'Buscar atajos',
    // Nothing matches what was typed ({query}: as typed)
    empty: 'No hay atajos que coincidan con «{query}»',
    off: 'Desactivado',
    // The keys that aren't commands (the rest of the rows are the commands' names)
    rows: {
      tab: 'Recorrer la barra, los paneles y las piezas; en la hoja, enfocar una pieza la selecciona',
      move: 'Mover la pieza {normal} (Shift: {coarse}; Alt: {fine}). Si choca con otra, salta al otro lado.',
      scale: 'Agrandar o reducir 1 % (Shift: 10 %)',
      wheel: 'Acercar o alejar la vista (también pellizcando el trackpad)',
      pan: 'Mover la vista (también con el botón del medio o desplazando con dos dedos)',
      menu: 'Abrir el menú de la pieza o de la hoja (también con clic derecho o manteniendo presionado)',
      toolbar: 'Sobre una pieza, ir a su barra de acciones',
      toggleSelect: 'Sobre una pieza, agregarla a la selección o quitarla',
      clickSelect: 'Agregar una pieza a la selección o quitarla (arrastrar en un lugar vacío selecciona con un recuadro)',
      doubleClick: 'Sobre una pieza, recortarla',
      cropKeys: 'En el recorte, aplicar o cancelar (las flechas mueven la imagen, y más y menos la acercan o alejan)',
      pages: 'En las hojas, ir a la hoja anterior o a la siguiente',
      sendPage: 'Mover la pieza a la hoja anterior o a la siguiente (si no hay lugar, a una hoja nueva)',
      escape: 'En un panel, volver a la pieza o cerrar el panel; en la hoja, anular la selección',
    },
  },

  // Every action of the app by its name (state/commands.ts): the command
  // palette lists them and the shortcuts dialog shows their keys. The actions
  // with a button of the same name use the button's text.
  commands: {
    sections: { general: 'General', projects: 'Proyectos', selection: 'Selección', sheets: 'Hojas', view: 'Vista', prefs: 'Preferencias' },
    projects: 'Abrir Proyectos',
    duplicateProject: 'Duplicar el proyecto',
    renameProject: 'Cambiar el nombre del proyecto',
    shortcuts: 'Ver los atajos de teclado',
    selectAll: 'Seleccionar todo',
    removeSheet: 'Quitar la hoja actual',
    gotoSheet: 'Ir a una hoja',
    orientation: 'Cambiar la orientación de la hoja',
    cutLines: 'Cambiar las líneas de corte',
    clearAll: 'Quitar todas las piezas',
    grid: 'Mostrar u ocultar la grilla',
    snap: 'Activar o desactivar el imán',
    zoom100: 'Zoom al 100 %',
    zoomIn: 'Acercar la vista',
    zoomOut: 'Alejar la vista',
    tabPiece: 'Ir a la pestaña Pieza',
    tabProject: 'Ir a la pestaña Proyecto',
    pieces: 'Ir a la lista de piezas',
    prefs: 'Abrir Preferencias',
    // {unit}: the unit's name (units.names)
    unit: 'Medir en {unit}',
    themes: { auto: 'Usar el tema automático', light: 'Usar el tema claro', dark: 'Usar el tema oscuro' },
    // Why an action can't run now (the rest are the menus' reasons)
    reasons: {
      undo: 'No hay cambios para deshacer',
      redo: 'No hay cambios para rehacer',
      oneSheet: 'Disponible con 2 hojas o más',
    },
    // Other words that find each action in the palette, separated by commas:
    // what someone may type instead of the name (also terms the app avoids)
    aliases: {
      add: 'subir, importar, abrir, archivo, imagen, foto, pdf',
      arrange: 'organizar, ordenar, autoacomodar, empaquetar',
      undo: 'revertir, atrás',
      redo: 'repetir, adelante',
      print: 'impresora',
      download: 'exportar, guardar, bajar, pdf',
      shortcuts: 'ayuda, teclas, teclado, combinaciones',
      projects: 'abrir, cambiar de proyecto, lista',
      newProject: 'crear, empezar, en blanco',
      duplicateProject: 'copiar, copia',
      renameProject: 'renombrar, título, nombre',
      duplicate: 'copiar, clonar, copia',
      remove: 'borrar, eliminar, suprimir',
      rotate: 'girar, voltear, 90°',
      fit: 'maximizar, encajar, agrandar, llenar',
      center: 'medio, centro',
      actualSize: '100 %, escala, original',
      front: 'arriba, encima, adelante, orden, capa',
      crop: 'recorte, encuadre, tamaño de foto',
      selectSame: 'mismo archivo, repetidas',
      selectAll: 'todas, todo',
      clipboard: 'portapapeles',
      align: 'borde, justificar',
      distribute: 'espaciar, repartir, equidistar',
      newSheet: 'nueva hoja, mover',
      addSheet: 'nueva hoja, página',
      removeSheet: 'borrar hoja, eliminar hoja, página',
      gotoSheet: 'hoja, página, navegar',
      paper: 'tamaño, A4, carta, oficio, hoja',
      orientation: 'vertical, horizontal, apaisado, girar la hoja',
      cutLines: 'esquinas, contorno, silueta, marcas, corte',
      clearAll: 'vaciar, borrar todo, limpiar',
      grid: 'cuadrícula, rejilla',
      snap: 'ajustar a la grilla, snap',
      zoom: 'zoom, acercar, alejar, vista',
      tabs: 'propiedades, panel',
      pieces: 'panel, lista',
      prefs: 'configuración, ajustes, opciones',
      unit: 'unidades, medidas, mm, cm, in, pulgadas',
      theme: 'tema, colores, apariencia, modo',
    },
  },

  // The command palette (Mod+K, or the search button in the top bar)
  palette: {
    title: 'Buscar acciones',
    placeholder: 'Busca una acción',
    choicePlaceholder: 'Busca una opción',
    recent: 'Recientes',
    back: 'Volver',
    // Nothing matches what was typed ({query}: as typed)
    empty: 'No hay acciones que coincidan con «{query}»',
    emptyChoice: 'No hay opciones que coincidan con «{query}»',
  },
};

export default es;
