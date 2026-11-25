/* Semilla inicial — BIOSMART QR.
   Inserta zonas, estados de verificación y especies solo si la base está vacía.
   Contenido con fuentes citadas; nada se inventa: los datos no verificados se marcan. */
'use strict';
const { get, run } = require('./db');

const ZONES = [
  { slug: 'jardin-biodiversidad', name_es: 'Jardín de biodiversidad', name_en: 'Biodiversity garden', name_qu: 'Kawsay sumak huasi', name_ay: 'Sarna taqi jacawi', desc: 'Sector con plantas nativas y floración continua destinado a polinizadores.', x: 16, y: 24, color: '#40916c', sort: 1 },
  { slug: 'corredor-biologico', name_es: 'Corredor biológico', name_en: 'Biological corridor', name_qu: 'Laku waqaychanan ñan', name_ay: 'Sulka aruna apnaqa', desc: 'Franza de conexión que permite el desplazamiento de fauna entre áreas verdes.', x: 44, y: 46, color: '#2d6a4f', sort: 2 },
  { slug: 'zona-reforestacion', name_es: 'Zona de reforestación', name_en: 'Reforestation zone', name_qu: 'Sachaqaway kunka chakran', name_ay: 'Saru apnaqaña awatiri', desc: 'Área con plantaciones jóvenes de especies nativas de restauración.', x: 74, y: 26, color: '#52b788', sort: 3 },
  { slug: 'area-descanso', name_es: 'Área de descanso', name_en: 'Resting area', name_qu: 'Samay nan kawsana', name_ay: "Samxawaña ch'uma", desc: 'Espacios de sombra y descanso para visitantes, con avistamientos frecuentes de aves.', x: 58, y: 74, color: '#74c69d', sort: 4 },
  { slug: 'otra', name_es: 'Otra zona', name_en: 'Other area', name_qu: "Maywan chakra", name_ay: "Maya apnaqa", desc: 'Otro punto de la Avenida Ecológica indicado por el observador.', x: 88, y: 84, color: '#95d5b2', sort: 5 },
];

const STATES = [
  { code: 'pending', name_es: 'Pendiente de revisión', name_en: 'Pending review', name_qu: 'Qhawasqanpaq suyay', name_ay: 'Uqawixa chiqawaña', sort: 1 },
  { code: 'verified', name_es: 'Verificado', name_en: 'Verified', name_qu: 'Churasqa', name_ay: 'Chiqatayaña', sort: 2 },
  { code: 'rejected', name_es: 'No validado', name_en: 'Not validated', name_qu: 'Man churallanqa', name_ay: 'Jan chiqatayaqti', sort: 3 },
];

// fich(k, es, en) — claves de campo traducidas por la interfaz (field.<k>)
const f = (k, es, en) => ({ k, es, en });
const e = (k, es, en) => ({ k, es, en });

