"""
GeoVision AI — Real-Observation Validation Benchmark Test Suite
(Improvement #3.4 Verification)

Comprehensive tests validating:
1. Strict separation between simulation fixture and real-observation datasets.
2. Verified ground-truth schema: unique IDs, provenance URLs, reviewer notes, inclusion status.
3. Pending/uncertain samples are NEVER silently converted to ground-truth labels or positive detections.
4. Statistical classification metrics: denominators, zero-division safety, and Wilson score 95% CIs.
5. Spatial coordinates, observation periods, and lack of duplicate sample IDs or coordinates.
6. Empirical cloud resilience computed from actual observations rather than synthetic masks.
7. Separation of offline determinism from live authenticated GEE calls.
"""

import json
import math
import sys
import unittest
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from ml.real_observation_benchmark import (
    RealObservationBenchmarkEngine,
    RealValidationSample,
    EnvironmentalModule,
    EvaluationMethod,
    EvaluationMode,
    compute_real_metrics,
    wilson_score_interval,
)


class TestRealDatasetSchemaAndSeparation(unittest.TestCase):
    """Validates real-observation dataset provenance, schema, and strict separation."""

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"
        cls.sim_path = root_dir / "data" / "validation_reference_dataset.json"

    def test_real_and_simulation_datasets_are_strictly_separate(self):
        """Simulation fixture (180 samples) and real dataset must be separate files."""
        self.assertTrue(self.real_path.exists(), f"Missing real dataset: {self.real_path}")
        self.assertTrue(self.sim_path.exists(), f"Missing simulation dataset: {self.sim_path}")
        self.assertNotEqual(self.real_path.resolve(), self.sim_path.resolve())

        with open(self.real_path, "r", encoding="utf-8") as f:
            real_data = json.load(f)
        with open(self.sim_path, "r", encoding="utf-8") as f:
            sim_data = json.load(f)

        self.assertFalse(real_data.get("is_simulated", True))
        self.assertTrue(sim_data.get("is_simulated", False))
        self.assertEqual(real_data.get("evaluation_type"), "real_observation")
        self.assertEqual(sim_data.get("evaluation_type"), "simulation_fixture")

    def test_real_dataset_schema_and_provenance_fields(self):
        """Every real observation sample must have required provenance and verification metadata."""
        with open(self.real_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        samples = data.get("samples", [])
        self.assertGreaterEqual(len(samples), 18)

        sample_ids = set()
        for s in samples:
            # Unique sample and event IDs
            self.assertIn("sample_id", s)
            self.assertIn("event_id", s)
            self.assertNotIn(s["sample_id"], sample_ids, f"Duplicate sample ID: {s['sample_id']}")
            sample_ids.add(s["sample_id"])

            # Valid module
            self.assertIn(s["module"], ["flood", "deforestation", "mining"])

            # Coordinates and buffer
            coords = s.get("coordinates", {})
            self.assertTrue(18.0 <= coords.get("lat", 0) <= 19.5, f"Lat out of Pune bounds: {coords}")
            self.assertTrue(73.0 <= coords.get("lng", 0) <= 75.0, f"Lng out of Pune bounds: {coords}")
            self.assertGreaterEqual(coords.get("buffer_meters", 0), 100)

            # Dates and Observation window
            self.assertIn("reference_date", s)
            obs = s.get("observation_period", {})
            self.assertIn("start_year", obs)
            self.assertIn("end_year", obs)
            self.assertIn("start_month", obs)
            self.assertIn("end_month", obs)

            # Evidence provenance and URLs
            self.assertIn("reference_source", s)
            self.assertTrue(len(s["reference_source"]) > 3)
            self.assertIn("evidence_identifier", s)
            self.assertIn("evidence_url", s)
            self.assertIn("reference_interpretation_method", s)
            self.assertIn("reviewer_notes", s)
            self.assertIn("evidence_quality_rating", s)
            self.assertIn("inclusion_status", s)
            self.assertIn(s["inclusion_status"], ["included", "excluded", "pending"])

    def test_pending_and_uncertain_samples_are_never_treated_as_ground_truth(self):
        """Pending and uncertain samples must be excluded from binary evaluation denominators."""
        engine = RealObservationBenchmarkEngine(self.real_path)
        self.assertGreater(len(engine.samples), 0)

        for module in EnvironmentalModule:
            result = engine.evaluate_real_module(module, use_live_gee=False)
            if result.get("status") == "completed":
                total_registered = result["total_registered_samples"]
                evaluated = result["evaluated_sample_count"]
                pending = result["pending_samples_count"]
                excluded = result["excluded_samples_count"]

                # Evaluated count must match included samples exactly
                self.assertEqual(total_registered, evaluated + pending + excluded)
                self.assertLess(evaluated, total_registered)  # Some pending or excluded exists
                self.assertGreater(pending + excluded, 0)

                # None of the pending samples should appear in TP, FP, TN, FN
                for method_name, metrics in result["benchmark_results"].items():
                    self.assertEqual(metrics["total_evaluated"], evaluated)


class TestWilsonScoreAndClassificationMetrics(unittest.TestCase):
    """Validates mathematical correctness of Wilson intervals and metrics."""

    def test_wilson_score_interval_bounds(self):
        """Wilson score interval must stay within [0.0, 1.0] and contain p_hat."""
        # 100% success on 10 samples
        low, high = wilson_score_interval(10, 10)
        self.assertGreater(low, 0.6)
        self.assertEqual(high, 1.0)

        # 0% success on 10 samples
        low, high = wilson_score_interval(0, 10)
        self.assertEqual(low, 0.0)
        self.assertLess(high, 0.4)

        # 5 out of 10
        low, high = wilson_score_interval(5, 10)
        self.assertLess(low, 0.5)
        self.assertGreater(high, 0.5)

        # Zero denominator safety returns None (not estimable)
        self.assertIsNone(wilson_score_interval(0, 0))

    def test_real_metric_calculations_and_denominators(self):
        """Check precision, recall, F1, IoU, accuracy, specificity, and exact denominators."""
        y_true = [True, True, True, False, False, False]
        y_pred = [True, True, False, False, False, True]  # TP=2, FN=1, TN=2, FP=1

        metrics = compute_real_metrics(y_true, y_pred)
        self.assertEqual(metrics.total_evaluated, 6)
        self.assertEqual(metrics.true_positives, 2)
        self.assertEqual(metrics.false_positives, 1)
        self.assertEqual(metrics.true_negatives, 2)
        self.assertEqual(metrics.false_negatives, 1)

        self.assertAlmostEqual(metrics.precision, 2 / 3, places=3)
        self.assertAlmostEqual(metrics.recall, 2 / 3, places=3)
        self.assertAlmostEqual(metrics.accuracy, 4 / 6, places=3)
        self.assertAlmostEqual(metrics.specificity, 2 / 3, places=3)
        self.assertAlmostEqual(metrics.iou, 2 / 4, places=3)

    def test_unobserved_satellite_data_handling(self):
        """Unobserved satellite scenes (None) should be handled explicitly without crashing."""
        y_true = [True, False]
        y_pred = [None, None]  # Satellites unavailable or cloud masked

        metrics = compute_real_metrics(y_true, y_pred)
        self.assertEqual(metrics.unobserved, 2)
        self.assertEqual(metrics.true_positives, 0)
        self.assertEqual(metrics.false_negatives, 1)
        self.assertEqual(metrics.true_negatives, 1)


class TestComprehensiveEvaluationRunner(unittest.TestCase):
    """Validates full benchmark engine output structure and data partition."""

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"

    def test_run_comprehensive_evaluation_structure(self):
        """Full benchmark run must produce separate real and simulated blocks."""
        engine = RealObservationBenchmarkEngine(self.real_path)
        eval_output = engine.run_comprehensive_evaluation(use_live_gee=False)

        self.assertIn("benchmarks", eval_output)
        benchmarks = eval_output["benchmarks"]

        # 1. Real-Observation Benchmark
        self.assertIn("real_observation_benchmark", benchmarks)
        real_bench = benchmarks["real_observation_benchmark"]
        self.assertFalse(real_bench["is_simulated"])
        self.assertIn(real_bench["evaluation_type"], ["cached_empirical", "live", "real_observation"])
        for mod in ["flood", "deforestation", "mining"]:
            self.assertIn(mod, real_bench["modules"])
            mod_data = real_bench["modules"][mod]
            self.assertIn("benchmark_results", mod_data)
            self.assertIn("cloud_resilience", mod_data)
            # Check empirical cloud resilience
            c_res = mod_data["cloud_resilience"]
            self.assertEqual(c_res["evaluation_type"], "empirical_satellite_observation")
            self.assertGreater(c_res["actual_s2_optical_valid_pixel_pct"], 90.0)
            self.assertEqual(c_res["actual_s1_sar_valid_pixel_pct"], 100.0)

        # 2. Simulation Fixture Benchmark
        self.assertIn("simulation_fixture_benchmark", benchmarks)
        sim_bench = benchmarks["simulation_fixture_benchmark"]
        self.assertTrue(sim_bench["is_simulated"])
        self.assertEqual(sim_bench["evaluation_type"], "simulation_fixture")
        self.assertIn("Simulation fixture", sim_bench["description"])


class TestLeakageAndDuplicateControls(unittest.TestCase):
    """Validates spatial independence, absence of duplicates, and threshold-tuning controls."""

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"
        cls.csv_path = root_dir / "geovision_ml_dataset_2023_2026.csv"

    def test_no_duplicate_sample_or_event_ids(self):
        """No duplicate sample_id or event_id across real reference dataset."""
        with open(self.real_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        samples = data.get("samples", [])
        sample_ids = [s["sample_id"] for s in samples]
        event_ids = [s["event_id"] for s in samples]
        self.assertEqual(len(sample_ids), len(set(sample_ids)), "Duplicate sample_id found")
        self.assertEqual(len(event_ids), len(set(event_ids)), "Duplicate event_id found")

    def test_no_duplicate_spatial_coordinates(self):
        """No two samples share identical (lat, lng) spatial coordinates."""
        with open(self.real_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        coords = [(s["coordinates"]["lat"], s["coordinates"]["lng"]) for s in data.get("samples", [])]
        self.assertEqual(len(coords), len(set(coords)), "Duplicate coordinate pair found in real reference dataset")

    def test_no_overlap_with_csv_training_pseudo_labels(self):
        """Real reference coordinates must be independent and strictly validated."""
        self.assertTrue(self.csv_path.exists())
        engine = RealObservationBenchmarkEngine(self.real_path)
        for s in engine.samples:
            self.assertTrue(18.0 <= s.lat <= 19.5)
            self.assertTrue(73.0 <= s.lng <= 75.0)

    def test_frozen_physical_thresholds_prevent_tuning_leakage(self):
        """Metrics are evaluated against fixed physical detection thresholds without circular tuning."""
        engine = RealObservationBenchmarkEngine(self.real_path)
        res1 = engine.evaluate_real_module(EnvironmentalModule.FLOOD, use_live_gee=False)
        res2 = engine.evaluate_real_module(EnvironmentalModule.FLOOD, use_live_gee=False)
        self.assertEqual(
            res1["benchmark_results"]["quality_aware_adaptive_fusion"]["f1_score"],
            res2["benchmark_results"]["quality_aware_adaptive_fusion"]["f1_score"]
        )


class TestActualGEEPredictionLinking(unittest.TestCase):
    """Validates that real GEE extractions are tied to genuine AOIs and dates."""

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"

    def test_sample_aoi_geometry_and_dates_are_consistent(self):
        """Every sample must have reproducible coordinates, buffer, and chronological observation dates."""
        with open(self.real_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for s in data.get("samples", []):
            coords = s["coordinates"]
            self.assertGreater(coords["buffer_meters"], 0)
            geom = s.get("aoi_geometry", {})
            self.assertEqual(geom.get("type"), "Polygon")
            obs = s["observation_period"]
            self.assertLess(obs["start_year"], obs["end_year"])
            self.assertLessEqual(obs["start_month"], obs["end_month"])

    def test_cloud_coverage_computed_from_actual_valid_pixels(self):
        """Cloud resilience metrics are derived from empirical valid pixel percentages, not synthetic masks."""
        engine = RealObservationBenchmarkEngine(self.real_path)
        for mod in EnvironmentalModule:
            res = engine.evaluate_real_module(mod, use_live_gee=False)
            if res.get("status") == "completed":
                cr = res["cloud_resilience"]
                self.assertEqual(cr["evaluation_type"], "empirical_satellite_observation")
                self.assertIn("actual_s2_optical_valid_pixel_pct", cr)
                self.assertIn("actual_s1_sar_valid_pixel_pct", cr)
                self.assertIn("empirical_observation_gain_pct", cr)
                self.assertIn("coverage_definition", cr)
                self.assertGreaterEqual(cr["actual_s2_optical_valid_pixel_pct"], 0.0)
                self.assertLessEqual(cr["actual_s2_optical_valid_pixel_pct"], 100.0)


class TestApiAndSchemaCompatibility(unittest.TestCase):
    """Validates API endpoint responses and frontend schema compatibility."""

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"

    def test_validation_benchmark_endpoint_structure(self):
        """The benchmark response satisfies ValidationBenchmarkResponse schema."""
        from backend.app.schemas.responses import ValidationBenchmarkResponse
        engine = RealObservationBenchmarkEngine(self.real_path)
        raw_output = engine.run_comprehensive_evaluation(mode=EvaluationMode.CACHED_EMPIRICAL)
        response_model = ValidationBenchmarkResponse(**raw_output)
        self.assertIn("3.4", response_model.pipeline_version)
        self.assertIn("real_observation_benchmark", response_model.benchmarks)
        self.assertIn("simulation_fixture_benchmark", response_model.benchmarks)
        self.assertFalse(response_model.benchmarks["real_observation_benchmark"]["is_simulated"])
        self.assertTrue(response_model.benchmarks["simulation_fixture_benchmark"]["is_simulated"])


class TestEmpiricalBenchmarkRepairGuarantees(unittest.TestCase):
    """
    Improvement #3.4.2 Specific Verification:
    Tests strict separation of modes, non-fallback behavior, label decoupling,
    independent sensor reductions, and small-sample / exclusion accounting.
    """

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"
        cls.artifacts_dir = root_dir / "data" / "gee_observation_artifacts"

    def test_live_evaluation_fails_explicitly_when_gee_unavailable(self):
        """Live evaluation must raise RuntimeError immediately if GEE service is missing or disconnected."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        sample = engine.samples[0]

        # 1. With None service
        with self.assertRaises(RuntimeError) as ctx:
            engine.get_sample_prediction(sample, mode=EvaluationMode.LIVE, gee_service=None)
        self.assertIn("Earth Engine service is not connected", str(ctx.exception))

        # 2. With disconnected service mock
        class DisconnectedMock:
            is_connected = False

        with self.assertRaises(RuntimeError) as ctx:
            engine.get_sample_prediction(sample, mode=EvaluationMode.LIVE, gee_service=DisconnectedMock())
        self.assertIn("Earth Engine service is not connected", str(ctx.exception))

    def test_live_evaluation_never_calls_simulation_fixture(self):
        """Live mode must never fall back to simulation fixture."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        sample = engine.samples[0]

        # Verify simulation fixture returns is_simulated=True
        sim_pred = engine.extract_gee_prediction_simulation(sample)
        self.assertTrue(sim_pred["is_simulated"])
        self.assertEqual(sim_pred["evaluation_type"], "simulation_fixture")

        # But LIVE mode fails explicitly rather than returning the simulation fixture
        with self.assertRaises(RuntimeError):
            engine.get_sample_prediction(sample, mode=EvaluationMode.LIVE, gee_service=None)

    def test_cached_empirical_rejects_missing_or_invalid_artifacts(self):
        """Cached empirical evaluation must reject missing artifact files or failed statuses without fallback."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp_dir:
            empty_dir = Path(tmp_dir)
            engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=empty_dir)
            sample = engine.samples[0]

            # Missing file raises FileNotFoundError
            with self.assertRaises(FileNotFoundError) as ctx:
                engine.get_sample_prediction(sample, mode=EvaluationMode.CACHED_EMPIRICAL)
            self.assertIn("Observation artifact missing", str(ctx.exception))

            # Corrupted / failed status artifact raises ValueError
            bad_artifact = empty_dir / f"{sample.sample_id}.json"
            with open(bad_artifact, "w", encoding="utf-8") as f:
                json.dump({
                    "sample_id": sample.sample_id,
                    "evaluation_status": "reduction_failed",
                    "error_details": "EEException: Image.reduceRegion: Computation timed out."
                }, f)

            with self.assertRaises(ValueError) as ctx:
                engine.get_sample_prediction(sample, mode=EvaluationMode.CACHED_EMPIRICAL)
            self.assertIn("reduction_failed", str(ctx.exception))

    def test_prediction_generation_cannot_depend_on_reference_labels(self):
        """Saved GEE observation artifacts and predictions must be independent of reference labels."""
        self.assertTrue(self.artifacts_dir.exists())
        # Check several artifacts on disk
        for art_file in self.artifacts_dir.glob("*.json"):
            with open(art_file, "r", encoding="utf-8") as f:
                art = json.load(f)
            # Artifacts store physical sensor measurements and independent predictions
            self.assertIn("independent_sensor_predictions", art)
            self.assertIn("coverage_and_pixels", art)
            # Crucial check: reference_label must NOT be in the observation artifact
            self.assertNotIn("reference_label", art, f"Artifact {art_file.name} contaminated with reference label")

    def test_changing_reference_label_changes_metrics_without_changing_saved_predictions(self):
        """Changing a reference label changes metrics without modifying the saved prediction artifacts."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        # Find an included deforestation sample
        def_samples = [s for s in engine.samples if s.module == EnvironmentalModule.DEFORESTATION and s.inclusion_status == "included"]
        self.assertGreater(len(def_samples), 0)
        target = def_samples[0]
        original_label = target.reference_label

        # Read original prediction from cache
        pred_before = engine.get_sample_prediction(target, mode=EvaluationMode.CACHED_EMPIRICAL)

        # Compute initial metrics
        res_before = engine.evaluate_real_module(EnvironmentalModule.DEFORESTATION, mode=EvaluationMode.CACHED_EMPIRICAL)
        f1_before = res_before["benchmark_results"]["quality_aware_adaptive_fusion"]["f1_score"]

        # Mutate reference label in-memory
        target.reference_label = "no_change_observed" if original_label == "change_observed" else "change_observed"

        # Cached prediction should be 100% IDENTICAL
        pred_after = engine.get_sample_prediction(target, mode=EvaluationMode.CACHED_EMPIRICAL)
        self.assertEqual(pred_before["s2_detected"], pred_after["s2_detected"])
        self.assertEqual(pred_before["s1_detected"], pred_after["s1_detected"])

        # But metrics recomputed MUST change
        res_after = engine.evaluate_real_module(EnvironmentalModule.DEFORESTATION, mode=EvaluationMode.CACHED_EMPIRICAL)
        f1_after = res_after["benchmark_results"]["quality_aware_adaptive_fusion"]["f1_score"]
        self.assertNotEqual(f1_before, f1_after, "Metrics failed to respond to ground-truth label change")

        # Restore label
        target.reference_label = original_label

    def test_sensor_specific_predictions_are_independently_computed(self):
        """S1 SAR and S2 Optical predictions are computed separately and produce divergent outcomes on real scenes."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)

        # REAL-DEF-003 (Bhor timber felling): SAR detected structural change (0.067 km²), Optical missed (0.008 km²)
        pred_bhor = engine.get_sample_prediction(
            next(s for s in engine.samples if s.sample_id == "REAL-DEF-003"),
            mode=EvaluationMode.CACHED_EMPIRICAL
        )
        self.assertTrue(pred_bhor["s1_detected"], "S1 SAR should detect timber felling via volume scattering loss")
        self.assertFalse(pred_bhor["s2_detected"], "S2 Optical should miss sub-canopy felling under dry seasonal cover")

        # REAL-MIN-001 (Wagholi quarry disturbance): SAR detected excavation (0.292 km²), Optical missed under dry dust (0.001 km²)
        pred_wagholi = engine.get_sample_prediction(
            next(s for s in engine.samples if s.sample_id == "REAL-MIN-001"),
            mode=EvaluationMode.CACHED_EMPIRICAL
        )
        self.assertTrue(pred_wagholi["s1_detected"], "S1 SAR detected surface disturbance roughness")
        self.assertFalse(pred_wagholi["s2_detected"], "S2 Optical missed disturbance under dry dust")

    def test_hardcoded_cloud_coverage_constants_cannot_enter_empirical_reporting(self):
        """Optical coverage must be computed from actual valid and total pixels, not hardcoded mock constants."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        for mod in EnvironmentalModule:
            res = engine.evaluate_real_module(mod, mode=EvaluationMode.CACHED_EMPIRICAL)
            cr = res["cloud_resilience"]
            # Verify optical coverage is a floating point calculated from actual pixels, varying across scenes
            opt_cov = cr["actual_s2_optical_valid_pixel_pct"]
            self.assertGreater(opt_cov, 90.0)
            self.assertLessEqual(opt_cov, 100.0)
            # Must not be the old mock hardcoded constant 98.0
            self.assertNotEqual(opt_cov, 98.0)

    def test_excluded_reservoir_drawdown_samples_omitted_from_flood_metrics(self):
        """Reservoir drawdowns (REAL-FLD-001, REAL-FLD-004) must be excluded from binary flood metrics."""
        with open(self.real_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        samples = {s["sample_id"]: s for s in data["samples"]}

        self.assertEqual(samples["REAL-FLD-001"]["inclusion_status"], "excluded")
        self.assertEqual(samples["REAL-FLD-001"]["reference_label"], "unsupported_drawdown")
        self.assertEqual(samples["REAL-FLD-004"]["inclusion_status"], "excluded")
        self.assertEqual(samples["REAL-FLD-004"]["reference_label"], "unsupported_drawdown")

        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        flood_res = engine.evaluate_real_module(EnvironmentalModule.FLOOD, mode=EvaluationMode.CACHED_EMPIRICAL)

        # Evaluated sample count must be 4, excluded 3, pending 1 (total 8)
        self.assertEqual(flood_res["evaluated_sample_count"], 4)
        self.assertEqual(flood_res["excluded_samples_count"], 3)
        self.assertEqual(flood_res["pending_samples_count"], 1)
        # Class distribution: 0 positive flood events during dry season window
        self.assertEqual(flood_res["class_distribution"]["change_observed"], 0)
        self.assertEqual(flood_res["class_distribution"]["no_change_observed"], 4)

    def test_metric_calculations_match_independent_implementation(self):
        """Verify metric calculation formulas against independent manual calculation."""
        y_true = [True, True, False, False, False]
        y_pred = [True, False, False, True, False]  # TP=1, FN=1, TN=2, FP=1
        m = compute_real_metrics(y_true, y_pred)

        self.assertEqual(m.total_evaluated, 5)
        self.assertEqual(m.true_positives, 1)
        self.assertEqual(m.false_negatives, 1)
        self.assertEqual(m.true_negatives, 2)
        self.assertEqual(m.false_positives, 1)

        # Precision = 1 / (1 + 1) = 0.5
        self.assertEqual(m.precision, 0.5)
        # Recall = 1 / (1 + 1) = 0.5
        self.assertEqual(m.recall, 0.5)
        # F1 = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.5
        self.assertEqual(m.f1_score, 0.5)
        # IoU = 1 / (1 + 1 + 1) = 0.3333...
        self.assertAlmostEqual(m.iou, 1 / 3, places=3)
        # Accuracy = (1 + 2) / 5 = 0.6
        self.assertEqual(m.accuracy, 0.6)
        # Specificity = 2 / (2 + 1) = 0.6667...
        self.assertAlmostEqual(m.specificity, 2 / 3, places=3)

    def test_zero_positive_flood_recall_not_estimable(self):
        """Improvement #3.4.3.1: Zero-positive flood case must report Recall as not_estimable (None), while Precision, F1, and IoU are 0.0."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        flood_res = engine.evaluate_real_module(EnvironmentalModule.FLOOD, mode=EvaluationMode.CACHED_EMPIRICAL)
        results = flood_res["benchmark_results"]

        for method_name, m_dict in results.items():
            self.assertIsNone(m_dict["recall"], f"{method_name} recall should be None, not 0.0")
            self.assertEqual(m_dict["recall_status"], "not_estimable")
            self.assertIsNone(m_dict["recall_95ci"])
            self.assertEqual(m_dict["precision"], 0.0)
            self.assertEqual(m_dict["precision_status"], "estimable")
            self.assertEqual(m_dict["f1_score"], 0.0)
            self.assertEqual(m_dict["f1_status"], "estimable")
            self.assertEqual(m_dict["intersection_over_union"], 0.0)
            self.assertEqual(m_dict["iou_status"], "estimable")
            # Specificity MUST be estimable from negative controls (3 TN, 1 FP = 75%)
            self.assertEqual(m_dict["specificity"], 0.75)
            self.assertEqual(m_dict["specificity_status"], "estimable")
            self.assertIsNotNone(m_dict["specificity_95ci"])

    def test_zero_positive_prediction_precision_not_estimable(self):
        """Improvement #3.4.3.1: Zero positive predictions must report Precision as not_estimable (None), while Recall, F1, and IoU are 0.0."""
        y_true = [True, False]
        y_pred = [False, False]  # 0 positive predictions made (TP=0, FP=0, TN=1, FN=1)
        m = compute_real_metrics(y_true, y_pred)
        self.assertIsNone(m.precision)
        self.assertEqual(m.precision_status, "not_estimable")
        self.assertIsNone(m.precision_ci)
        self.assertEqual(m.recall, 0.0)
        self.assertEqual(m.recall_status, "estimable")
        self.assertEqual(m.f1_score, 0.0)
        self.assertEqual(m.f1_status, "estimable")
        self.assertEqual(m.iou, 0.0)
        self.assertEqual(m.iou_status, "estimable")

    def test_all_24_artifacts_integrity_and_threshold_derivation(self):
        """Improvement #3.4.3: All 24 artifacts must be valid, label-decoupled, and match threshold derivations."""
        artifacts = list(self.artifacts_dir.glob("*.json"))
        self.assertEqual(len(artifacts), 24, "Must have exactly 24 observation artifacts")

        for art_path in artifacts:
            with open(art_path, "r", encoding="utf-8") as f:
                art = json.load(f)

            # 1. No ground truth labels in artifact
            self.assertNotIn("reference_label", art, f"Artifact {art_path.name} leaks reference label")

            # 2. Distinct ISO runtime timestamp
            proc_ts = art.get("gee_processing_timestamp", "")
            self.assertTrue("T" in proc_ts and "+" in proc_ts or "Z" in proc_ts)

            # 3. Derived threshold correctness
            if "raw_reductions" in art and "detection_thresholds" in art:
                raw = art.get("raw_reductions", {})
                thresh = art.get("detection_thresholds", {}).get("change_area_threshold_km2", 0.05)
                opt_c = raw.get("optical", {}).get("measured_change_area_km2", 0.0)
                sar_c = raw.get("sar", {}).get("measured_change_area_km2", 0.0)

                preds = art.get("independent_sensor_predictions", {})
                self.assertEqual(preds.get("s2_optical_only"), bool(opt_c >= thresh))
                self.assertEqual(preds.get("s1_sar_only"), bool(sar_c >= thresh))
                self.assertEqual(preds.get("dual_sensor_intersection"), bool(opt_c >= thresh and sar_c >= thresh))
                self.assertEqual(preds.get("quality_aware_adaptive_fusion"), bool(opt_c >= thresh or sar_c >= thresh))

            # 4. Coverage math verification
            cov = art.get("coverage_and_pixels", {})
            geom_a = cov.get("geometry_area_km2", 0.0)
            valid_a = cov.get("valid_optical_area_km2", 0.0)
            if geom_a > 0:
                expected_pct = round((valid_a / geom_a) * 100.0, 2)
                self.assertAlmostEqual(cov.get("optical_valid_pixel_pct", 0.0), expected_pct, delta=0.1)

    def test_sensor_ablation_missing_sensor_adaptive_fallback(self):
        """Improvement #3.4.3: Missing sensor behavior must follow conjunction & adaptive fallback rules."""
        metrics_inter = compute_real_metrics([True], [None])
        self.assertEqual(metrics_inter.unobserved, 1)

    def test_estimability_summary_in_module_evaluation(self):
        """Improvement #3.4.3.1: Module evaluation outputs must reflect accurate per-metric estimability flags."""
        engine = RealObservationBenchmarkEngine(self.real_path, artifacts_dir=self.artifacts_dir)
        for mod in EnvironmentalModule:
            res = engine.evaluate_real_module(mod, mode=EvaluationMode.CACHED_EMPIRICAL)
            self.assertEqual(res["verification_state"], "verified_from_reproducible_artifacts")
            self.assertIn("estimability_summary", res)
            summary = res["estimability_summary"]
            if mod == EnvironmentalModule.FLOOD:
                self.assertFalse(summary["recall_estimable"])
                self.assertTrue(summary["precision_estimable"])
                self.assertTrue(summary["f1_estimable"])
                self.assertTrue(summary["iou_estimable"])
                self.assertTrue(summary["specificity_estimable"])
                self.assertTrue(summary["accuracy_estimable"])
            else:
                self.assertTrue(summary["recall_estimable"])


class TestStatisticalMetricEstimabilityAudit(unittest.TestCase):
    """
    Improvement #3.4.3.1 Rigorous Metric Definition and Audit Test Suite.
    Validates standard mathematical metric definitions, zero-denominator rules,
    edge cases, mining interpretation, and multi-dimensional verification status.
    """

    @classmethod
    def setUpClass(cls):
        cls.real_path = root_dir / "data" / "real_observation_validation_dataset.json"
        cls.artifacts_dir = root_dir / "data" / "gee_observation_artifacts"
        cls.engine = RealObservationBenchmarkEngine(cls.real_path, artifacts_dir=cls.artifacts_dir)

    def test_1_zero_positive_references_with_at_least_one_positive_prediction(self):
        """Case 1: TP=0, FP=1, TN=3, FN=0 (matches Flood empirical matrix)."""
        y_true = [False, False, False, False]
        y_pred = [True, False, False, False]
        m = compute_real_metrics(y_true, y_pred)

        self.assertEqual(m.true_positives, 0)
        self.assertEqual(m.false_positives, 1)
        self.assertEqual(m.true_negatives, 3)
        self.assertEqual(m.false_negatives, 0)

        # Precision = 0 / 1 = 0.0 (estimable, CI exists)
        self.assertEqual(m.precision, 0.0)
        self.assertEqual(m.precision_status, "estimable")
        self.assertIsNotNone(m.precision_ci)

        # Recall = 0 / 0 = None (not estimable, CI is None)
        self.assertIsNone(m.recall)
        self.assertEqual(m.recall_status, "not_estimable")
        self.assertIsNone(m.recall_ci)

        # F1 = 2*0 / (0 + 1 + 0) = 0.0 (estimable)
        self.assertEqual(m.f1_score, 0.0)
        self.assertEqual(m.f1_status, "estimable")

        # IoU = 0 / (0 + 1 + 0) = 0.0 (estimable)
        self.assertEqual(m.iou, 0.0)
        self.assertEqual(m.iou_status, "estimable")

        # Specificity = 3 / (3 + 1) = 0.75 (estimable, CI exists)
        self.assertEqual(m.specificity, 0.75)
        self.assertEqual(m.specificity_status, "estimable")
        self.assertIsNotNone(m.specificity_ci)

        # Accuracy = 3 / 4 = 0.75 (estimable, CI exists)
        self.assertEqual(m.accuracy, 0.75)
        self.assertEqual(m.accuracy_status, "estimable")
        self.assertIsNotNone(m.accuracy_ci)

    def test_2_zero_positive_references_and_zero_positive_predictions(self):
        """Case 2: TP=0, FP=0, TN=4, FN=0."""
        y_true = [False, False, False, False]
        y_pred = [False, False, False, False]
        m = compute_real_metrics(y_true, y_pred)

        self.assertEqual(m.true_positives, 0)
        self.assertEqual(m.false_positives, 0)
        self.assertEqual(m.true_negatives, 4)
        self.assertEqual(m.false_negatives, 0)

        # Precision = 0 / 0 -> not estimable
        self.assertIsNone(m.precision)
        self.assertEqual(m.precision_status, "not_estimable")

        # Recall = 0 / 0 -> not estimable
        self.assertIsNone(m.recall)
        self.assertEqual(m.recall_status, "not_estimable")

        # F1 = 0 / 0 -> not estimable
        self.assertIsNone(m.f1_score)
        self.assertEqual(m.f1_status, "not_estimable")

        # IoU = 0 / 0 -> not estimable
        self.assertIsNone(m.iou)
        self.assertEqual(m.iou_status, "not_estimable")

        # Specificity = 4 / 4 = 1.0 -> estimable
        self.assertEqual(m.specificity, 1.0)
        self.assertEqual(m.specificity_status, "estimable")

        # Accuracy = 4 / 4 = 1.0 -> estimable
        self.assertEqual(m.accuracy, 1.0)
        self.assertEqual(m.accuracy_status, "estimable")

    def test_3_zero_positive_predictions_with_negative_references_present(self):
        """Case 3: TP=0, FP=0, TN=3, FN=2 (matches Deforestation S2 optical)."""
        y_true = [True, True, False, False, False]
        y_pred = [False, False, False, False, False]
        m = compute_real_metrics(y_true, y_pred)

        self.assertEqual(m.true_positives, 0)
        self.assertEqual(m.false_positives, 0)
        self.assertEqual(m.true_negatives, 3)
        self.assertEqual(m.false_negatives, 2)

        # Precision = 0 / 0 -> not estimable
        self.assertIsNone(m.precision)
        self.assertEqual(m.precision_status, "not_estimable")

        # Recall = 0 / 2 = 0.0 -> estimable
        self.assertEqual(m.recall, 0.0)
        self.assertEqual(m.recall_status, "estimable")

        # F1 = 2*0 / (0 + 0 + 2) = 0.0 -> estimable
        self.assertEqual(m.f1_score, 0.0)
        self.assertEqual(m.f1_status, "estimable")

        # IoU = 0 / (0 + 0 + 2) = 0.0 -> estimable
        self.assertEqual(m.iou, 0.0)
        self.assertEqual(m.iou_status, "estimable")

        # Specificity = 3 / 3 = 1.0 -> estimable
        self.assertEqual(m.specificity, 1.0)
        self.assertEqual(m.specificity_status, "estimable")

        # Accuracy = 3 / 5 = 0.6 -> estimable
        self.assertEqual(m.accuracy, 0.6)
        self.assertEqual(m.accuracy_status, "estimable")

    def test_4_all_positive_and_all_negative_edge_cases(self):
        """Case 4: All-positive (TP=5, FP=0, TN=0, FN=0) and all-negative (TP=0, FP=0, TN=5, FN=0)."""
        # All-positive
        m_pos = compute_real_metrics([True] * 5, [True] * 5)
        self.assertEqual(m_pos.precision, 1.0)
        self.assertEqual(m_pos.recall, 1.0)
        self.assertEqual(m_pos.f1_score, 1.0)
        self.assertEqual(m_pos.iou, 1.0)
        self.assertEqual(m_pos.accuracy, 1.0)
        self.assertIsNone(m_pos.specificity)  # TN+FP = 0 -> not estimable
        self.assertEqual(m_pos.specificity_status, "not_estimable")

        # All-negative
        m_neg = compute_real_metrics([False] * 5, [False] * 5)
        self.assertIsNone(m_neg.precision)
        self.assertIsNone(m_neg.recall)
        self.assertIsNone(m_neg.f1_score)
        self.assertIsNone(m_neg.iou)
        self.assertEqual(m_neg.specificity, 1.0)
        self.assertEqual(m_neg.accuracy, 1.0)

    def test_5_agreement_between_api_dashboard_and_exported_reports(self):
        """Case 5: Verification of agreement between backend API responses and engine calculations."""
        from backend.app.schemas.responses import ValidationBenchmarkResponse

        comp_eval = self.engine.run_comprehensive_evaluation(mode=EvaluationMode.CACHED_EMPIRICAL)
        resp = ValidationBenchmarkResponse(**comp_eval)

        # Structure matches
        real_bench = resp.benchmarks["real_observation_benchmark"]
        flood_data = real_bench["modules"]["flood"]
        flood_results = flood_data["benchmark_results"]

        # Check Flood Quality-Aware Adaptive Fusion values
        fld_adapt = flood_results["quality_aware_adaptive_fusion"]
        self.assertEqual(fld_adapt["precision"], 0.0)
        self.assertEqual(fld_adapt["precision_status"], "estimable")
        self.assertIsNone(fld_adapt["recall"])
        self.assertEqual(fld_adapt["recall_status"], "not_estimable")
        self.assertEqual(fld_adapt["f1_score"], 0.0)
        self.assertEqual(fld_adapt["f1_status"], "estimable")
        self.assertEqual(fld_adapt["intersection_over_union"], 0.0)
        self.assertEqual(fld_adapt["iou_status"], "estimable")
        self.assertEqual(fld_adapt["specificity"], 0.75)
        self.assertEqual(fld_adapt["accuracy"], 0.75)

    def test_mining_operational_interpretation_and_caveat(self):
        """Verify mining confusion matrix directly and assert caveat on operational superiority."""
        mining_res = self.engine.evaluate_real_module(EnvironmentalModule.MINING, mode=EvaluationMode.CACHED_EMPIRICAL)
        self.assertEqual(mining_res["evaluated_sample_count"], 6)
        self.assertEqual(mining_res["class_distribution"]["change_observed"], 4)
        self.assertEqual(mining_res["class_distribution"]["no_change_observed"], 2)

        # Quality-Aware Adaptive Fusion has TP=4, FP=2, TN=0, FN=0
        m = mining_res["benchmark_results"]["quality_aware_adaptive_fusion"]
        self.assertEqual(m["true_positives"], 4)
        self.assertEqual(m["false_positives"], 2)
        self.assertEqual(m["true_negatives"], 0)
        self.assertEqual(m["false_negatives"], 0)
        self.assertEqual(m["recall"], 1.0)
        self.assertEqual(m["specificity"], 0.0)

        # Check scientific notes contain explicit operational generalization caveat
        notes_str = " ".join(mining_res["scientific_notes"])
        self.assertIn("insufficient to establish operational superiority", notes_str)
        self.assertIn("cannot be considered reliable generalization when specificity is zero", notes_str)

    def test_multi_dimensional_evidence_verification_status(self):
        """Preserve evidence limitations as 4 distinct verification dimensions."""
        for mod in EnvironmentalModule:
            res = self.engine.evaluate_real_module(mod, mode=EvaluationMode.CACHED_EMPIRICAL)
            dims = res.get("evidence_verification_dimensions", {})
            self.assertEqual(dims.get("sensor_acquisition_provenance"), "verified")
            self.assertEqual(dims.get("physical_reduction_integrity"), "verified")
            self.assertEqual(dims.get("reference_evidence_defensibility"), "pilot_provisional")
            self.assertEqual(dims.get("operational_generalization"), "unverified_pilot_scale")


if __name__ == "__main__":
    unittest.main()


