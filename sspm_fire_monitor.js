// =========================================================================
// SISTEMA AUTOMATIZADO DE MONITOREO Y SEVERIDAD DE INCENDIOS (dNBR)
// Área de Estudio: Parque Nacional Sierra de San Pedro Mártir (SSPM)
// Componente: Detección Activa + Severidad de Cicatrices de Quema
// =========================================================================

// 1. CONFIGURACIÓN DEL ÁREA DE INTERÉS (AOI)
var areasProtegidas = ee.FeatureCollection("WCMC/WDPA/current/polygons");
var sanPedroMartir = areasProtegidas.filter(ee.Filter.eq('NAME', 'Sierra de San Pedro Mártir'));
var aoi = sanPedroMartir; 

Map.centerObject(aoi, 11);
Map.setOptions('SATELLITE');

// 2. AUTOMATIZACIÓN TEMPORAL (Ventanas Dinámicas)
var hoy = ee.Date(new Date().getTime());
var hace30Dias = hoy.advance(-30, 'day');
var preInicio = hace30Dias.advance(-1, 'year');
var preFin = hoy.advance(-1, 'year');

print('--- VENTANAS TEMPORALES AUTOMÁTICAS ---');
print('Fase Pre-Incendio (Año Pasado):', preInicio, 'a', preFin);
print('Fase Post-Incendio (Actualidad):', hace30Dias, 'a', hoy);

// 3. FUNCIONES DE PROCESAMIENTO ESPECTRAL
var enmascararNubes = function(img) {
  var qa = img.select('QA60');
  var mascaraNubes = 1 << 10;
  var mascaraCirros = 1 << 11;
  var mask = qa.bitwiseAnd(mascaraNubes).eq(0)
      .and(qa.bitwiseAnd(mascaraCirros).eq(0));
  return img.updateMask(mask).divide(10000);
};

var calcularNBR = function(img) {
  var nbr = img.normalizedDifference(['B8', 'B12']).rename('NBR');
  return img.addBands(nbr);
};

// 4. FILTRADO Y COMPOSICIÓN DE COLECCIONES (Sentinel-2)
var S2_Pre = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(preInicio, preFin)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(enmascararNubes)
  .map(calcularNBR);

var S2_Post = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(hace30Dias, hoy)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(enmascararNubes)
  .map(calcularNBR);

var mosaicoPre = S2_Pre.median().clip(aoi);
var mosaicoPost = S2_Post.median().clip(aoi);

// 5. CÁLCULO DE SEVERIDAD (dNBR)
var nbrPre = mosaicoPre.select('NBR');
var nbrPost = mosaicoPost.select('NBR');
var dNBR = nbrPre.subtract(nbrPost).rename('dNBR');

var severidad = ee.Image(0)
  .where(dNBR.gte(0.1).and(dNBR.lt(0.27)), 1)  
  .where(dNBR.gte(0.27).and(dNBR.lt(0.44)), 2) 
  .where(dNBR.gte(0.44).and(dNBR.lt(0.66)), 3) 
  .where(dNBR.gte(0.66), 4)                    
  .clip(aoi);

var severidadMascara = severidad.updateMask(severidad.gt(0));

// 6. VISUALIZACIÓN EN EL MAPA
Map.addLayer(mosaicoPost, {bands: ['B12', 'B8', 'B4'], min: 0.05, max: 0.35}, '1. Superficie Actual (Falso Color S2)');

var paletaSeveridad = ['#79a933', '#ffd37f', '#e60000', '#730000'];
Map.addLayer(severidadMascara, {min: 1, max: 4, palette: paletaSeveridad}, '2. Clasificación de Severidad (dNBR)');

var hace15Dias = hoy.advance(-15, 'day');
var focosCalor = ee.ImageCollection('FIRMS')
  .filterBounds(aoi)
  .filterDate(hace15Dias, hoy)
  .select('T21');
Map.addLayer(focosCalor, {min: 300, max: 400, palette: ['yellow', 'orange', 'red']}, '3. Focos Activos Recientes (FIRMS)');

// 7. CÁLCULO GEOMÉTRICO AUTOMÁTICO DE SUPERFICIE
var areaPixel = ee.Image.pixelArea();
var imagenArea = areaPixel.addBands(severidadMascara);

var estadisticas = imagenArea.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'clase_severidad',
  }),
  geometry: aoi,
  scale: 20, 
  maxPixels: 1e9
});

print('--- REPORTE AUTOMÁTICO DE SUPERFICIE QUEMADA ---');
print('Resultados de reducción de área en m² (Clases 1 a 4):', estadisticas);