const FLORA = [
  {
    slug: 'molle', name: { es: 'Molle', en: 'Pepper tree', qu: 'Mulli', ay: 'Mulli' }, alias: 'Mulli, molle verde',
    scientific: 'Schinus molle L.', family: 'Anacardiaceae', status: 'referida', image: 'molle.jpg',
    credit: { author: 'Franz Xaver', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Schinus_molle.jpg' },
    fields: [
      f('origen', 'Nativa de las regiones templadas y subtropicales de Sudamérica (Bolivia, Argentina, Chile, Perú).', 'Native to the temperate and subtropical regions of South America (Bolivia, Argentina, Chile, Peru).'),
      f('distribucion', 'Ampliamente cultivada como ornamental en valles y ciudades de Bolivia; espontánea en zonas secas. En el proyecto: referida por el documento de la Avenida Ecológica de Chabám.', 'Widely grown as an ornamental in Bolivian valleys and cities; spontaneous in dry areas. In the project: referenced by the Avenida Ecológica de Chabám document.'),
      f('morfologia', 'Árbol perenne de 5 a 15 m, copa redonda y abierta, corteza gris fisurada y látex aromático; frutos globulares rosados.', 'A perennial tree 5 to 15 m tall with a rounded open crown, fissured grey bark and aromatic latex; globe-shaped pink fruits.'),
      f('crecimiento', 'Crecimiento rápido; caducifolio o semicaducifolio según la sequía; tolerante a sequía y suelos pobres.', 'Fast growth; deciduous or semi-deciduous depending on drought; tolerant of drought and poor soils.'),
      f('hojas', 'Imparipinnadas, con 3 a 9 pares de folíolos lanceolados, dentados y muy aromáticos (olor a pimienta).', 'Imparipinnate leaves with 3 to 9 pairs of lance-shaped, toothed and highly aromatic leaflets (pepper-like smell).'),
      f('flores', 'Flores diminutas amarillentas o cremas reunidas en panículas axilares; la especie es dioica (plantas masculinas y femeninas separadas).', 'Tiny yellowish or cream flowers in axillary panicles; the species is dioecious (separate male and female plants).'),
      f('floracion', 'Primavera y verano (octubre a marzo en el hemisferio sur).', 'Spring and summer (October to March in the Southern Hemisphere).'),
      f('fructificacion', 'Drupas globulares rosadas o verdosas en panículas, que maduran en otoño e invierno.', 'Pink or greenish globe-shaped drupes in panicles, ripening in autumn and winter.'),
      f('funcion_ecologica', 'Regula el microclima con su sombra, protege el suelo de la erosión, fija carbono y aporta refugio en zonas degradadas.', 'It regulates the microclimate with its shade, protects the soil from erosion, stores carbon and provides shelter in degraded areas.'),
      f('importancia_fauna', 'Sus frutos son consumidos por aves granívoras y sus ramas ofrecen refugio a insectos y aves.', 'Its fruits are eaten by seed-eating birds and its branches shelter insects and birds.'),
      f('aves_insectos', 'Acoge picaflores, tórtolas y otras aves; sus flores atraen insectos polinizadores.', 'It hosts hummingbirds, doves and other birds; its flowers attract pollinating insects.'),
      f('beneficios', 'Especie ornamental y de sombra, control de erosión; sus frutos secos se usan como "pimienta rosa" condimentaria y sus aceites esenciales tienen usos tradicionales.', 'Ornamental and shade species, erosion control; its dried fruits are used as culinary "pink pepper" and its essential oils have traditional uses.'),
    ],
    edu: [
      e('curiosidad', '¿Sabías que...? El olor característico de sus hojas se debe a aceites esenciales que le protegen de muchos herbívoros.', 'Did you know...? The characteristic smell of its leaves comes from essential oils that protect it from many herbivores.'),
      e('organismos', 'Organismos que se benefician: aves granívoras, tórtolas, picaflores e insectos polinizadores.', 'Organisms that benefit: seed-eating birds, doves, hummingbirds and pollinating insects.'),
      e('importancia_conservacion', 'Importancia de su conservación: es un árbol clave para la recuperación ecológica y la adaptación climática de los valles cochabambinos.', 'Importance of its conservation: it is a key tree for ecological recovery and climate adaptation in the Cochabamba valleys.'),
    ],
    sources: { es: 'Plants of the World Online (Jardín Botánico de Kew) — Schinus molle; GBIF. Ficha propuesta por el documento del proyecto BIOSMART QR.', en: 'Plants of the World Online (Royal Botanic Gardens, Kew) — Schinus molle; GBIF. Profile proposed by the BIOSMART QR project document.' },
    note: { es: 'Especie propuesta por el proyecto. Confirmar su presencia concreta en la Avenida Ecológica con registro fotográfico en campo.', en: 'Species proposed by the project. Confirm its presence along the Avenida Ecológica with field photographic records.' },
  },
  {
    slug: 'chilijchi', name: { es: 'Chilijchi', en: 'Erythrina / ceibo', qu: 'Chilijchi', ay: 'Chilijchi' }, alias: 'Ceibo, coral, chilichi',
    scientific: 'Erythrina falcata Benth.', family: 'Fabaceae (Faboideae)', status: 'referida', image: 'chilijchi.jpg',
    credit: { author: 'Penarc', license: 'CC BY 3.0', source: 'https://commons.wikimedia.org/wiki/File:Erythrina_falcata_6.jpg' },
    fields: [
      f('origen', 'Nativa de Sudamérica (Bolivia, Brasil, Argentina, Paraguay, Perú).', 'Native to South America (Bolivia, Brazil, Argentina, Paraguay, Peru).'),
      f('distribucion', 'Bosques y valles de Bolivia; emblemática en Cochabamba (Vinto, Pairumani, Villa Albina), donde se conservan ejemplares centenarios. En el proyecto: especie propuesta para la Avenida Ecológica de Chabám.', 'Forests and valleys of Bolivia; emblematic in Cochabamba (Vinto, Pairumani, Villa Albina), where centuries-old specimens are preserved. In the project: species proposed for the Avenida Ecológica de Chabám.'),
      f('morfologia', 'Árbol de 5 a 15 m de copa abierta, tronco con espinas oscuras y látex rojizo; hojas grandes trifoliadas.', 'A tree 5 to 15 m tall with an open crown, trunk with dark thorns and reddish latex; large trifoliate leaves.'),
      f('crecimiento', 'Crecimiento rápido; caducifolio durante la temporada seca; leguminosa con nódulos radicales que fijan nitrógeno en el suelo.', 'Fast growth; deciduous during the dry season; a legume with root nodules that fix nitrogen in the soil.'),
      f('hojas', 'Trifoliadas (tres folíolos ovado-rómbicos) que caen en invierno, justo antes de la floración.', 'Trifoliate (three ovate-rhombic leaflets) that fall in winter, just before flowering.'),
      f('flores', 'Vistosas flores rojo coral en racimos densos, tubulares y ricas en néctar; florecen sin hojas y son polinizadas por aves.', 'Showy coral-red flowers in dense, tubular, nectar-rich clusters; they bloom leafless and are pollinated by birds.'),
      f('floracion', 'Temporada seca y comienzo de la primavera (entre agosto y noviembre en Cochabamba).', 'Dry season and beginning of spring (between August and November in Cochabamba).'),
      f('fructificacion', 'Legumbres negras que contienen semillas rojas duras; las semillas crudas son tóxicas.', 'Black pods containing hard red seeds; the raw seeds are toxic.'),
      f('funcion_ecologica', 'Fija nitrógeno y mejora la fertilidad del suelo; su copa ofrece sombra, refugio y alimento a la fauna.', 'It fixes nitrogen and improves soil fertility; its crown provides shade, shelter and food for wildlife.'),
      f('importancia_fauna', 'Sus flores ricas en néctar alimentan a colibríes e insectos; su copa es refugio y zona de descanso para aves.', 'Its nectar-rich flowers feed hummingbirds and insects; its crown is a shelter and resting place for birds.'),
      f('aves_insectos', 'Relación directa con colibríes (polinización) y con abejas y mariposas que visitan las flores.', 'Direct relationship with hummingbirds (pollination) and with bees and butterflies that visit the flowers.'),
      f('beneficios', 'Especie ornamental emblemática, madera ligera, sombra, fijación de nitrógeno y flores utilizadas en la gastronomía local (ají de chilichi).', 'Emblematic ornamental species, light wood, shade, nitrogen fixation and flowers used in local gastronomy (ají de chilichi).'),
    ],
    edu: [
      e('curiosidad', '¿Sabías que...? En Cochabamba sus flores se consumen en el tradicional "ají de chilichi", y en Vinto y Pairumani hay chilijchis centenarios declarados patrimonio natural y cultural.', 'Did you know...? In Cochabamba its flowers are eaten in the traditional "ají de chilichi", and in Vinto and Pairumani there are centuries-old chilijchi trees declared natural and cultural heritage.'),
      e('organismos', 'Organismos que se benefician: colibríes, abejas, mariposas y aves que anidan en su copa.', 'Organisms that benefit: hummingbirds, bees, butterflies and birds that nest in its crown.'),
      e('importancia_conservacion', 'Importancia de su conservación: proteger los ejemplares adultos y promover semilleros mantiene el patrimonio genético y cultural de Cochabamba.', 'Importance of its conservation: protecting adult specimens and promoting seedbeds maintains Cochabamba\'s genetic and cultural heritage.'),
    ],
    sources: { es: 'Gobierno Autónomo Municipal de Vinto — "El chilijchi, patrimonio natural, cultural y gastronómico" (Lic. Félix Quispe Calle); Fundación Patiño (Pairumani); Plants of the World Online (Kew) — Erythrina falcata.', en: 'Autonomous Municipal Government of Vinto — "El chilijchi, natural, cultural and gastronomic heritage" (Lic. Félix Quispe Calle); Patiño Foundation (Pairumani); Plants of the World Online (Kew) — Erythrina falcata.' },
    note: { es: 'El nombre local "chilijchi" designa al ceibo. Confirmar en campo que los ejemplares de Chabám correspondan a Erythrina falcata antes de dar la ficha por definitiva.', en: 'The local name "chilijchi" refers to the ceibo tree. Confirm in the field that the Chabám specimens correspond to Erythrina falcata before considering this profile definitive.' },
  },
  {
    slug: 'tamar', name: { es: 'Tamar (tamarisco)', en: 'Tamarisk', qu: 'Tamar', ay: 'Tamar' }, alias: 'Tamarisco, taray',
    scientific: 'Tamarix spp. (familia Tamaricaceae)', family: 'Tamaricaceae', status: 'pendiente', image: 'tamar.jpg',
    credit: { author: 'Wikimedia Commons', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Tamarix-pentandra-flowers.JPG' },
    fields: [
      f('origen', 'Eurasia y norte de África; introducida en América con fines ornamentales y de control de erosión.', 'Eurasia and North Africa; introduced to America for ornamental and erosion-control purposes.'),
      f('distribucion', 'Cultivada en avenidas, parques y riberas; naturalizada en algunas zonas de América. En Argentina está citada como especie exótica invasora. En el proyecto: presencia en Chabám sin confirmar.', 'Grown along avenues, parks and riverbanks; naturalized in some areas of America. In Argentina it is listed as an exotic invasive species. In the project: presence in Chabám unconfirmed.'),
      f('morfologia', 'Arbusto o árbol pequeño de 2 a 8 m, con ramillas finas flexibles y un follaje delicado tipo escama.', 'A shrub or small tree 2 to 8 m tall, with fine flexible branchlets and delicate scale-like foliage.'),
      f('crecimiento', 'Crecimiento rápido con sistema radicular profundo; muy tolerante a sequía y salinidad (halófita).', 'Fast growth with a deep root system; very tolerant of drought and salinity (a halophyte).'),
      f('hojas', 'Hojas diminutas, escamosas y superpuestas, de color glauco; recuerdan a acículas finas.', 'Tiny, scaly, overlapping bluish-green leaves; they resemble fine needles.'),
      f('flores', 'Racimos espigados terminales de flores minúsculas, rosadas o blancas, muy vistosos en conjunto.', 'Terminal spike-like clusters of tiny pink or white flowers, very showy together.'),
      f('floracion', 'Primavera y verano.', 'Spring and summer.'),
      f('fructificacion', 'Cápsulas diminutas con numerosas semillas muy ligeras, dispersadas por el viento y el agua.', 'Tiny capsules with numerous very light seeds, dispersed by wind and water.'),
      f('funcion_ecologica', 'Estabiliza suelos y riberas y aporta sombra; su floración temprana alimenta a insectos polinizadores. Como especie introducida, su uso en restauración debe evaluarse para no arriesgar invasión.', 'It stabilises soils and riverbanks and provides shade; its early flowering feeds pollinating insects. As an introduced species, its use in restoration should be assessed to avoid invasion risk.'),
      f('importancia_fauna', 'Polen y néctar para abejas y otros polinizadores; refugio en arbustales densos.', 'Pollen and nectar for bees and other pollinators; shelter in dense shrubs.'),
      f('aves_insectos', 'Su floración ofrece recursos a polinizadores; no se documenta relación específica con aves locales.', 'Its flowering offers resources to pollinators; no specific relationship with local birds is documented.'),
      f('beneficios', 'Cortinas rompevientos, valor ornamental y control de erosión en suelos degradados y salinos.', 'Windbreak screens, ornamental value and erosion control on degraded and saline soils.'),
    ],
    edu: [
      e('curiosidad', '¿Sabías que...? La identificación de las especies de Tamarix es difícil incluso para especialistas, por lo que la ficha se publica a nivel de género.', 'Did you know...? Identifying Tamarix species is difficult even for specialists, which is why this profile is published at genus level.'),
      e('organismos', 'Organismos que se benefician: abejas, mariposas y otros insectos polinizadores de floración temprana.', 'Organisms that benefit: bees, butterflies and other early-flowering pollinating insects.'),
      e('importancia_conservacion', 'Importancia de su conservación: al ser una planta introducida, la restauración ecológica debe priorizar siempre especies nativas como la tara o el molle.', 'Importance of its conservation: as an introduced plant, ecological restoration should always prioritise native species such as tara or molle.'),
    ],
    sources: { es: 'Argentina.gob.ar — Proyecto Tamarisco (exótica invasora); arbolapp (dificultad de identificación en Tamarix); literatura de Tamaricaceae.', en: 'Argentina.gob.ar — Tamarisk Project (exotic invasive); arbolapp (identification difficulty in Tamarix); Tamaricaceae literature.' },
    note: { es: 'POR VERIFICAR: el nombre local "tamar" puede referirse tanto al tamarisco (Tamarix, introducido) como a la tara nativa (Caesalpinia spinosa). Confirmar con la comunidad qué árbol se denomina "tamar" en Chabám y verificar la presencia antes de dar la ficha por definitiva.', en: 'TO BE VERIFIED: the local name "tamar" may refer either to the tamarisk (Tamarix, introduced) or to the native tara (Caesalpinia spinosa). Confirm with the community which tree is called "tamar" in Chabám and verify presence before considering this profile definitive.' },
  },
];

const FAUNA = [
  {
    slug: 'picaflor', name: { es: 'Picaflor (colibrí)', en: 'Hummingbird', qu: 'Qenti', ay: 'Kenko' }, alias: 'Colibrí, qenti',
    scientific: 'Familia Trochilidae', family: 'Trochilidae', category: 'Aves', pollinator: 1, status: 'referida', image: 'picaflor.jpg',
    credit: { author: 'The Lilac Breasted Roller', license: 'CC BY 2.0', source: 'https://commons.wikimedia.org/wiki/File:Colibri_coruscans.jpg' },
    fields: [
      f('grupo', 'Ave (orden Apodiformes, familia Trochilidae).', 'Bird (order Apodiformes, family Trochilidae).'),
      f('caracteristicas', 'De 8 a 20 cm según la especie, con pico largo y fino, cuerpo esbelto y plumaje iridiscente que cambia con la luz. Sus alas baten a gran velocidad y es el único grupo de aves capaz de volar hacia atrás.', 'From 8 to 20 cm depending on the species, with a long thin bill, slim body and iridescent plumage that changes with the light. Their wings beat very fast and it is the only bird group able to fly backwards.'),
      f('alimentacion', 'Néctar de flores (rico en azúcares) complementado con pequeños artrópodos para obtener proteína.', 'Floral nectar (sugar-rich) supplemented with small arthropods for protein.'),
      f('habitad', 'Jardines, matorrales, bosques ribereños y áreas arboladas del valle de Cochabamba.', 'Gardens, shrublands, riparian forests and wooded areas of the Cochabamba valley.'),
      f('distribucion', 'Familia con más de 360 especies distribuidas por América. Los Andes bolivianos albergan gran diversidad; Colibri coruscans es común en la región de Cochabamba.', 'A family with more than 360 species distributed across the Americas. The Bolivian Andes hold great diversity; Colibri coruscans is common in the Cochabamba region.'),
      f('comportamiento', 'Territorial y activo durante el día; se alimenta en vuelo suspendido, rara vez se posa y defiende sus fuentes de néctar.', 'Territorial and active by day; feeds in hovering flight, rarely perches and defends its nectar sources.'),
      f('reproduccion', 'Construye un nido diminuto con musgos y telarañas, donde pone dos huevos muy pequeños; incubación de aproximadamente dos semanas.', 'It builds a tiny nest with moss and spider silk, where it lays two very small eggs; incubation of about two weeks.'),
      f('funcion_ecologica', 'Polinizador especializado de plantas con flores tubulares: al beber néctar transporta polen entre flores.', 'Specialised pollinator of plants with tubular flowers: while drinking nectar it carries pollen between flowers.'),
      f('interaccion', 'Interactúa con molles, chilijchis (ceibos) y otras flores ricas en néctar; compite entre individuos por las mejores fuentes.', 'It interacts with molle trees, chilijchi (ceibo) and other nectar-rich flowers; individuals compete over the best sources.'),
      f('estado_conservacion', 'Sin amenazas globales graves para la familia (muchas especies: Preocupación Menor, UICN); sensibles al uso de pesticidas y a la pérdida de floración.', 'No severe global threats for the family (many species: Least Concern, IUCN); sensitive to pesticide use and loss of flowering plants.'),
      f('plantas_asociadas', 'Flora nativa con flores tubulares: molle, chilijchi (ceibo) y arbustos floridos del valle.', 'Native flora with tubular flowers: molle, chilijchi (ceibo) and flowering shrubs of the valley.'),
      f('proteccion', 'Plantar especies nativas con floración continua, evitar pesticidas y dejar fuentes de agua limpia.', 'Plant native species with continuous flowering, avoid pesticides and leave sources of clean water.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerlo: vuelo sumamente rápido con vuelo suspendido frente a las flores, pico largo y plumaje que brilla con colores metálicos.', 'How to recognise it: extremely fast flight with hovering in front of flowers, long bill and plumage shining with metallic colours.'),
      e('curiosidad', '¿Sabías que...? Es el único grupo de aves que puede volar hacia atrás y mantenerse quieto en el aire.', 'Did you know...? It is the only group of birds that can fly backwards and stay motionless in the air.'),
      e('organismos', 'Organismos que se benefician: plantas con flores tubulares que dependen de su polinización.', 'Organisms that benefit: plants with tubular flowers that depend on their pollination.'),
      e('como_proteger', 'Cómo protegerlo: siembra de nativas, prohibición de pesticidas y respeto a los nidos.', 'How to protect it: sow native plants, ban pesticides and respect nests.'),
      e('importancia_conservacion', 'Importancia de su conservación: sin sus polinizadores se reduce la reproducción de muchas plantas nativas.', 'Importance of its conservation: without these pollinators many native plants reproduce less.'),
    ],
    sources: { es: 'Documento del proyecto BIOSMART QR; ornología andina; GBIF (Trochilidae).', en: 'BIOSMART QR project document; Andean ornithology; GBIF (Trochilidae).' },
    note: { es: 'La ficha describe a toda la familia Trochilidae. La especie concreta observada en Chabám debe confirmarse con registro fotográfico.', en: 'This profile describes the whole Trochilidae family. The specific species observed in Chabám must be confirmed with a photographic record.' },
  },
  {
    slug: 'tortola', name: { es: 'Tórtola (zenaida)', en: 'Eared dove', qu: 'Tortola', ay: 'Tortola' }, alias: 'Zenaida torcaza, tórtola orejuda',
    scientific: 'Zenaida auriculata', family: 'Columbidae', category: 'Aves', pollinator: 0, status: 'potencial', image: 'tortola.jpg',
    credit: { author: 'Cláudio Dias Timm', license: 'CC BY-SA 2.0', source: 'https://commons.wikimedia.org/wiki/File:Zenaida_auriculata_-Sao_Lourenco_do_Sul,_Rio_Grande_do_Sul,_Brazil-8.jpg' },
    fields: [
      f('grupo', 'Ave (orden Columbiformes, familia Columbidae).', 'Bird (order Columbiformes, family Columbidae).'),
      f('caracteristicas', 'De 22 a 28 cm, de tonos pardos con manchas negras en las alas, línea auricular negra y una mancha iridiscente color vino en el cuello.', 'From 22 to 28 cm, brownish with black wing spots, a black ear line and a wine-coloured iridescent patch on the neck.'),
      f('alimentacion', 'Principalmente granívora: semillas de gramíneas y cultivos, además de brotes.', 'Mainly granivorous: seeds of grasses and crops, plus shoots.'),
      f('habitad', 'Campos abiertos, arboledas y zonas urbanas; se ha adaptado muy bien a las ciudades.', 'Open fields, groves and urban areas; it has adapted very well to cities.'),
      f('distribucion', 'Ampliamente distribuida en toda Sudamérica.', 'Widely distributed across South America.'),
      f('comportamiento', 'Ave gregaria y de vuelo veloz; se alimenta en el suelo, a menudo en grupos.', 'A gregarious, fast-flying bird; it feeds on the ground, often in groups.'),
      f('reproduccion', 'Pone dos huevos blancos; incubación de 12 a 16 días con ambos progenitores participando.', 'It lays two white eggs; incubation of 12 to 16 days with both parents participating.'),
      f('funcion_ecologica', 'Dispersora de semillas y presa natural de aves rapaces urbanas (por ejemplo, el halcón peregrino).', 'Seed disperser and natural prey of urban birds of prey (for example the peregrine falcon).'),
      f('interaccion', 'Comparte hábitat con la paloma doméstica; suele posarse en plazas y áreas verdes.', 'It shares habitat with the rock dove; it often settles in squares and green areas.'),
      f('estado_conservacion', 'Preocupación Menor (UICN). Amenazas locales: caza y captura.', 'Least Concern (IUCN). Local threats: hunting and capture.'),
      f('plantas_asociadas', 'Gramíneas y plantas herbáceas delos bordes de las áreas verdes.', 'Grasses and herbaceous plants along the edges of green areas.'),
      f('proteccion', 'Evitar su captura y respetar los nidos en arbustos y ramas bajas.', 'Avoid capturing it and respect nests in shrubs and low branches.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: paloma pequeña de vuelo rápido, pardo grisácea, con manchas negras en las alas y una línea oscura detrás del ojo.', 'How to recognise it: a small, fast-flying dove, greyish-brown, with black spots on the wings and a dark line behind the eye.'),
      e('curiosidad', '¿Sabías que...? Aunque es de campo, se ha vuelto tan urbana que anida en plazas y parques de toda Sudamérica.', 'Did you know...? Although a countryside bird, it has become so urban that it nests in squares and parks across South America.'),
      e('organismos', 'Organismos que se relacionan: halcones y otras rapaces que se alimentan de ella.', 'Organisms that interact: falcons and other raptors that feed on it.'),
      e('importancia_conservacion', 'Importancia de su conservación: es un eslabón clave en la cadena alimentaria urbana.', 'Importance of its conservation: it is a key link in the urban food chain.'),
    ],
    sources: { es: 'UICN — Lista Roja: Zenaida auriculata (Preocupación Menor); Birds of the World (Cornell Lab).', en: 'IUCN Red List: Zenaida auriculata (Least Concern); Birds of the World (Cornell Lab).' },
    note: { es: 'Presencia potencial en la zona (especie muy extendida y urbana en Sudamérica). Confirmar con avistamiento local.', en: 'Potential presence in the area (a widespread, urban species in South America). Confirm with a local sighting.' },
  },
  {
    slug: 'paloma', name: { es: 'Paloma (roquera)', en: 'Rock dove', qu: 'Paluma', ay: 'Paluma' }, alias: 'Paloma doméstica, paloma bravía',
    scientific: 'Columba livia', family: 'Columbidae', category: 'Aves', pollinator: 0, status: 'potencial', image: 'paloma.jpg',
    credit: { author: 'Derek Ramsey', license: 'GFDL 1.2', source: 'https://commons.wikimedia.org/wiki/File:Rock_Pigeon_Columba_livia_3264px.jpg' },
    fields: [
      f('grupo', 'Ave (orden Columbiformes, familia Columbidae).', 'Bird (order Columbiformes, family Columbidae).'),
      f('caracteristicas', 'De 29 a 37 cm, robusta, de cuello corto y plumaje gris con dos barras negras en las alas; las formas urbanas presentan gran variedad de colores.', 'From 29 to 37 cm, stocky, with a short neck and grey plumage with two black wing bars; urban forms show great colour variation.'),
      f('alimentacion', 'Granívora: granos, semillas y restos alimenticios urbanos.', 'Granivorous: grains, seeds and urban food scraps.'),
      f('habitad', 'Acantilados naturales y edificios de las ciudades (descendiente domesticada de la paloma bravía).', 'Natural cliffs and city buildings (domesticated descendant of the rock dove).'),
      f('distribucion', 'Cosmopolita: presente en prácticamente todas las ciudades del mundo, introducida por el ser humano.', 'Cosmopolitan: present in virtually all cities of the world, introduced by humans.'),
      f('comportamiento', 'Vive en bandadas; fuerte vínculo de pareja y vuelo rápido con aleteo ruidoso.', 'It lives in flocks; strong pair bonds and fast flight with noisy wingbeats.'),
      f('reproduccion', 'Construye un raquítico nido de ramitas; pone dos huevos blancos con incubación de unos 17 a 19 días.', 'It builds a flimsy twig nest; lays two white eggs with incubation of about 17 to 19 days.'),
      f('funcion_ecologica', 'Presas de halcones peregrinos y otras rapaces urbanas; recicladora de restos orgánicos.', 'Prey of peregrine falcons and other urban raptors; recycler of organic scraps.'),
      f('interaccion', 'Comparte áreas verdes con tórtolas y palomas; competencia limitada por sitios de anidación.', 'It shares green areas with doves; limited competition for nesting sites.'),
      f('estado_conservacion', 'Preocupación Menor (UICN) como especie; las poblaciones urbanas son muy abundantes.', 'Least Concern (IUCN) as a species; urban populations are very abundant.'),
      f('plantas_asociadas', 'Gramíneas y cultivos; no depende de flora nativa específica.', 'Grasses and crops; it does not depend on specific native flora.'),
      f('proteccion', 'Evitar el cebado excesivo con pan (malnutrition), mantener limpios los palomares y respetar los nidos.', 'Avoid excessive bread feeding (poor nutrition), keep dovecotes clean and respect nests.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: paloma gris grande de actitud segura en el suelo, con dos bandas negras en las alas.', 'How to recognise it: a large grey dove with a confident ground posture and two black bars on the wings.'),
      e('curiosidad', '¿Sabías que...? Los halcones peregrinos de muchas ciudades cazan casi exclusivamente palomas urbanas.', 'Did you know...? Peregrine falcons in many cities hunt almost exclusively urban pigeons.'),
      e('como_proteger', 'Cómo protegerla: no alimentar con pan, ofrecer agua limpia y evitar capturar ejemplares.', 'How to protect it: do not feed with bread, provide clean water and avoid capturing individuals.'),
    ],
    sources: { es: 'UICN — Lista Roja: Columba livia (Preocupación Menor); literatura de ornitología urbana.', en: 'IUCN Red List: Columba livia (Least Concern); urban ornithology literature.' },
    note: { es: 'Presencia potencial: especie urbana abundante en todo el mundo. Confirmar con avistamiento local.', en: 'Potential presence: abundant urban species worldwide. Confirm with a local sighting.' },
  },
  {
    slug: 'mariposa-moneda', name: { es: 'Mariposa moneda', en: 'Blue butterfly (lycaenid)', qu: 'Pillpu pillpu', ay: 'Phillphillu' }, alias: 'Licénida, mariposa azul',
    scientific: 'Familia Lycaenidae', family: 'Lycaenidae', category: 'Mariposas', pollinator: 1, status: 'potencial', image: 'mariposa.jpg',
    credit: { author: 'Luc Viatour', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Butterfly_Luc_Viatour.JPG' },
    fields: [
      f('grupo', 'Insecto (orden Lepidoptera, familia Lycaenidae).', 'Insect (order Lepidoptera, family Lycaenidae).'),
      f('caracteristicas', 'Mariposas pequeñas de 2 a 3 cm; el dorso suele ser azul pálido o violáceo y el envés lleva pequeñas manchas plateadas que recuerdan a moneditas.', 'Small butterflies, 2 to 3 cm; the back is usually pale blue or violet and the underside bears small silvery spots resembling little coins.'),
      f('alimentacion', 'Adultos: néctar de flores pequeñas. Larvas: hojas de leguminosas y otras plantas hospederas.', 'Adults: nectar from small flowers. Larvae: leaves of legumes and other host plants.'),
      f('habitad', 'Praderas soleadas, jardines, bordes de caminos y áreas verdes abiertas.', 'Sunny meadows, gardens, roadsides and open green areas.'),
      f('distribucion', 'Familia cosmopolita con más de 6.000 especies; presente en todos los continentes excepto la Antártida.', 'Cosmopolitan family with more than 6,000 species; present on every continent except Antarctica.'),
      f('comportamiento', 'Vuelo bajo y errático; los machos defienden territorios soleados donde se posan en el suelo.', 'Low, erratic flight; males defend sunny territories where they settle on the ground.'),
      f('reproduccion', 'Ponen huevos sobre plantas hospederas; algunas larvas mantienen relaciones simbióticas con hormigas.', 'They lay eggs on host plants; some larvae keep symbiotic relationships with ants.'),
      f('funcion_ecologica', 'Polinizadora secundaria de flores pequeñas y presa de insectívoros (aves, arañas).', 'Secondary pollinator of small flowers and prey for insectivores (birds, spiders).'),
      f('interaccion', 'Relación con hormigas (algunas larvas reciben protección) y con las leguminosas que las alimentan.', 'Relationship with ants (some larvae receive protection) and with the legumes that feed them.'),
      f('estado_conservacion', 'Sin evaluación específica: requiere confirmación taxonómica local. Su presencia indica áreas verdes sanas.', 'Not specifically assessed: local taxonomic confirmation is required. Its presence indicates healthy green areas.'),
      f('plantas_asociadas', 'Leguminosas herbáceas nativas y flores bajas de las praderas.', 'Native herbaceous legumes and low meadow flowers.'),
      f('proteccion', 'Mantener flores nativas, reducir pesticidas y dejar zonas de hierba sin cortar.', 'Keep native flowers, reduce pesticides and leave uncut grass areas.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: mariposa muy pequeña de vuelo bajo, azulada por arriba y con pequeñas lunares plateados por abajo.', 'How to recognise it: a very small butterfly with low flight, bluish above with small silvery spots below.'),
      e('curiosidad', '¿Sabías que...? Algunas licénidas tienen orugas que "ordeñan" a las hormigas con secreciones dulces.', 'Did you know...? Some lycaenids have caterpillars that "milk" ants with sweet secretions.'),
      e('organismos', 'Organismos que se benefician: hormigas (simbiosis), leguminosas (polinización).', 'Organisms that benefit: ants (symbiosis), legumes (pollination).'),
      e('como_proteger', 'Cómo protegerla: sembrar flores nativas y evitar el uso de pesticidas.', 'How to protect it: sow native flowers and avoid pesticides.'),
    ],
    sources: { es: 'Entomología de polinizadores; GBIF (Lycaenidae). Identificación local pendiente.', en: 'Pollinator entomology; GBIF (Lycaenidae). Local identification pending.' },
    note: { es: 'Presencia potencial: la familia es amplia y la especie local debe confirmarse con fotografía.', en: 'Potential presence: the family is large and the local species must be confirmed with a photograph.' },
  },
  {
    slug: 'abeja-nativa', name: { es: 'Abeja nativa (sin aguijón)', en: 'Native stingless bee', qu: 'Anqa suti', ay: "Apu q'illu" }, alias: 'Melipona, abeja de miel silvestre',
    scientific: 'Tribu Meliponini', family: 'Apidae', category: 'Insectos', pollinator: 1, status: 'potencial', image: 'abeja-nativa.jpg',
    credit: { author: 'DINUKAPRABHATH', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Stingless_bee.jpg' },
    fields: [
      f('grupo', 'Insecto (orden Hymenoptera, familia Apidae, tribu Meliponini).', 'Insect (order Hymenoptera, family Apidae, tribe Meliponini).'),
      f('caracteristicas', 'Abejas pequeñas, de color oscuro, sin aguijón funcional; se distinguen de la abeja melífera por su menor tamaño y antenas más cortas.', 'Small dark bees without a functional sting; they differ from the honey bee by their smaller size and shorter antennae.'),
      f('alimentacion', 'Polen y néctar de flores nativas; almacenan miel y polen en panales cerificados dentro de sus cavidades.', 'Pollen and nectar from native flowers; they store honey and pollen in wax combs inside their cavities.'),
      f('habitad', 'Troncos huecos, muros, cavidades naturales y cajas nido; forman colonias perennes.', 'Hollow trunks, walls, natural cavities and nest boxes; they form perennial colonies.'),
      f('distribucion', 'Tribu tropical y subtropical presente en Bolivia; la meliponicultura es una tradición andina y amazónica.', 'A tropical and subtropical tribe present in Bolivia; meliponiculture is an Andean and Amazonian tradition.'),
      f('comportamiento', 'Eusociales: colonias con reina, obreras y zánganos; obreras de forrajeo diurno y manejo de la miel.', 'Eusocial: colonies with queen, workers and drones; diurnal foraging workers that manage the honey.'),
      f('reproduccion', 'La reina pone huevos en celdas del panal; las obreras cuidan larvas y construyen cerumen.', 'The queen lays eggs in comb cells; workers care for larvae and build cerumen.'),
      f('funcion_ecologica', 'Polinizadores clave de frutas, hortalizas y flora silvestre: visitan muchas flores pequeñas ignoradas por otras abejas.', 'Key pollinators of fruits, vegetables and wild flora: they visit many small flowers ignored by other bees.'),
      f('interaccion', 'Dependen de flora nativa con cavidades de anidación; compiten con la abeja melífera introducida por el alimento.', 'They depend on native flora with nesting cavities; they compete with the introduced honey bee for food.'),
      f('estado_conservacion', 'Amenazadas por pesticidas, pérdida de cavidades de anidación y competencia con especies exóticas melíferas.', 'Threatened by pesticides, loss of nesting cavities and competition with exotic honey bees.'),
      f('plantas_asociadas', 'Flora nativa con flores abiertas y leguminosas; molle y chilijchi entre sus recursos.', 'Native flora with open flowers and legumes; molle and chilijchi among their resources.'),
      f('proteccion', 'Instalar cajas nido, evitar insecticidas, sembrar flores nativas y apoyar la meliponicultura local.', 'Install nest boxes, avoid insecticides, sow native flowers and support local meliponiculture.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: abejas pequeñas y oscuras que no pican; vuelan cerca de flores y llevan polen en las patas traseras.', 'How to recognise it: small dark bees that do not sting; they fly close to flowers and carry pollen on their hind legs.'),
      e('curiosidad', '¿Sabías que...? La meliponicultura (crianza de abejas sin aguijón) es una tradición andina milenaria cuya miel se considera medicinal.', 'Did you know...? Meliponiculture (keeping stingless bees) is an ancient Andean tradition whose honey is considered medicinal.'),
      e('como_proteger', 'Cómo protegerla: cajas nido, ausencia de pesticidas y flores nativas todo el año.', 'How to protect it: nest boxes, no pesticides and native flowers all year round.'),
    ],
    sources: { es: 'Meliponicultura andina; GBIF (Meliponini). Datos de presencia local pendientes.', en: 'Andean meliponiculture; GBIF (Meliponini). Local presence data pending.' },
    note: { es: 'Presencia potencial en la zona. Confirmar con avistamiento o registros de meliponicultores locales.', en: 'Potential presence in the area. Confirm with sightings or records from local meliponiculturists.' },
  },
  {
    slug: 'mosca-colibri', name: { es: 'Mosca colibrí (sírfido)', en: 'Hoverfly', qu: 'Qenti phuchu', ay: 'Kenko phujwu' }, alias: 'Sírfido, mosca de las flores',
    scientific: 'Familia Syrphidae', family: 'Syrphidae', category: 'Insectos', pollinator: 1, status: 'potencial', image: 'mosca-colibri.jpg',
    credit: { author: 'User:Fir0002', license: 'GFDL 1.2', source: 'https://commons.wikimedia.org/wiki/File:Hoverflies_mating_midair.jpg' },
    fields: [
      f('grupo', 'Insecto (orden Diptera, familia Syrphidae).', 'Insect (order Diptera, family Syrphidae).'),
      f('caracteristicas', 'Dos alas (como todas las moscas) y colores de abeja o avispa con los que engañan a sus depredadores; se quedan suspendidas en el aire como un colibrí.', 'Two wings (like all flies) and bee or wasp colours with which they fool predators; they hover in the air like a hummingbird.'),
      f('alimentacion', 'Adultos: néctar y polen. Muchas larvas son depredadoras de pulgones.', 'Adults: nectar and pollen. Many larvae are aphid predators.'),
      f('habitad', 'Jardines, praderas y áreas con flores; adultos frecuentes todo el día.', 'Gardens, meadows and flowery areas; adults are frequent throughout the day.'),
      f('distribucion', 'Familia cosmopolita con más de 6.000 especies descritas.', 'Cosmopolitan family with more than 6,000 described species.'),
      f('comportamiento', 'Vuelan con precisión y se posan con las alas plegadas; imitan el zumbido de las abejas.', 'They fly with precision and land with wings folded; they imitate the buzz of bees.'),
      f('reproduccion', 'Ponen huevos cerca de colonias de pulgones, donde se alimentan las larvas.', 'They lay eggs near aphid colonies, where the larvae feed.'),
      f('funcion_ecologica', 'Polinizadores secundarios muy eficaces; sus larvas controlan plagas de pulgones.', 'Highly effective secondary pollinators; their larvae control aphid pests.'),
      f('interaccion', 'Visitan las mismas flores que abejas y mariposas; sus larvas se relacionan con pulgones y hormigas.', 'They visit the same flowers as bees and butterflies; their larvae interact with aphids and ants.'),
      f('estado_conservacion', 'Sin evaluación específica; su abundancia está ligada a la disponibilidad de flores y ausencia de pesticidas.', 'Not specifically assessed; their abundance is linked to flower availability and absence of pesticides.'),
      f('plantas_asociadas', 'Flores abiertas del valle: visitan muchas especies nativas y cultivadas.', 'Open flowers of the valley: they visit many native and cultivated species.'),
      f('proteccion', 'Dejar pulgones bajo control biológico natural y evitar insecticidas que las eliminan junto con las plagas.', 'Let aphids be controlled naturally and avoid insecticides that kill hoverflies along with the pests.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: tamaño de mosca, banda amarilla y negra imitando abejas, y habilidad para quedarse quieta en el aire.', 'How to recognise it: fly-sized, yellow and black stripes imitating bees, and the ability to stay motionless in the air.'),
      e('curiosidad', '¿Sabías que...? A diferencia de las abejas, no pican; son insectos totalmente inofensivos para las personas.', 'Did you know...? Unlike bees, they do not sting; they are completely harmless to people.'),
      e('como_proteger', 'Cómo protegerla: evitar insecticidas y mantener flores continuas en el jardín.', 'How to protect it: avoid insecticides and keep continuous flowers in the garden.'),
    ],
    sources: { es: 'Entomología de polinizadores; GBIF (Syrphidae).', en: 'Pollinator entomology; GBIF (Syrphidae).' },
    note: { es: 'Presencia potencial. Es frecuente en jardines con flores de toda la región.', en: 'Potential presence. It is frequent in flowery gardens across the region.' },
  },
  {
    slug: 'abeja-melifera', name: { es: 'Abeja melífera (introducida)', en: 'Western honey bee', qu: 'Suti anqa', ay: "Suti q'illu" }, alias: 'Abeja de la miel',
    scientific: 'Apis mellifera', family: 'Apidae', category: 'Insectos', pollinator: 1, status: 'potencial', image: 'abeja-melifera.jpg',
    credit: { author: 'Luc Viatour', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Apis_mellifera_2_Luc_Viatour.JPG' },
    fields: [
      f('grupo', 'Insecto (orden Hymenoptera, familia Apidae).', 'Insect (order Hymenoptera, family Apidae).'),
      f('caracteristicas', 'Abeja de 12 a 15 mm, peluda, con bandas anaranjadas y negras; aguijón defensivo presente solo en obreras.', 'A bee 12 to 15 mm long, hairy, with orange and black bands; a defensive sting present only in workers.'),
      f('alimentacion', 'Néctar y polen de flores; almacenan miel como reserva energética de la colonia.', 'Nectar and pollen from flowers; they store honey as the colony\'s energy reserve.'),
      f('habitad', 'Colmenas de apicultores y cavidades naturales; ampliamente introducida por el ser humano.', 'Beekeeper hives and natural cavities; widely introduced by humans.'),
      f('distribucion', 'Originaria de África, Europa y Asia; introducida en toda América para la apicultura.', 'Native to Africa, Europe and Asia; introduced across the Americas for beekeeping.'),
      f('comportamiento', 'Eusocial: reina, obreras y zánganos; baños de orientación, danza de las abejas y termorregulación del panal.', 'Eusocial: queen, workers and drones; orientation flights, waggle dance and hive thermoregulation.'),
      f('reproduccion', 'La reina pone miles de huevos; en enjambres la colonia se divide con una nueva reina.', 'The queen lays thousands of eggs; in swarms the colony divides with a new queen.'),
      f('funcion_ecologica', 'Polinizadora principal de cultivos y de muchas flores; en el proyecto ayuda a la fructificación de especies plantadas.', 'Main pollinator of crops and many flowers; in the project it helps the fruiting of planted species.'),
      f('interaccion', 'Puede competir con las abejas nativas por el néctar si las poblaciones son muy densas.', 'It can compete with native bees for nectar if populations are very dense.'),
      f('estado_conservacion', 'Especie no amenazada a nivel global; sus poblaciones sufren pérdidas por plagas (ácaro Varroa) y pesticidas.', 'Not globally threatened; its populations suffer losses from pests (Varroa mite) and pesticides.'),
      f('plantas_asociadas', 'Visita gran variedad de flora: chilijchi, molle y cultivos del valle.', 'It visits a wide flora: chilijchi, molle and valley crops.'),
      f('proteccion', 'Apicultura responsable, colmenares sanos y distanciamiento de colmenares de las zonas de abejas nativas.', 'Responsible beekeeping, healthy apiaries and distancing hives from native bee areas.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: abeja peluda de tamaño mediano con bandas anaranjadas; la más conocida del mundo.', 'How to recognise it: a medium-sized hairy bee with orange bands; the best-known bee in the world.'),
      e('curiosidad', '¿Sabías que...? Es especie introducida en América: su miel es valiosa, pero su manejo debe cuidar a las abejas nativas.', 'Did you know...? It is an introduced species in the Americas: its honey is valuable, but its management must protect native bees.'),
      e('importancia_conservacion', 'Importancia: sin polinización de abejas se reducen las cosechas de frutas y hortalizas.', 'Importance: without bee pollination, fruit and vegetable harvests decline.'),
    ],
    sources: { es: 'Literatura de apicultura; UICN/GBIF (Apis mellifera).', en: 'Beekeeping literature; IUCN/GBIF (Apis mellifera).' },
    note: { es: 'Especie introducida y común en apicultura; presencia local muy probable pero sin registro propio todavía.', en: 'Introduced species common in beekeeping; local presence very likely but without our own record yet.' },
  },
  {
    slug: 'lagartija', name: { es: 'Lagartija', en: 'Lizard', qu: 'Kuru', ay: 'Kuru' }, alias: 'Lagarto, lagartija de lava',
    scientific: 'Familia Tropiduridae (Tropidurus / Stenocercus)', family: 'Tropiduridae', category: 'Reptiles', pollinator: 0, status: 'potencial', image: 'lagartija.jpg',
    credit: { author: 'Peterwchen', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Tropidurus_catalanensis-basking.jpg' },
    fields: [
      f('grupo', 'Reptil (orden Squamata, familias Tropiduridae o similares).', 'Reptile (order Squamata, families Tropiduridae or similar).'),
      f('caracteristicas', 'De 10 a 25 cm incluida la cola, cuerpo cubierto de escamas y cola larga; los ejemplares toman el sol sobre piedras y muros.', 'From 10 to 25 cm including the tail, body covered in scales and a long tail; individuals bask on stones and walls.'),
      f('alimentacion', 'Insectívora: hormigas, escarabajos, moscas y otros invertebrados del suelo.', 'Insectivorous: ants, beetles, flies and other ground invertebrates.'),
      f('habitad', 'Muros, rocas, troncos y vegetación baja de áreas soleadas.', 'Walls, rocks, trunks and low vegetation of sunny areas.'),
      f('distribucion', 'Los géneros Tropidurus y Stenocercus son comunes en Bolivia; la especie local está por confirmar.', 'The genera Tropidurus and Stenocercus are common in Bolivia; the local species is to be confirmed.'),
      f('comportamiento', 'Helioterma (se calienta al sol), territorial y de respuesta rápida ante depredadores.', 'Heliothermic (warms up in the sun), territorial and quick to respond to predators.'),
      f('reproduccion', 'Pone huevos en huecos del suelo o bajo piedras; las crías son autónomas al nacer.', 'It lays eggs in ground hollows or under stones; hatchlings are independent at birth.'),
      f('funcion_ecologica', 'Controla poblaciones de insectos y es alimento de aves y serpientes.', 'It controls insect populations and is food for birds and snakes.'),
      f('interaccion', 'Comparte el hábitat con insectos que depreda y con aves que se alimentan de ella.', 'It shares its habitat with the insects it preys on and with birds that feed on it.'),
      f('estado_conservacion', 'Sin evaluación local; varias especies bolivianas son endémicas y vulnerables por pérdida de hábitat.', 'No local assessment; several Bolivian species are endemic and vulnerable to habitat loss.'),
      f('plantas_asociadas', 'Vegetación baja y bordes soleados del jardín de biodiversidad.', 'Low vegetation and sunny edges of the biodiversity garden.'),
      f('proteccion', 'No capturarlas, respetar muros y piedras como refugio y evitar pesticidas que le quitan su alimento.', 'Do not capture them, respect walls and stones as shelter and avoid pesticides that remove their food.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocarla: reptil pequeño y rápido que toma el sol con las patas extendidas y huye entre las piedras.', 'How to recognise it: a small, fast reptile basking with legs spread that flees between stones.'),
      e('curiosidad', '¿Sabías que...? Si le atrapan la cola, puede desprenderla para escapar y luego le vuelve a crecer.', 'Did you know...? If caught by the tail, it can drop it to escape and it later grows back.'),
      e('como_proteger', 'Cómo protegerla: dejar zonas de piedras y muros de piedra y prohibir su captura.', 'How to protect it: leave stony areas and stone walls and forbid its capture.'),
    ],
    sources: { es: 'Herpetología boliviana; GBIF (Tropidurus, Stenocercus). Especie local por confirmar.', en: 'Bolivian herpetology; GBIF (Tropidurus, Stenocercus). Local species to be confirmed.' },
    note: { es: 'El género y la especie local deben confirmarse con fotografía y revisión de un especialista; por eso la ficha se publica a nivel de familia.', en: 'The genus and local species must be confirmed with a photograph and expert review; that is why this profile is published at family level.' },
  },
  {
    slug: 'zorro-andino', name: { es: 'Zorro andino (culpeo)', en: 'Culpeo fox', qu: 'Atuq', ay: 'Atuq' }, alias: 'Culpeo, zorro colorado',
    scientific: 'Lycalopex culpaeus', family: 'Canidae', category: 'Mamíferos', pollinator: 0, status: 'potencial', image: 'zorro.jpg',
    credit: { author: 'Christian Mehlführer', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Culpeo_MC.jpg' },
    fields: [
      f('grupo', 'Mamífero (orden Carnivora, familia Canidae).', 'Mammal (order Carnivora, family Canidae).'),
      f('caracteristicas', 'Del tamaño de un perro mediano (4 a 13 kg), pelaje pardo-gris con reflejos rojizos en el lomo y cola espesa y anillada.', 'The size of a medium dog (4 to 13 kg), greyish-brown fur with reddish tints on the back and a thick ringed tail.'),
      f('alimentacion', 'Oportunista: roedores, aves, huevos, frutos y carroña.', 'Opportunistic: rodents, birds, eggs, fruit and carrion.'),
      f('habitad', 'Punas, matorrales, valles y zonas agrícolas andinas; evita las zonas más urbanizadas.', 'Puna grassland, shrublands, valleys and Andean farmland; it avoids the most urbanised areas.'),
      f('distribucion', 'Andes de Sudamérica, desde Colombia hasta Tierra del Fuego; abundante en Bolivia.', 'Andes of South America, from Colombia to Tierra del Fuego; abundant in Bolivia.'),
      f('comportamiento', 'Solitario o en pareja, más activo al amanecer y al anochecer; marca territorio con secreciones.', 'Solitary or in pairs, most active at dawn and dusk; marks territory with secretions.'),
      f('reproduccion', 'Una camada anual de 2 a 5 crías, criadas en madrigueras entre rocas.', 'One annual litter of 2 to 5 pups, raised in dens among rocks.'),
      f('funcion_ecologica', 'Regula poblaciones de roedores y dispersa semillas de frutos que consume.', 'It regulates rodent populations and disperses seeds of the fruit it eats.'),
      f('interaccion', 'Presa del puma; compite con perros asilvestrados; control natural de plagas de roedores.', 'Prey of the puma; competes with feral dogs; natural control of rodent pests.'),
      f('estado_conservacion', 'Preocupación Menor (UICN); sujeto a control por conflicto con el ganado.', 'Least Concern (IUCN); subject to control due to livestock conflict.'),
      f('plantas_asociadas', 'Matorrales y frutales del valle; relación con arbustos que le dan cobertura.', 'Shrublands and valley fruit trees; related to shrubs that give it cover.'),
      f('proteccion', 'Prohibir venenos y trampas, conservar cobertura vegetal y tolerar su presencia cerca del proyecto.', 'Ban poisons and traps, keep vegetation cover and tolerate its presence near the project.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerlo: como un perro pequeño con cola gruesa y orejas puntiagudas; se le escucha aullar al anochecer.', 'How to recognise it: like a small dog with a thick tail and pointed ears; it can be heard howling at dusk.'),
      e('curiosidad', '¿Sabías que...? Es uno de los carnívoros más extendidos de los Andes y se adapta a muchos hábitats.', 'Did you know...? It is one of the most widespread carnivores of the Andes and adapts to many habitats.'),
      e('como_proteger', 'Cómo protegerlo: evitar venenos y mantener corredores de vegetación entre áreas verdes.', 'How to protect it: avoid poisons and keep corridors of vegetation between green areas.'),
    ],
    sources: { es: 'UICN — Lista Roja: Lycalopex culpaeus (Preocupación Menor); mamíferos de los Andes.', en: 'IUCN Red List: Lycalopex culpaeus (Least Concern); mammals of the Andes.' },
    note: { es: 'Presencia potencial: los reportes cercanos deben confirmarse con evidencia (fotografía, rastro).', en: 'Potential presence: nearby reports must be confirmed with evidence (photograph, tracks).' },
  },
  {
    slug: 'comadreja', name: { es: 'Comadreja (tlalcoche)', en: 'White-eared opossum', qu: "Tlalq'uqi", ay: "Q'ala uqi" }, alias: 'Tlalcoche, tlacuache',
    scientific: 'Didelphis albiventris', family: 'Didelphidae', category: 'Mamíferos', pollinator: 0, status: 'potencial', image: 'comadreja.jpg',
    credit: { author: 'Rhalah', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Didelphis_albiventris-12-07-28.jpg' },
    fields: [
      f('grupo', 'Mamífero marsupial (orden Didelphimorphia, familia Didelphidae).', 'Marsupial mammal (order Didelphimorphia, family Didelphidae).'),
      f('caracteristicas', 'De 25 a 50 cm con cola larga y prensil, hocico largo y orejas claras; pelaje pardo con cara blanca.', 'From 25 to 50 cm with a long prehensile tail, long snout and pale ears; brown fur with a white face.'),
      f('alimentacion', 'Omnívora: frutos, insectos, huevos, pequeños vertebrados y carroña.', 'Omnivorous: fruit, insects, eggs, small vertebrates and carrion.'),
      f('habitad', 'Bosques, arbustales y periferias urbanas; nocturna y trepadora.', 'Forests, shrublands and urban fringes; nocturnal and arboreal.'),
      f('distribucion', 'América del Sur; frecuente en Bolivia, Argentina, Paraguay y Brasil.', 'South America; frequent in Bolivia, Argentina, Paraguay and Brazil.'),
      f('comportamiento', 'Nocturna y solitaria; se mueve por corredores arbóreos y muros; usa la cola prensil para trepar.', 'Nocturnal and solitary; it moves along arboreal corridors and walls; it uses its prehensile tail to climb.'),
      f('reproduccion', 'Marsupial: la cría nace muy pequeña y completa su desarrollo en la bolsa materna (hasta una docena).', 'Marsupial: the young is born very small and finishes developing in the mother\'s pouch (up to a dozen).'),
      f('funcion_ecologica', 'Controla insectos y roedores, dispersa semillas de frutos y es presa de grandes rapaces.', 'It controls insects and rodents, disperses seeds of fruits and is prey of large raptors.'),
      f('interaccion', 'Comparte el refugio nocturno con búhos y murciélagos; aprovecha frutales caídos.', 'It shares nocturnal shelter with owls and bats; it takes advantage of fallen fruit trees.'),
      f('estado_conservacion', 'Preocupación Menor (UICN); no amenazada a nivel regional.', 'Least Concern (IUCN); not threatened regionally.'),
      f('plantas_asociadas', 'Frutales y arbustos del valle; dispara semillas de muchos frutos.', 'Fruit trees and shrubs of the valley; it disperses seeds of many fruits.'),
      f('proteccion', 'No perseguirla ni quitarle sus refugios naturales; es un aliado del control de plagas.', 'Do not chase it or remove its natural shelters; it is an ally in pest control.'),
    ],
    edu: [
      e('como_reconocer', 'Cómo reconocerla: marsupial nocturno de cara blanca y cola prensil que trepa por la noche buscando frutos.', 'How to recognise it: a nocturnal marsupial with a white face and prehensile tail that climbs at night looking for fruit.'),
      e('curiosidad', '¿Sabías que...? Es un marsupial, como los canguros de Australia: sus crías maman en una bolsa.', 'Did you know...? It is a marsupial, like Australian kangaroos: its young nurse in a pouch.'),
      e('como_proteger', 'Cómo protegerla: respetar su nocturnidad, no usar pesticidas y mantener frutales en las áreas verdes.', 'How to protect it: respect its nocturnal life, do not use pesticides and keep fruit trees in green areas.'),
    ],
    sources: { es: 'UICN — Lista Roja: Didelphis albiventris (Preocupación Menor); mastozoología sudamericana.', en: 'IUCN Red List: Didelphis albiventris (Least Concern); South American mammalogy.' },
    note: { es: 'Presencia potencial en zonas periféricas con arbustos y frutales. Confirmar con registro nocturno.', en: 'Potential presence in peripheral areas with shrubs and fruit trees. Confirm with a night record.' },
  },
];

function seedSpecies(userId) {
  const all = [
    ...FLORA.map((s) => ({ ...s, kind: 'flora' })),
    ...FAUNA.map((s) => ({ ...s, kind: 'fauna' })),
  ];
  for (const s of all) {
    if (get('SELECT 1 x FROM species WHERE slug = ?', s.slug)) continue;
    run(
      `INSERT INTO species (kind, slug, name_es, name_en, name_qu, name_ay, alias_es, scientific_name, family, category,
         pollinator, status, fields_json, edu_json, sources_json, note_json, images_json, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.kind, s.slug, s.name.es, s.name.en || null, s.name.qu || null, s.name.ay || null,
      s.alias || null, s.scientific, s.family || null, s.category || null,
      s.pollinator ? 1 : 0, s.status,
      JSON.stringify(s.fields.filter((x) => x.k && x.es)),
      JSON.stringify(s.edu.filter((x) => x.k && x.es)),
      JSON.stringify(s.sources || {}), JSON.stringify(s.note || {}),
      JSON.stringify([{ file: s.image, upload: false, author: s.credit.author, license: s.credit.license, source: s.credit.source }]),
      userId ?? null);
  }
}

function seed() {
  if ((get('SELECT COUNT(*) c FROM verification_states').c) === 0) {
    for (const s of STATES) {
      run('INSERT INTO verification_states (code, name_es, name_en, name_qu, name_ay, sort) VALUES (?,?,?,?,?,?)',
        s.code, s.name_es, s.name_en, s.name_qu || null, s.name_ay || null, s.sort);
    }
  }
  if ((get('SELECT COUNT(*) c FROM zones').c) === 0) {
    for (const z of ZONES) {
      run('INSERT INTO zones (slug, name_es, name_en, name_qu, name_ay, description_es, map_x, map_y, color, sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
        z.slug, z.name_es, z.name_en, z.name_qu, z.name_ay, z.desc, z.x, z.y, z.color, z.sort);
    }
  }
  if ((get('SELECT COUNT(*) c FROM species').c) === 0) seedSpecies(null);
}

module.exports = { seed };
