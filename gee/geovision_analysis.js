// ============================================================
// GEOVISION AI
// COMPLETE SENTINEL-2 ENVIRONMENTAL CHANGE ANALYSIS
// ============================================================

// ============================================================
// 0. STUDY AREA
// ============================================================

var studyArea = geometry;

Map.centerObject(studyArea, 15);


// ============================================================
// 1. DATASETS
// ============================================================

// Sentinel-2 Surface Reflectance
var s2 = ee.ImageCollection(
  'COPERNICUS/S2_SR_HARMONIZED'
);

// Cloud Score+
// Used for pixel-level cloud / haze screening
var cloudScore = ee.ImageCollection(
  'GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED'
);


// ============================================================
// 2. SETTINGS
// ============================================================

var CLEAR_THRESHOLD = 0.60;

// We compare the same season each year.
// January 1 -> April 1
var START_MONTH = 1;
var END_MONTH = 4;


// ============================================================
// 3. FUNCTION TO CREATE YEARLY COMPOSITE
// ============================================================

function getComposite(year) {

  var startDate = ee.Date.fromYMD(
    year,
    START_MONTH,
    1
  );

  var endDate = ee.Date.fromYMD(
    year,
    END_MONTH,
    1
  );

  var collection = s2
    .filterBounds(studyArea)
    .filterDate(startDate, endDate)

    // Remove very cloudy scenes first
    .filter(
      ee.Filter.lt(
        'CLOUDY_PIXEL_PERCENTAGE',
        60
      )
    )

    // Attach Cloud Score+ quality information
    .linkCollection(
      cloudScore,
      ['cs_cdf']
    )

    // Keep relatively clear pixels
    .map(function(image) {

      return image
        .updateMask(
          image
            .select('cs_cdf')
            .gte(CLEAR_THRESHOLD)
        );

    });

  print(
    'Number of images used for ' + year + ':',
    collection.size()
  );

  var composite = collection
    .median()
    .clip(studyArea);

  return composite;
}


// ============================================================
// 4. CREATE COMPOSITES
// ============================================================

var image2023 = getComposite(2023);

var image2024 = getComposite(2024);

var image2025 = getComposite(2025);

var image2026 = getComposite(2026);


// ============================================================
// 5. TRUE COLOR VISUALIZATION
// ============================================================

var trueColor = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 2500,
  gamma: 1.2
};


// ============================================================
// 6. FALSE COLOR VISUALIZATION
// ============================================================

var falseColor = {
  bands: ['B8', 'B4', 'B3'],
  min: 0,
  max: 3000
};


// ============================================================
// 7. ADD TRUE COLOR LAYERS
// ============================================================

Map.addLayer(
  image2023,
  trueColor,
  'True Color 2023',
  false
);

Map.addLayer(
  image2024,
  trueColor,
  'True Color 2024',
  false
);

Map.addLayer(
  image2025,
  trueColor,
  'True Color 2025',
  false
);

Map.addLayer(
  image2026,
  trueColor,
  'True Color 2026',
  true
);


// ============================================================
// 8. ADD FALSE COLOR LAYERS
// ============================================================

Map.addLayer(
  image2023,
  falseColor,
  'False Color 2023',
  false
);

Map.addLayer(
  image2024,
  falseColor,
  'False Color 2024',
  false
);

Map.addLayer(
  image2025,
  falseColor,
  'False Color 2025',
  false
);

Map.addLayer(
  image2026,
  falseColor,
  'False Color 2026',
  false
);


// ============================================================
// 9. NDVI FUNCTION
// ============================================================

function calculateNDVI(image) {

  return image
    .normalizedDifference([
      'B8',
      'B4'
    ])
    .rename('NDVI');

}


// ============================================================
// 10. NDVI FOR EACH YEAR
// ============================================================

var ndvi2023 = calculateNDVI(image2023);

var ndvi2024 = calculateNDVI(image2024);

var ndvi2025 = calculateNDVI(image2025);

var ndvi2026 = calculateNDVI(image2026);


// ============================================================
// 11. NDVI VISUALIZATION
// ============================================================

var ndviVisualization = {
  min: 0,
  max: 0.8,
  palette: [
    'red',
    'orange',
    'yellow',
    'lightgreen',
    'green',
    'darkgreen'
  ]
};


// ============================================================
// 12. ADD NDVI LAYERS
// ============================================================

Map.addLayer(
  ndvi2023,
  ndviVisualization,
  'NDVI 2023',
  false
);

Map.addLayer(
  ndvi2024,
  ndviVisualization,
  'NDVI 2024',
  false
);

Map.addLayer(
  ndvi2025,
  ndviVisualization,
  'NDVI 2025',
  false
);

Map.addLayer(
  ndvi2026,
  ndviVisualization,
  'NDVI 2026',
  false
);


// ============================================================
// 13. NDVI CHANGE 2023 -> 2026
// ============================================================

var ndviChange = ndvi2026
  .subtract(ndvi2023)
  .rename('NDVI_Change');


// ============================================================
// 14. NDVI CHANGE VISUALIZATION
// ============================================================

var changeVisualization = {
  min: -0.5,
  max: 0.5,
  palette: [
    'darkred',
    'red',
    'orange',
    'white',
    'lightgreen',
    'green',
    'darkgreen'
  ]
};


Map.addLayer(
  ndviChange,
  changeVisualization,
  'NDVI Change 2023-2026',
  true
);


// ============================================================
// 15. SIGNIFICANT VEGETATION LOSS
// ============================================================

// We define vegetation loss as:
// 2023 NDVI >= 0.4
// AND
// NDVI decrease <= -0.2

var vegetationLoss = ndvi2023
  .gte(0.4)
  .and(
    ndviChange.lte(-0.2)
  )
  .selfMask();


