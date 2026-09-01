// =========================================================================
// SEVERIDAD POST-INCENDIO EN ANPs DE MÉXICO (dNBR / RdNBR) — v2
// Reproducible: todo lo que cambia el resultado vive en CONFIG.
// Caso documentado: PN Sierra de San Pedro Mártir, incendio del 23-mar-2026
// =========================================================================

// ----------------------------- CONFIG ------------------------------------
var CONFIG = {
  // ANP (WDPA). Puedes usar NAME o WDPAID; el ID evita ambigüedad por acentos.
  anpName:        'Sierra de San Pedro Mártir',
  wdpaId:         null,                 // p. ej. 7597. Si se define, tiene prioridad sobre anpName.

  // Evento
  fireStart:      '2026-03-23',
  fireEnd:        '2026-03-30',         // control ~95% el 27-mar; margen para FIRMS

  // Ventanas de composición (fechas FIJAS: los números se pueden regenerar siempre)
  // Pre: misma temporada, antes del fuego. Post: tras liquidación, dejando pasar humo.
  // Para "extended assessment" (Key & Benson) cambia post a la misma ventana del año siguiente.
  preStart:       '2026-02-10',
  preEnd:         '2026-03-22',
  postStart:      '2026-04-05',
  postEnd:        '2026-05-10',

  // Calidad de píxel
  csThreshold:    0.60,                 // Cloud Score+ cs_cdf (0.5 laxo … 0.8 estricto)
  ndsiThreshold:  0.40,                 // máscara de nieve
  scale:          20,

  // Delimitación del perímetro
  useFirmsGuide:  true,                 // false = buscar cicatrices en toda la ANP (sin FIRMS)
  firmsBufferM:   1500,                 // zona de búsqueda alrededor de focos FIRMS
  dnbrCandidate:  0.10,                 // píxel candidato a quemado
  // Unidad mínima de mapeo. 'opening' = apertura morfológica (barata, recomendada).
  // 'connected' = connectedPixelCount exacto, pero agota la memoria en modo interactivo:
  // úsalo solo dentro de un Export, nunca con print().
  mmuMethod:      'opening',
  mmuRadiusPx:    3,                    // radio de la apertura; 3 px ≈ descarta manchas < ~1 ha
  mmuPixels:      25,                   // solo para mmuMethod 'connected' (25 px × 400 m² = 1 ha)

  // Umbrales dNBR (Key & Benson 2006). Calibrados en bosques de EE. UU.; validar localmente.
  dnbrBreaks:     [0.10, 0.27, 0.44, 0.66],
  // Umbrales RdNBR (Miller & Thode 2007, ×1000). Calibrados en Sierra Nevada, CA.
  rdnbrBreaks:    [69, 316, 641],

  // Validación (cifra oficial para comparar; fuente en el README)
  officialHa:     300,                  // CONAFOR/CONANP: ~300 ha dentro de la ANP (27-mar-2026)

  exportPrefix:   'SSPM_2026-03-23'
};

// Ejemplo alterno — incendio Cañón El Copal (jul-2026, CONANP ~80 ha):
// fireStart:'2026-06-28', fireEnd:'2026-07-15', preStart:'2026-05-20', preEnd:'2026-06-27',
// postStart:'2026-07-20', postEnd:'2026-08-25', officialHa:80, exportPrefix:'SSPM_ElCopal_2026'

// ----------------------------- 1. AOI -------------------------------------
var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons');
var anp = CONFIG.wdpaId
  ? wdpa.filter(ee.Filter.eq('WDPAID', CONFIG.wdpaId))
  : wdpa.filter(ee.Filter.eq('NAME', CONFIG.anpName));
var aoi = anp.geometry();

