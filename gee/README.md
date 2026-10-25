# Google Earth Engine Analysis

This folder contains the Google Earth Engine (GEE) processing pipeline used by GeoVision AI.

## Current Analysis

The current implementation performs multi-temporal environmental change analysis using Sentinel-2 satellite imagery.

### Satellite Data

- Source: Sentinel-2 Surface Reflectance
- Platform: Google Earth Engine
- Analysis period: 2023–2026
- Current seasonal window: January–March
- Study area: Pilot Area of Interest (AOI) in Pune

### Cloud and Haze Screening

Cloud Score+ is used to reduce the influence of clouds and haze before generating satellite composites.

## Environmental Indicators

GeoVision AI currently calculates:

### NDVI — Normalized Difference Vegetation Index

Used to analyze vegetation condition and vegetation change.

### NDWI — Normalized Difference Water Index

Used to analyze water-related spatial changes.

### NDBI — Normalized Difference Built-up Index

Used to identify built-up or urbanization-related changes.

## Multi-Temporal Change Detection

Satellite composites are generated for multiple years and compared to identify environmental changes.

Current features include:

- NDVI for individual years
- NDVI change
- NDWI change
- NDBI change
- Vegetation-loss areas
- Change magnitude
- Area statistics

## Current Baseline

A rule-based baseline is currently used to identify significant vegetation loss:

- Baseline NDVI >= 0.4
- NDVI change <= -0.2

This rule is treated as an initial baseline/pseudo-labeling approach and not as independent ground truth.

## Current Outputs

The GEE workflow can generate:

- Environmental index maps
- Change detection maps
- Vegetation-loss masks
- Hotspot candidates
- Area statistics
- CSV outputs
- GeoTIFF exports

## Research Direction

The next stage of GeoVision AI will use the satellite-derived features as inputs to a machine-learning model.

The planned initial model is Random Forest.

The research pipeline will progress from:

Detection → Quantification → Prioritization → Explanation → Validation

High-resolution Bhuvan/NRSC imagery will be considered as a spatial validation/reference source for selected hotspots.

## Important Note

The current Pune area is a development and validation pilot area.

The final GeoVision AI system is intended to allow users to select their own Area of Interest (AOI) rather than using a fixed geographical location.