Map.addLayer(
  vegetationLoss,
  {
    palette: ['red']
  },
  'Significant Vegetation Loss',
  false
);


// ============================================================
// 16. NDWI - WATER INDEX
// ============================================================

function calculateNDWI(image) {

  return image
    .normalizedDifference([
      'B3',
      'B8'
    ])
    .rename('NDWI');

}


var ndwi2023 = calculateNDWI(image2023);

var ndwi2026 = calculateNDWI(image2026);


// ============================================================
// 17. NDWI CHANGE
// ============================================================

var ndwiChange = ndwi2026
  .subtract(ndwi2023)
  .rename('NDWI_Change');


Map.addLayer(
  ndwiChange,
  {
    min: -0.5,
    max: 0.5,
    palette: [
      'brown',
      'yellow',
      'white',
      'cyan',
      'blue'
    ]
  },
  'Water Change 2023-2026',
  false
);


// ============================================================
// 18. NDBI - BUILT-UP INDEX
// ============================================================

function calculateNDBI(image) {

  return image
    .normalizedDifference([
      'B11',
      'B8'
    ])
    .rename('NDBI');

}


var ndbi2023 = calculateNDBI(image2023);

var ndbi2026 = calculateNDBI(image2026);


// ============================================================
// 19. NDBI CHANGE
// ============================================================

var ndbiChange = ndbi2026
  .subtract(ndbi2023)
  .rename('NDBI_Change');


Map.addLayer(
  ndbiChange,
  {
    min: -0.4,
    max: 0.4,
    palette: [
      'blue',
      'white',
      'yellow',
      'orange',
      'red'
    ]
  },
  'Built-up Change 2023-2026',
  false
);


// ============================================================
// 20. POTENTIAL BUILT-UP INCREASE
// ============================================================

// Heuristic indicator:
// NDBI increase >= 0.15

var builtUpIncrease = ndbiChange
  .gte(0.15)
  .selfMask();


Map.addLayer(
  builtUpIncrease,
  {
    palette: ['red']
  },
  'Potential Built-up Increase',
  false
);


// ============================================================
// 21. VEGETATION AREA FUNCTION
// ============================================================

function calculateVegetationArea(ndviImage, year) {

  var vegetationMask = ndviImage.gte(0.4);

  var areaImage = ee.Image.pixelArea()
    .updateMask(vegetationMask);

  var area = areaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 10,
    maxPixels: 1e9
  });

  print(
    'Vegetation area ' + year + ' (m²):',
    area.get('area')
  );

  print(
    'Vegetation area ' + year + ' (km²):',
    ee.Number(area.get('area')).divide(1e6)
  );
}


// ============================================================
// 22. CALCULATE VEGETATION AREA
// ============================================================

calculateVegetationArea(
  ndvi2023,
  2023
);

calculateVegetationArea(
  ndvi2024,
  2024
);

calculateVegetationArea(
  ndvi2025,
  2025
);

calculateVegetationArea(
  ndvi2026,
  2026
);


// ============================================================
// 23. VEGETATION LOSS AREA
// ============================================================

var vegetationLossAreaImage = ee.Image
  .pixelArea()
  .updateMask(vegetationLoss);

var vegetationLossArea =
  vegetationLossAreaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 10,
    maxPixels: 1e9
  });


print(
  'Significant vegetation loss (m²):',
  vegetationLossArea.get('area')
);


print(
  'Significant vegetation loss (km²):',
  ee.Number(
    vegetationLossArea.get('area')
  ).divide(1e6)
);


// ============================================================
// 24. TOTAL STUDY AREA
// ============================================================

var totalArea = ee.Image.pixelArea()
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 10,
    maxPixels: 1e9
  });


print(
  'Total study area (km²):',
  ee.Number(
    totalArea.get('area')
  ).divide(1e6)
);


// ============================================================
// 25. VEGETATION LOSS PERCENTAGE
// ============================================================

var lossPercentage = ee.Number(
  vegetationLossArea.get('area')
)
.divide(
  ee.Number(totalArea.get('area'))
)
.multiply(100);


print(
  'Significant vegetation loss percentage:',
  lossPercentage
);


// ============================================================
// 26. NDVI STATISTICS
// ============================================================

function printNDVIStats(image, year) {

  var stats = image.reduceRegion({
    reducer: ee.Reducer.mean()
      .combine({
        reducer2: ee.Reducer.minMax(),
        sharedInputs: true
      }),
    geometry: studyArea,
    scale: 10,
    maxPixels: 1e9
  });

  print(
    'NDVI statistics ' + year + ':',
    stats
  );
}


printNDVIStats(
  ndvi2023,
  2023
);

printNDVIStats(
  ndvi2024,
  2024
);

printNDVIStats(
  ndvi2025,
  2025
);

printNDVIStats(
  ndvi2026,
  2026
);


// ============================================================
// 27. NDVI CHANGE STATISTICS
// ============================================================

var changeStats = ndviChange.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine({
      reducer2: ee.Reducer.minMax(),
      sharedInputs: true
    }),
  geometry: studyArea,
  scale: 10,
  maxPixels: 1e9
});


print(
  'NDVI change statistics 2023-2026:',
  changeStats
);


// ============================================================
// 28. FINAL INFORMATION
// ============================================================

print(
  '======================================'
);

print(
  'GEOVISION AI ANALYSIS COMPLETE'
);

print(
  'Study area:',
  studyArea
);

print(
  'Years:',
  '2023, 2024, 2025, 2026'
);

print(
  'Season:',
  'January - March'
);

print(
  'Cloud Score+ threshold:',
  CLEAR_THRESHOLD
);

print(
  '======================================'
);
