import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Methodology() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 mb-2">
              <span>🛰️</span>
              <span>Explainable Geospatial Intelligence Pipeline</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight">
              Platform Methodology & Scientific Framework
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-2 max-w-3xl leading-relaxed">
              GeoVision AI combines multi-spectral optical imagery, synthetic aperture radar (SAR), cloud-native computing, and leakage-controlled machine learning to screen for environmental change. All outputs are risk-screening indicators designed to prioritize on-ground field inspections.
            </p>
          </div>
          <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
            <Link
              to="/analysis"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-medium rounded-lg text-center transition-colors shadow-sm"
            >
              Launch Live Analysis →
            </Link>
            <Link
              to="/reports"
              className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-800 text-xs sm:text-sm font-medium rounded-lg text-center transition-colors border border-gray-200"
            >
              Export Inspection Reports
            </Link>
          </div>
        </div>

        {/* Quick Spec Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-gray-100 text-xs">
          <div className="bg-surface-50 p-3 rounded-xl border border-gray-100">
            <span className="text-gray-500 block">Optical Sensor</span>
            <span className="font-semibold text-surface-800">Sentinel-2 MSI (10m–20m)</span>
          </div>
          <div className="bg-surface-50 p-3 rounded-xl border border-gray-100">
            <span className="text-gray-500 block">Radar Sensor</span>
            <span className="font-semibold text-surface-800">Sentinel-1 C-Band SAR (IW)</span>
          </div>
          <div className="bg-surface-50 p-3 rounded-xl border border-gray-100">
            <span className="text-gray-500 block">Cloud Processing</span>
            <span className="font-semibold text-surface-800">Google Earth Engine API</span>
          </div>
          <div className="bg-surface-50 p-3 rounded-xl border border-gray-100">
            <span className="text-gray-500 block">Classification Role</span>
            <span className="font-semibold text-surface-800">Screening Indicator (Not Legal Proof)</span>
          </div>
        </div>
      </div>

      {/* Visual End-to-End Workflow Pipeline Diagram */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-surface-900 mb-2 flex items-center gap-2">
          <span>🔄</span> End-to-End Processing Architecture
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mb-6">
          How raw satellite observations flow from spaceborne constellations to actionable field inspection directives:
        </p>

        {/* Workflow Steps Horizontal Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 relative">
          <WorkflowStep
            step="1"
            title="Satellite Ingestion"
            desc="Sentinel-2 Optical & Sentinel-1 SAR acquired via Google Earth Engine"
            icon="🛰️"
            badge="Sensors"
          />
          <WorkflowStep
            step="2"
            title="Preprocessing"
            desc="Cloud Score+ filtering, orbit harmonization, 30m radar speckle filtering"
            icon="🧹"
            badge="Quality QA"
          />
          <WorkflowStep
            step="3"
            title="Biophysical Deltas"
            desc="Pixel-level calculation of ΔNDVI, ΔNDBI, ΔNDWI & radar backscatter ΔVV/ΔVH"
            icon="📊"
            badge="Spectral"
          />
          <WorkflowStep
            step="4"
            title="Risk Screening"
            desc="Deterministic multi-factor scoring (0–100) + leakage-controlled RF verification"
            icon="⚠️"
            badge="Dual Engine"
          />
          <WorkflowStep
            step="5"
            title="AOI Map Analysis"
            desc="Interactive MapLibre GL exploration, polygon boundaries & parcel clustering"
            icon="🗺️"
            badge="Spatial"
          />
          <WorkflowStep
            step="6"
            title="Report Generation"
            desc="Automated audit generation with PDF, GIS GeoJSON and CSV exports"
            icon="📑"
            badge="Exports"
          />
          <WorkflowStep
            step="7"
            title="Field Verification"
            desc="On-ground GPS audits, drone photogrammetry & administrative review"
            icon="🔍"
            badge="Ground Truth"
            isLast={true}
          />
        </div>
      </div>

      {/* Section 1: Data Sources */}
      <StageSection
        number="1"
        title="Satellite Data Sources & Cloud Preprocessing"
        icon="🛰️"
        subtitle="Multi-sensor Earth observation backbone and data provenance distinction"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-50 rounded-xl p-5 border border-gray-200/70 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-100 text-blue-700 text-base">🛰️</span>
              <div>
                <h4 className="font-semibold text-surface-900 text-sm">Copernicus Sentinel-2 Level-2A (Optical)</h4>
                <p className="text-xs font-mono text-gray-500">COPERNICUS/S2_SR_HARMONIZED</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Provides bottom-of-atmosphere Surface Reflectance imagery across 13 spectral bands. GeoVision AI harnesses 6 primary operational bands: <strong>B2 (Blue, 10m)</strong>, <strong>B3 (Green, 10m)</strong>, <strong>B4 (Red, 10m)</strong>, <strong>B8 (Near-Infrared, 10m)</strong>, <strong>B11 (SWIR-1, 20m)</strong>, and <strong>B12 (SWIR-2, 20m)</strong>.
            </p>
            <div className="text-xs bg-white p-3 rounded-lg border border-gray-200">
              <span className="font-semibold text-surface-800">Operational Role:</span> Primary optical indicator for photosynthetic canopy vigor (NDVI), surface bareness and quarry expansion (NDBI), and visible open water boundaries (NDWI).
            </div>
          </div>

          <div className="bg-surface-50 rounded-xl p-5 border border-gray-200/70 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-100 text-indigo-700 text-base">📡</span>
              <div>
                <h4 className="font-semibold text-surface-900 text-sm">Copernicus Sentinel-1 C-Band SAR (Radar)</h4>
                <p className="text-xs font-mono text-gray-500">COPERNICUS/S1_GRD (IW Mode)</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Active synthetic aperture radar operating at C-band (5.405 GHz) in Interferometric Wide (IW) swath mode. Emits calibrated microwave pulses that penetrate clouds, haze, dust, smoke, and nighttime darkness. Measures backscatter intensity (sigma nought $\sigma^0$ in dB) in <strong>VV</strong> and <strong>VH</strong> polarizations with 30m focal median speckle filtering.
            </p>
            <div className="text-xs bg-white p-3 rounded-lg border border-gray-200">
              <span className="font-semibold text-surface-800">Operational Role:</span> All-weather flood inundation tracking (smooth water reflects radar pulses away) and structural canopy degradation screening (loss of volume backscatter in VH).
            </div>
          </div>

          <div className="bg-surface-50 rounded-xl p-5 border border-gray-200/70 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700 text-base">☁️</span>
              <div>
                <h4 className="font-semibold text-surface-900 text-sm">Google Cloud Score+ QA Cloud Masking</h4>
                <p className="text-xs font-mono text-gray-500">GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              An advanced machine-learning cloud assessment pipeline that produces pixel-level atmospheric clarity quality bands (<code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">cs_cdf</code>). GeoVision AI applies a strict clarity threshold (<code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">&ge; 0.60</code>) alongside pre-filters (<code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">CLOUDY_PIXEL_PERCENTAGE &le; 60%</code>) to eliminate cloudy pixels, cloud edges, and ground shadow artifacts.
            </p>
            <div className="text-xs bg-white p-3 rounded-lg border border-gray-200">
              <span className="font-semibold text-surface-800">Operational Role:</span> Prevents cloud reflections and cloud shadows from falsely registering as land clearing or flooded water bodies.
            </div>
          </div>

          <div className="bg-surface-50 rounded-xl p-5 border border-gray-200/70 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-amber-100 text-amber-700 text-base">⚡</span>
              <div>
                <h4 className="font-semibold text-surface-900 text-sm">Google Earth Engine (GEE) Platform</h4>
                <p className="text-xs font-mono text-gray-500">Cloud-Native Planetary Processing</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Provides petabyte-scale cloud computational infrastructure. Rather than downloading massive GeoTIFF rasters to the local server, GeoVision AI offloads spatial filtering, geometric clipping, multi-scene temporal median compositing, and exact pixel area aggregations (<code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">ee.Image.pixelArea()</code>) directly to Google's planetary computing clusters.
            </p>
            <div className="text-xs bg-white p-3 rounded-lg border border-gray-200">
              <span className="font-semibold text-surface-800">Operational Role:</span> Enables rapid on-demand analysis across user-defined geographic boundaries in seconds.
            </div>
          </div>
        </div>

        {/* Provenance Distinction Notice */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <span>⚠️</span> Data Provenance Distinction: Live Satellite Analysis vs. Historical Pune Pilot Dataset
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="bg-white/80 p-3 rounded-lg border border-amber-200">
              <strong className="text-surface-900 block mb-1">1. Live Satellite Pipeline (User AOIs):</strong>
              Queries the real-time Google Earth Engine catalog on demand for any user-drawn coordinate boundary or preset area in India. It computes live optical/radar medians, spectral deltas, and pixel-area impacts dynamically.
            </div>
            <div className="bg-white/80 p-3 rounded-lg border border-amber-200">
              <strong className="text-surface-900 block mb-1">2. Historical Pune Pilot Dataset (5,000 Points):</strong>
              A fixed historical reference dataset generated from January–March composites (2023–2026) for Pune, Maharashtra. Used strictly for model prototyping, statistical benchmarking, and offline demonstrations. <em>Custom AOI evaluations never inherit or rely on Pune pilot metrics.</em>
            </div>
          </div>
        </div>
      </StageSection>

      {/* Section 2: Spectral and Radar Indicators */}
      <StageSection
        number="2"
        title="Spectral and Radar Biophysical Indicators"
        icon="📊"
        subtitle="Mathematical formulation, sensor mechanics, and physical limitations"
      >
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          All indices are implemented directly in <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">gee_service.py</code> and verified against peer-reviewed remote sensing standards:
        </p>

        <div className="space-y-4">
          {/* NDVI */}
          <IndicatorDetailCard
            name="NDVI — Normalized Difference Vegetation Index"
            formula="(NIR − Red) / (NIR + Red) = (B8 − B4) / (B8 + B4)"
            accentColor="green"
            measures="Chlorophyll absorption in red light (0.66 µm) versus cellular mesophyll backscattering in near-infrared (0.84 µm). Yields values from -1.0 to +1.0, where dense healthy canopy ranges between 0.50 and 0.85."
            usage="GeoVision AI evaluates baseline vegetation density (NDVI >= 0.40) and tracks multi-year decline. A drop of ΔNDVI <= -0.20 flags severe canopy loss; ΔNDVI between -0.10 and -0.20 flags moderate degradation."
            limitations="Signal saturation over dense closed-canopy forests (NDVI > 0.85); seasonal dry-season defoliation and agricultural crop harvesting cycles exhibit identical spectral declines to tree felling."
          />

          {/* NDBI */}
          <IndicatorDetailCard
            name="NDBI — Normalized Difference Built-up Index"
            formula="(SWIR1 − NIR) / (SWIR1 + NIR) = (B11 − B8) / (B11 + B8)"
            accentColor="amber"
            measures="High shortwave-infrared reflectance (1.61 µm) characteristic of dry bare soil, cleared ground, sand, gravel, and urban concrete versus near-infrared reflection (range -1.0 to +1.0)."
            usage="Screens for surface exposure and earthmoving. An increase of ΔNDBI >= +0.15 coupled with simultaneous vegetation loss indicates high-probability land-surface disruption, quarry excavation, or construction."
            limitations="Cannot distinguish legal quarrying, highway construction, or plowed farm fields from illegal mining; high surface soil moisture dampens SWIR reflectance, muting the indicator."
          />

          {/* NDWI */}
          <IndicatorDetailCard
            name="NDWI — Normalized Difference Water Index (McFeeters, 1996)"
            formula="(Green − NIR) / (Green + NIR) = (B3 − B8) / (B3 + B8)"
            accentColor="blue"
            measures="High reflectance of water in visible green light (0.56 µm) combined with near-total absorption of electromagnetic radiation by water molecules in NIR (0.84 µm). Clear open water typically exhibits positive NDWI (> 0.0)."
            usage="Identifies open surface water extents. A shift where NDWI >= 0.0 and ΔNDWI >= +0.10 flags new surface water expansion or flood inundation footprint."
            limitations="Dark terrain shadows (steep hills, building shadows) can mimic water values; turbid floodwaters rich in suspended sediment or covered by floating aquatic vegetation can reduce green-NIR contrast."
          />

          {/* Sentinel-1 SAR Backscatter */}
          <IndicatorDetailCard
            name="Sentinel-1 SAR Radar Backscatter (VV / VH Polarizations in dB)"
            formula="σ° (dB) = 10 · log₁₀(DN² / A_i) with 30m Focal Median Speckle Reduction"
            accentColor="indigo"
            measures="Calibrated radar backscattering coefficient. VV polarization is sensitive to surface roughness and dielectric permittivity. VH (cross-polarization) is dominated by multiple volume scattering from tree branches and canopies."
            usage="Calm open water behaves as a specular mirror, reflecting radar pulses away and resulting in extremely low backscatter (VV <= -15.5 dB, ΔVV <= -2.5 dB). Forest canopy destruction causes sudden loss of volumetric scattering (VH_base >= -16.0 dB, ΔVH <= -2.0 dB). Surface disturbance shifts backscatter roughness (|ΔVV| >= 2.0 dB)."
            limitations="Strong wind creates surface capillary waves that roughen water and increase radar return (potential false negatives for floods); radar layover and shadow distort steep terrain; rainfall alters soil moisture without physical excavation."
          />
        </div>

        <div className="mt-4 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 flex items-start gap-2.5">
          <span className="text-base shrink-0">💡</span>
          <div>
            <strong>Important Scientific Principle:</strong> A spectral or radar index shift alone does not constitute legal proof of illegal mining, deforestation, or disaster declaration. Satellite indices detect <em>physical biophysical shifts</em>. Administrative enforcement requires ground-level verification and legal tenure cross-referencing.
          </div>
        </div>
      </StageSection>

      {/* Section 3: Environmental Analysis Modules */}
      <StageSection
        number="3"
        title="Environmental Analysis Modules"
        icon="🌿"
        subtitle="Specialized screening logic, multi-sensor fusion, and operational caveats"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Deforestation Module */}
          <div className="bg-white rounded-xl p-5 border border-green-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🌳</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  Canopy Loss Screening
                </span>
              </div>
              <h3 className="font-bold text-surface-900 text-base mb-2">Deforestation Screening</h3>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                Tracks progressive and abrupt canopy degradation across user-selected observation intervals.
              </p>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="p-2.5 rounded-lg bg-green-50/50 border border-green-100">
                  <span className="font-semibold block text-green-900">Implemented Signals:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-600">
                    <li>Optical: Baseline NDVI &ge; 0.40 and &Delta;NDVI &le; -0.20</li>
                    <li>Radar: Sentinel-1 &Delta;VH &le; -2.0 dB (volume loss)</li>
                    <li>Dual-Sensor Coincidence: High-confidence canopy felling</li>
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="font-semibold block text-surface-800">Operational Caveats:</span>
                  <p className="text-gray-600 mt-1">
                    Seasonal dry-period deciduous leaf-drop, forest fires, agricultural crop harvesting, and timber thinning produce similar spectral drops. Cannot establish legal forestry boundaries.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <Link to="/deforestation" className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center justify-between">
                <span>Open Deforestation Module</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Mining Module */}
          <div className="bg-white rounded-xl p-5 border border-amber-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">⛏️</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Surface Disturbance
                </span>
              </div>
              <h3 className="font-bold text-surface-900 text-base mb-2">Mining Land Disturbance</h3>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                Identifies open pit development, topsoil stripping, overburden dumping, and quarry expansion.
              </p>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100">
                  <span className="font-semibold block text-amber-900">Implemented Signals:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-600">
                    <li>Optical: &Delta;NDBI &ge; +0.15 paired with &Delta;NDVI &lt; -0.10</li>
                    <li>Radar: SAR roughness alteration |&Delta;VV| &ge; 2.0 dB</li>
                    <li>Urban Damping: Downweights existing dense cities</li>
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="font-semibold block text-surface-800">Operational Caveats:</span>
                  <p className="text-gray-600 mt-1">
                    Civil infrastructure, road construction, building sites, and deep seasonal plowing trigger bare-soil emergence. Satellite indicators detect <em>physical disturbance</em>, not statutory concession validity.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <Link to="/mining" className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center justify-between">
                <span>Open Mining Module</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Flood Module */}
          <div className="bg-white rounded-xl p-5 border border-blue-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🌊</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Water Extent Screening
                </span>
              </div>
              <h3 className="font-bold text-surface-900 text-base mb-2">Flood & Water Extent</h3>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                Monitors surface inundation, seasonal reservoir recharge, and temporary standing water expansion.
              </p>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <span className="font-semibold block text-blue-900">Implemented Signals:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-600">
                    <li>Optical: NDWI &ge; 0.0 and &Delta;NDWI &ge; +0.10</li>
                    <li>Radar: Sentinel-1 VV &le; -15.5 dB and &Delta;VV &le; -2.5 dB</li>
                    <li>Radar-Exclusive: Penetrates heavy cloud during monsoons</li>
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="font-semibold block text-surface-800">Operational Caveats:</span>
                  <p className="text-gray-600 mt-1">
                    Water expansion alone cannot distinguish dangerous emergency flooding from standard reservoir filling, controlled canal irrigation, or wetland seasonality. Not a hydraulic flood forecasting gauge.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <Link to="/flood" className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center justify-between">
                <span>Open Flood Module</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </StageSection>

      {/* Section 4: Temporal and AOI Analysis */}
      <StageSection
        number="4"
        title="Temporal and Area of Interest (AOI) Analysis"
        icon="🎯"
        subtitle="User geometry selection, temporal windowing, and geographic coverage"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <span>📍</span> 1. AOI Selection Modalities
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              GeoVision AI provides three flexible methods for designating monitoring targets:
            </p>
            <ul className="space-y-2 text-xs">
              <li className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Preset Ecological & Industrial Locations:</strong>
                Quickly test vetted reference sites across India, including the Pune pilot basin, Jim Corbett buffer (Uttarakhand), Sundarbans mangrove fringe (West Bengal), Western Ghats foothills, Singrauli mining corridor, and Kaziranga flood basin.
              </li>
              <li className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Geographic Point + Monitoring Radius:</strong>
                Enter custom WGS84 latitude and longitude coordinates with a circular buffer radius (2 km to 15 km) for rapid local spot-checks.
              </li>
              <li className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Custom GeoJSON Polygon Boundaries:</strong>
                Input arbitrary GeoJSON Polygon coordinate rings (<code className="font-mono text-gray-700">[[[lng, lat], ...]]</code>) for mining leases, reserved forest beats, or river sub-basins.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <span>📅</span> 2. Temporal Windows & Coverage Specifications
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Temporal comparisons are configured to isolate real land-use transitions from transient seasonal noise:
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Supported Archive Coverage:</strong>
                <span className="text-gray-600">
                  Full multi-temporal analysis is supported from <strong>2023 to 2026</strong> for operational composites, with Sentinel-1 radar records accessible back to 2014 and Sentinel-2 optical imagery back to 2016 across all of India.
                </span>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Seasonal Month Windows:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-600">
                  <li><strong>Dry Season (Jan–Apr):</strong> Standard baseline; minimizes cloud contamination for optical clarity.</li>
                  <li><strong>Monsoon (Jun–Sep):</strong> Relies heavily on Sentinel-1 radar penetration for flood monitoring.</li>
                  <li><strong>Post-Monsoon (Oct–Dec):</strong> Assesses agricultural recovery and post-flood moisture.</li>
                  <li><strong>Annual Window (Jan–Dec):</strong> Broad full-year median composites.</li>
                </ul>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <strong className="text-surface-800 block">Interactive MapLibre Inspection:</strong>
                <span className="text-gray-600">
                  Inspect results via split-screen layers: True-Color Optical (B4/B3/B2), False-Color NIR (B8/B4/B3), difference rasters, SAR backscatter, and clustered hotspot markers.
                </span>
              </div>
            </div>
          </div>
        </div>
      </StageSection>

      {/* Section 5: Machine Learning and Risk Scoring */}
      <StageSection
        number="5"
        title="Machine Learning and Risk Scoring Engine"
        icon="🤖"
        subtitle="Dual-track assessment: explainable rule-based scoring and leakage-controlled ML"
      >
        <div className="space-y-5">
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            GeoVision AI operates a dual-track scoring architecture. Continuous spatial monitoring uses an explainable rule-based engine, while statistical classification benchmarks utilize a trained Random Forest classifier.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rule Engine */}
            <div className="bg-surface-50 p-5 rounded-xl border border-gray-200 space-y-3">
              <h4 className="font-bold text-surface-900 text-sm flex items-center gap-2">
                <span>⚙️</span> Track A: Continuous Rule-Based Risk Engine
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Implemented in <code className="font-mono bg-white px-1 py-0.5 rounded border">risk_engine.py</code>. Runs across all live user AOIs. Maps index deltas through continuous piecewise linear functions (0–100) with baseline canopy weighting and urban built-up damping.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-white text-left text-gray-600">
                      <th className="p-2 border border-gray-200">Tier</th>
                      <th className="p-2 border border-gray-200">Score</th>
                      <th className="p-2 border border-gray-200">Operational Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border border-gray-200"><span className="px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-800">Low</span></td>
                      <td className="p-2 border border-gray-200 font-mono">0–39</td>
                      <td className="p-2 border border-gray-200 text-gray-600">Within standard natural phenological fluctuation</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-gray-200"><span className="px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">Medium</span></td>
                      <td className="p-2 border border-gray-200 font-mono">40–69</td>
                      <td className="p-2 border border-gray-200 text-gray-600">Moderate spectral anomaly detected — secondary review advised</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-gray-200"><span className="px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800">High</span></td>
                      <td className="p-2 border border-gray-200 font-mono">70–100</td>
                      <td className="p-2 border border-gray-200 text-gray-600">Severe biophysical deviation — priority field verification directive</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Random Forest Model */}
            <div className="bg-surface-50 p-5 rounded-xl border border-gray-200 space-y-3">
              <h4 className="font-bold text-surface-900 text-sm flex items-center gap-2">
                <span>🌲</span> Track B: Leakage-Controlled Random Forest Model
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Implemented in <code className="font-mono bg-white px-1 py-0.5 rounded border">ml_service.py</code>. A 200-tree Random Forest classifier with balanced class weights, trained on tabular vectors extracted from the Pune pilot dataset.
              </p>
              <div className="space-y-1.5 text-xs text-gray-700">
                <div><strong>Input Dimension:</strong> 15 leakage-controlled features (spectral bands & multi-year indices)</div>
                <div><strong>Leakage Control:</strong> <code className="font-mono bg-gray-200/60 px-1 rounded">NDVI_2023</code> and <code className="font-mono bg-gray-200/60 px-1 rounded">NDVI_Change</code> are strictly excluded from inputs to eliminate label circularity.</div>
                <div><strong>Top Feature Attributions:</strong> NDWI_Change (39.4%), NDWI_2023 (17.9%), NDBI_Change (16.2%), NDBI_2023 (9.5%).</div>
                <div><strong>Internal Benchmark:</strong> 98.1% holdout accuracy, 5-fold cross-validation mean: 97.84%.</div>
              </div>
            </div>
          </div>

          {/* Mandatory Disclosures Card */}
          <div className="p-4 sm:p-5 bg-red-50/60 rounded-xl border border-red-200 text-xs sm:text-sm text-red-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-red-950">
              <span>🛑</span> Mandatory Scientific Disclosures & Limitations
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs text-red-800">
              <li>
                <strong>Rule-Derived Pseudo-Labels:</strong> The ML model training labels were generated using deterministic threshold rules (<code className="font-mono text-red-950">NDVI_2023 &ge; 0.40 AND NDVI_Change &le; -0.20</code>), <em>not independently verified ground truth</em>.
              </li>
              <li>
                <strong>Accuracy Caveat:</strong> The reported 98.1% test accuracy reflects statistical alignment with the synthetic pseudo-label rules on the holdout split, rather than validated real-world forest audit performance.
              </li>
              <li>
                <strong>Single Pilot Region:</strong> Training was conducted exclusively on 5,000 spatial samples from Pune, Maharashtra. These results do not establish nationwide generalization across diverse agro-ecological or mountainous terrains.
              </li>
              <li>
                <strong>Screening Score vs. Violation Probability:</strong> The risk score is an empirical screening indicator to prioritize inspection queues, <em>not</em> a mathematical probability of an environmental violation.
              </li>
            </ul>
          </div>
        </div>
      </StageSection>

      {/* Section 6: Validation, Provenance & Reporting */}
      <StageSection
        number="6"
        title="Validation Architecture & Reporting Exports"
        icon="📑"
        subtitle="Verification tiers, provenance tracking, and field inspection artifacts"
      >
        <div className="space-y-5">
          {/* Three Validation Tiers */}
          <div>
            <h4 className="text-sm font-bold text-surface-900 mb-3 flex items-center gap-2">
              <span>🛡️</span> Three-Tier Validation Framework
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-surface-50 p-4 rounded-xl border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">Tier 1: Automated Test Suite</span>
                <p className="text-gray-600 leading-relaxed">
                  80+ unit and integration test assertions verifying schema compliance, zero-division metrics handling, GEE timeout safeguards, and ensuring non-Pune AOIs never inherit Pune baseline data.
                </p>
              </div>
              <div className="bg-surface-50 p-4 rounded-xl border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">Tier 2: Reference Benchmark Pilot</span>
                <p className="text-gray-600 leading-relaxed">
                  Independent reference dataset (<code className="font-mono text-gray-700">validation_reference_dataset.json</code>, 180 samples) testing 4 sensor configurations: S2 Optical Only, S1 SAR Only, Dual-Sensor Intersection, and Adaptive Fusion.
                </p>
              </div>
              <div className="bg-surface-50 p-4 rounded-xl border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">Tier 3: Field Ground Verification</span>
                <p className="text-gray-600 leading-relaxed">
                  Crucial final validation conducted on the ground by authorized personnel using GPS coordinates, mobile geotagged field photos, drone surveys, and municipal registry cross-checks.
                </p>
              </div>
            </div>
          </div>

          {/* Export Artifacts */}
          <div>
            <h4 className="text-sm font-bold text-surface-900 mb-3 flex items-center gap-2">
              <span>📦</span> Field-Ready Export Deliverables
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-red-100 text-red-700 text-sm">📄</span>
                  <span className="font-bold text-surface-900 text-sm">Formal PDF Audit</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Structured multi-page ReportLab document containing executive summaries, biophysical metrics tables, geographic bounding coordinates, data provenance notices, and statutory disclaimers.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700 text-sm">📊</span>
                  <span className="font-bold text-surface-900 text-sm">Tabular CSV Records</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Detailed spreadsheet format with record IDs, latitude/longitude, baseline and evaluation spectral values, deltas, risk levels, and field verification flags for GIS or statistical analysis.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-blue-100 text-blue-700 text-sm">🗺️</span>
                  <span className="font-bold text-surface-900 text-sm">GIS GeoJSON Layers</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Standardized WGS84 FeatureCollection polygons and hotspot point layers, directly importable into QGIS, ArcGIS, Google Earth Pro, or handheld GPS navigation units.
                </p>
              </div>
            </div>
          </div>
        </div>
      </StageSection>

      {/* Summary Banner */}
      <div className="bg-gradient-to-r from-surface-900 to-surface-800 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>🎯</span> Summary for Evaluators & Government Officers
            </h3>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
              GeoVision AI does not replace statutory environmental officers or issue binding legal classifications. It acts as an explainable, multi-sensor radar and optical screening funnel that narrows thousands of square kilometers of territory down to high-confidence hotspots requiring physical inspection.
            </p>
          </div>
          <Link
            to="/analysis"
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-md shrink-0"
          >
            Start Analyzing AOI →
          </Link>
        </div>
      </div>
    </div>
  );
}