Map.centerObject(aoi, 11);
Map.setOptions('SATELLITE');
// Nota: el nombre exacto del campo de ID cambia entre versiones de WDPA. Se imprimen las
// propiedades de la primera entidad para localizarlo y fijarlo en CONFIG.wdpaId si hace falta.
print('ANP:', anp.first().get('NAME'), '| Polígonos:', anp.size(),
      '| Superficie ANP (ha):', aoi.area(1).divide(1e4));
print('Propiedades WDPA (para identificar el campo de ID):', anp.first().toDictionary());

// ----------------------------- 2. Sentinel-2 ------------------------------
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function prepS2(img) {
  var ref = img.select('B.*').divide(10000);
  var clear = img.select('cs_cdf').gte(CONFIG.csThreshold);
  var ndsi = ref.normalizedDifference(['B3', 'B11']);
  var snow = ndsi.gt(CONFIG.ndsiThreshold).and(ref.select('B8').gt(0.11));
  var nbr = ref.normalizedDifference(['B8', 'B12']).rename('NBR');
  return ref.addBands(nbr)
            .updateMask(clear.and(snow.not()))
            .copyProperties(img, ['system:time_start']);
}

function composite(start, end) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(start, end)
    .linkCollection(csPlus, ['cs_cdf'])
    .map(prepS2);
  print('Escenas', start, '→', end, ':', col.size());
  return col.median().clip(aoi);
}

var pre  = composite(CONFIG.preStart,  CONFIG.preEnd);
var post = composite(CONFIG.postStart, CONFIG.postEnd);

// ----------------------------- 3. Índices ---------------------------------
var nbrPre  = pre.select('NBR');
var nbrPost = post.select('NBR');
var dNBR    = nbrPre.subtract(nbrPost).rename('dNBR');
// RdNBR = dNBR / sqrt(|NBRpre|), escalado ×1000 para usar umbrales de Miller & Thode
var RdNBR   = dNBR.multiply(1000).divide(nbrPre.abs().max(0.001).sqrt()).rename('RdNBR');

function classify(img, breaks) {
  var out = ee.Image(0);
  breaks.forEach(function (b, i) { out = out.where(img.gte(b), i + 1); });
  return out.rename('clase');
}
var sevDNBR  = classify(dNBR,  CONFIG.dnbrBreaks);          // 0-4
var sevRdNBR = classify(RdNBR, CONFIG.rdnbrBreaks).add(1)   // 1-4 (sin clase "unburned" explícita)
                 .where(RdNBR.lt(CONFIG.rdnbrBreaks[0]), 0);

// ----------------------------- 4. Perímetro -------------------------------
// FIRMS (MODIS, 1 km) usado como GUÍA: solo se buscan cicatrices cerca de focos reales.
var firms = ee.ImageCollection('FIRMS')
  .filterBounds(aoi)
  .filterDate(CONFIG.fireStart, ee.Date(CONFIG.fireEnd).advance(1, 'day'))
  .select('T21');
var nFirms = firms.size();
print('Detecciones FIRMS en la ventana del evento:', nFirms);
// Si no hay imágenes FIRMS, firms.max() no tiene bandas; se usa una imagen vacía en su lugar.
var focos = ee.Image(ee.Algorithms.If(nFirms.gt(0),
  firms.max().gt(0).selfMask(),
  ee.Image(0).selfMask())).rename('foco');
// Zona de búsqueda como GEOMETRÍA: los focos (1 km) se vectorizan a baja resolución, se les
// aplica el buffer y se recortan a la ANP. Todo lo pesado (conteo de píxeles conectados,
// estadísticas, vectorización) se limita a esta geometría en lugar de a toda la ANP.
var zonaGeom = CONFIG.useFirmsGuide
  ? focos.reduceToVectors({
        geometry: aoi.buffer(CONFIG.firmsBufferM), scale: 1000,
        geometryType: 'polygon', eightConnected: true, maxPixels: 1e8
      }).geometry().buffer(CONFIG.firmsBufferM).intersection(aoi, 100)
  : aoi;
