# GeoVision AI — System Architecture

## 1. Overview

GeoVision AI is an explainable multi-temporal geospatial intelligence framework for detecting, quantifying, prioritizing, explaining, and validating environmental changes within a user-defined Area of Interest (AOI).

The system combines satellite-derived environmental indicators, machine learning, explainable AI, and high-resolution spatial validation.

---

## 2. High-Level Architecture

```text
User
  ↓
Web Dashboard
  ↓
Select Area of Interest (AOI)
  ↓
Select Analysis Period
  ↓
FastAPI Backend
  ↓
Google Earth Engine
  ↓
Sentinel-2 Satellite Data
  ↓
Multi-Temporal Processing
  ↓
NDVI / NDWI / NDBI
  ↓
Change Detection
  ↓
Feature Engineering
  ↓
Random Forest Model
  ↓
Change Probability
  ↓
Hotspot Prioritization
  ↓
Explainable AI
  ↓
Bhuvan / NRSC Spatial Validation
  ↓
Dashboard Results
  ↓
PDF Report