// Subcomponents
function StageSection({ number, title, icon, subtitle, children }) {
  return (
    <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {number}
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-surface-900 flex items-center gap-2">
            <span>{icon}</span> {title}
          </h2>
        </div>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 ml-8">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function WorkflowStep({ step, title, desc, icon, badge, isLast }) {
  return (
    <div className="flex flex-col justify-between p-3.5 bg-surface-50 rounded-xl border border-gray-200/80 relative group hover:border-brand-300 transition-all">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="w-5 h-5 rounded-full bg-surface-200 text-surface-800 text-[10px] font-bold flex items-center justify-center">
            {step}
          </span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
            {badge}
          </span>
        </div>
        <div className="text-xl mb-1.5">{icon}</div>
        <h4 className="font-bold text-surface-900 text-xs mb-1">{title}</h4>
        <p className="text-[11px] text-gray-500 leading-snug">{desc}</p>
      </div>
      {!isLast && (
        <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs z-10">
          ▶
        </div>
      )}
    </div>
  );
}

function IndicatorDetailCard({ name, formula, measures, usage, limitations, accentColor }) {
  const borderColors = {
    green: 'border-l-green-500 bg-green-50/20',
    amber: 'border-l-amber-500 bg-amber-50/20',
    blue: 'border-l-blue-500 bg-blue-50/20',
    indigo: 'border-l-indigo-500 bg-indigo-50/20',
  };

  return (
    <div className={`border-l-4 ${borderColors[accentColor]} border-y border-r border-gray-200/80 rounded-r-xl p-4 sm:p-5 space-y-2`}>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <h4 className="font-bold text-surface-900 text-sm">{name}</h4>
        <span className="text-xs font-mono bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 shrink-0">
          {formula}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
        <div>
          <span className="font-semibold text-surface-800 block mb-0.5">What it Measures:</span>
          <p className="text-gray-600 leading-relaxed">{measures}</p>
        </div>
        <div>
          <span className="font-semibold text-surface-800 block mb-0.5">How GeoVision AI Uses It:</span>
          <p className="text-gray-600 leading-relaxed">{usage}</p>
        </div>
        <div>
          <span className="font-semibold text-red-800 block mb-0.5">Important Limitations:</span>
          <p className="text-gray-600 leading-relaxed">{limitations}</p>
        </div>
      </div>
    </div>
  );
}
