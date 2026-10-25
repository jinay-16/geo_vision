# GeoVision AI Dataset

This folder documents the datasets and features used by GeoVision AI.

## Current Dataset

The current development dataset is generated from Sentinel-2 satellite imagery processed through Google Earth Engine.

### Current Pilot Area

- Location: Pune, Maharashtra, India
- Purpose: Development and validation pilot
- The final system will support user-defined Areas of Interest (AOIs)

## Temporal Coverage

Current analysis uses:

- 2023
- 2024
- 2025
- 2026

Current seasonal analysis window:

- January–March

The temporal configuration may be expanded in future experiments.

## Satellite Features

The current Sentinel-2 workflow uses the following bands:

- B2 — Blue
- B3 — Green
- B4 — Red
- B8 — Near Infrared
- B11 — SWIR 1
- B12 — SWIR 2

## Derived Environmental Indicators

The following indices are currently calculated:

| Feature | Purpose |
|---|---|
| NDVI | Vegetation condition |
| NDWI | Water-related change |
| NDBI | Built-up/urbanization-related change |

## Change Features

Multi-temporal features include:

- NDVI change
- NDWI change
- NDBI change
- Multi-year temporal trends
- Change magnitude
- Spatial area statistics

These features will form the basis of the machine-learning stage.

## Baseline Labels

An initial rule-based baseline is used to identify potential significant vegetation loss:

NDVI in baseline year >= 0.4

AND

NDVI change <= -0.2

These labels are considered preliminary pseudo-labels for experimentation.

They should not be treated as independent ground truth.

## Planned Machine Learning Dataset

The planned ML dataset will contain spatial samples with features derived from satellite imagery.

Example feature structure:

- NDVI
- NDWI
- NDBI
- Spectral bands
- Temporal changes
- Optional spatial/context features

Initial target:

- Significant Change
- No Significant Change

The initial machine-learning model will be Random Forest.

## Validation

Selected change hotspots will be visually examined using higher-resolution Bhuvan/NRSC imagery where appropriate.

This will be used as a spatial validation/reference mechanism rather than automatically treating the imagery as absolute ground truth.

## Data Storage

Large raster files and exported datasets should not be committed directly to GitHub.

Examples include:

- GeoTIFF files
- Large raster datasets
- Raw satellite imagery
- Temporary exports

GitHub will primarily contain:

- Processing code
- Dataset documentation
- Small sample data where appropriate
- Metadata
- Research documentation

## Future Data Sources

Future experiments may investigate:

- Sentinel-1 SAR
- DEM/elevation
- Slope
- Rainfall
- Land-cover information
- Longer historical satellite records

These are planned extensions and are not currently part of the core implementation.