print('Zona de búsqueda (ha):', zonaGeom.area(100).divide(1e4));

// Candidatos: dNBR alto dentro de la zona de búsqueda, suavizado, con unidad mínima de mapeo
var candidato = dNBR.gte(CONFIG.dnbrCandidate)
  .clip(zonaGeom)
  .focal_mode({radius: 1, kernelType: 'square', units: 'pixels'});
// Unidad mínima de mapeo.
// 'opening': erosión seguida de dilatación. Elimina manchas más pequeñas que el elemento
// estructurante y devuelve las grandes a su tamaño original. Es una operación de vecindad
// fija, así que su costo es constante por píxel.
// 'connected': etiquetado de componentes conexos. Es exacto, pero cada píxel debe recorrer
// su región completa; sobre una cicatriz de cientos de hectáreas eso excede la memoria
// interactiva. Solo apto dentro de un Export.
var bin = candidato.unmask(0).gt(0);
var quemado;
if (CONFIG.mmuMethod === 'connected') {
  quemado = bin.selfMask()
    .connectedPixelCount({maxSize: 256, eightConnected: true})
    .gte(CONFIG.mmuPixels)
    .selfMask();
} else {
  var r = CONFIG.mmuRadiusPx;
  quemado = bin
    .focal_min({radius: r, kernelType: 'circle', units: 'pixels'})
    .focal_max({radius: r, kernelType: 'circle', units: 'pixels'})
    .selfMask();
}
quemado = quemado.rename('quemado').clip(zonaGeom);

// Vector del perímetro: SOLO se materializa en el exporte (sección 7). No se dibuja ni se
// imprime en la sesión interactiva porque la vectorización a 20 m agota la memoria.
var perimetro = quemado.reduceToVectors({
  geometry: zonaGeom,
  scale: CONFIG.scale,
  geometryType: 'polygon',
  eightConnected: true,
  labelProperty: 'quemado',
  maxPixels: 1e9
});

// ----------------------------- 4b. Diagnóstico ----------------------------
// Hectáreas que sobreviven en cada paso. El primer valor en 0 indica dónde se pierde la señal.
function ha(img, geom, scale) {
  return ee.Number(ee.Image.pixelArea().updateMask(img).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: geom, scale: scale, maxPixels: 1e9, tileScale: 4
  }).values().get(0)).divide(1e4);
}
var s5 = CONFIG.scale * 5;   // resolución gruesa para los conteos sobre toda la ANP
print('--- DIAGNÓSTICO (ha, aproximado) ---');
print('a) Píxeles con dato en dNBR (ANP):',    ha(dNBR.mask(), aoi, s5));
print('b) dNBR >= candidato en toda la ANP:',  ha(dNBR.gte(CONFIG.dnbrCandidate), aoi, s5));
print('c) Candidatos dentro de la zona:',      ha(candidato.selfMask(), zonaGeom, CONFIG.scale));
print('d) Tras unidad mínima de mapeo:',       ha(quemado, zonaGeom, CONFIG.scale));

// ----------------------------- 5. Estadísticas ----------------------------
function areaPorClase(sevImg, nombre) {
  var stats = ee.Image.pixelArea().addBands(sevImg.updateMask(quemado))
    .reduceRegion({
      reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'clase'}),
      geometry: zonaGeom, scale: CONFIG.scale, maxPixels: 1e9, tileScale: 4
    });
  var tabla = ee.FeatureCollection(ee.List(stats.get('groups')).map(function (g) {
    g = ee.Dictionary(g);
    return ee.Feature(null, {
      indice: nombre,
      clase: g.get('clase'),
      hectareas: ee.Number(g.get('sum')).divide(1e4)
    });
  }));
  return tabla;
}

var tablaDNBR  = areaPorClase(sevDNBR,  'dNBR');
var tablaRdNBR = areaPorClase(sevRdNBR, 'RdNBR');
// Área total en ráster (suma de píxeles quemados); evita vectorizar en la sesión interactiva.
var totalHa = ha(quemado, zonaGeom, CONFIG.scale);

print('--- SUPERFICIE POR CLASE (dentro del perímetro) ---');
print('Clases: 0 sin quemar · 1 baja · 2 moderada-baja · 3 moderada-alta · 4 alta');
print('dNBR (ha):',  tablaDNBR);
print('RdNBR (ha):', tablaRdNBR);
print('Perímetro mapeado (ha):', totalHa);
print('Cifra oficial (ha):', CONFIG.officialHa,
      '| Diferencia (%):', totalHa.subtract(CONFIG.officialHa).divide(CONFIG.officialHa).multiply(100));

// ----------------------------- 6. Mapa ------------------------------------
var pal = ['#79a933', '#ffd37f', '#e60000', '#730000'];
Map.addLayer(pre,  {bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.25}, '0. Pre (color real)', false);
Map.addLayer(post, {bands: ['B12', 'B8', 'B4'], min: 0.05, max: 0.35}, '1. Post (falso color SWIR)');
Map.addLayer(dNBR, {min: -0.1, max: 0.7, palette: ['#2166ac', '#f7f7f7', '#b2182b']}, '2. dNBR continuo', false);
Map.addLayer(sevDNBR.updateMask(quemado).updateMask(sevDNBR.gt(0)),
             {min: 1, max: 4, palette: pal}, '3. Severidad dNBR (en perímetro)');
Map.addLayer(sevRdNBR.updateMask(quemado).updateMask(sevRdNBR.gt(0)),
             {min: 1, max: 4, palette: pal}, '4. Severidad RdNBR (en perímetro)', false);
// Contorno del perímetro en ráster (borde de 1 px alrededor de los píxeles quemados)
var borde = quemado.unmask(0)
  .focal_max({radius: 1, kernelType: 'square', units: 'pixels'})
  .subtract(quemado.unmask(0)).selfMask();
Map.addLayer(borde, {palette: ['white']}, '5. Perímetro derivado');
Map.addLayer(ee.Image().paint(ee.FeatureCollection([ee.Feature(zonaGeom)]), 1, 1),
             {palette: ['yellow']}, '5b. Zona de búsqueda', false);
Map.addLayer(focos, {palette: ['orange']}, '6. Focos FIRMS (evento)');
Map.addLayer(anp.style({color: 'cyan', fillColor: '00000000', width: 1}), {}, '7. Límite ANP');

// Leyenda
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
legend.add(ui.Label('Severidad (dNBR)', {fontWeight: 'bold'}));
[['Baja', pal[0]], ['Moderada-baja', pal[1]], ['Moderada-alta', pal[2]], ['Alta', pal[3]]]
  .forEach(function (r) {
    legend.add(ui.Panel([
      ui.Label('', {backgroundColor: r[1], padding: '8px', margin: '0 6px 4px 0'}),
      ui.Label(r[0])
    ], ui.Panel.Layout.Flow('horizontal')));
  });
Map.add(legend);

// ----------------------------- 7. Exportes --------------------------------
var p = CONFIG.exportPrefix;
Export.image.toDrive({image: dNBR.addBands(RdNBR).toFloat(), description: p + '_dNBR_RdNBR',
  region: aoi, scale: CONFIG.scale, crs: 'EPSG:32611', maxPixels: 1e9});
Export.image.toDrive({image: sevDNBR.updateMask(quemado).toByte(), description: p + '_severidad_dNBR',
  region: aoi, scale: CONFIG.scale, crs: 'EPSG:32611', maxPixels: 1e9});
Export.table.toDrive({collection: perimetro, description: p + '_perimetro', fileFormat: 'GeoJSON'});
Export.table.toDrive({collection: tablaDNBR.merge(tablaRdNBR), description: p + '_areas_por_clase',
  fileFormat: 'CSV'});
