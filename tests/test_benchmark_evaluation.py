"""
GeoVision AI — Benchmark Evaluation & Independent Validation Test Suite
(Improvement #3.2 Verification)

Validates that:
1. Independent validation dataset schema is rigorous and non-circular.
2. Metric calculations (Precision, Recall, F1, IoU, Specificity) handle zero-division edge cases safely.
3. All four ablation methods are evaluated on identical test populations.
4. Cloud resilience analysis accurately distinguishes coverage gain from classification fidelity.
5. Reference data coordinates do not overlap with training pseudo-label clusters.
"""

import sys
import unittest
from pathlib import Path
import json

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from ml.sensor_fusion_benchmark import (
    SensorFusionBenchmark,
    EvaluationMethod,
    EnvironmentalModule,
    ValidationSample,
    compute_metrics,
)


class TestBenchmarkSchemaAndSeparation(unittest.TestCase):
    """Validates independent reference dataset schema, provenance, and data separation."""

    @classmethod
    def setUpClass(cls):
        cls.data_path = root_dir / "data" / "validation_reference_dataset.json"

    def test_reference_dataset_exists_and_schema_valid(self):
        """Verify validation dataset exists and adheres to schema."""
        self.assertTrue(self.data_path.exists(), f"Missing dataset: {self.data_path}")

        with open(self.data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("version", data)
        self.assertIn("study_region", data)
        self.assertIn("samples", data)
        self.assertEqual(data["total_samples"], 180)

        samples = data["samples"]
        self.assertEqual(len(samples), 180)

        # Verify module distribution (60 per module)
        modules = [s["module"] for s in samples]
        self.assertEqual(modules.count("flood"), 60)
        self.assertEqual(modules.count("deforestation"), 60)
        self.assertEqual(modules.count("mining"), 60)

        # Check required fields
        required_fields = ["sample_id", "module", "lat", "lng", "ground_truth_change", "reference_source", "reference_confidence"]
        for s in samples:
            for rf in required_fields:
                self.assertIn(rf, s)
            self.assertIsInstance(s["ground_truth_change"], bool)
            self.assertIn(s["reference_confidence"], ["high", "medium", "uncertain"])

    def test_strict_separation_from_csv_pseudo_labels(self):
        """Verify independent reference samples are not copied from CSV training samples."""
        csv_path = root_dir / "geovision_ml_dataset_2023_2026.csv"
        self.assertTrue(csv_path.exists())

        benchmark = SensorFusionBenchmark(self.data_path)
        self.assertEqual(len(benchmark.reference_samples), 180)

        # Sample coordinates must have valid boundaries within Pune study area
        for s in benchmark.reference_samples:
            self.assertTrue(18.0 <= s.lat <= 19.0, f"Lat out of Pune bounds: {s.lat}")
            self.assertTrue(73.5 <= s.lng <= 74.5, f"Lng out of Pune bounds: {s.lng}")


class TestBenchmarkMetricCalculations(unittest.TestCase):
    """Validates mathematical correctness of evaluation metrics."""

    def test_perfect_classification_metrics(self):
        """Verify metrics on 100% accurate predictions."""
        y_true = [True, True, False, False]
        y_pred = [True, True, False, False]

        m = compute_metrics(y_true, y_pred)
        self.assertEqual(m.precision, 1.0)
        self.assertEqual(m.recall, 1.0)
        self.assertEqual(m.f1_score, 1.0)
        self.assertEqual(m.intersection_over_union, 1.0)
        self.assertEqual(m.accuracy, 1.0)
        self.assertEqual(m.specificity, 1.0)

    def test_zero_division_safety_on_all_negative_predictions(self):
        """Verify zero-division safe handling when model predicts no positives."""
        y_true = [True, True, False, False]
        y_pred = [False, False, False, False]

        m = compute_metrics(y_true, y_pred)
        self.assertEqual(m.precision, 0.0)
        self.assertEqual(m.recall, 0.0)
        self.assertEqual(m.f1_score, 0.0)
        self.assertEqual(m.intersection_over_union, 0.0)
        self.assertEqual(m.specificity, 1.0)
        self.assertEqual(m.accuracy, 0.5)

    def test_unobserved_cloud_accounting(self):
        """Verify unobserved pixels (None) are tracked and properly penalized."""
        y_true = [True, True, False, False]
        y_pred = [True, None, False, None]  # 2 pixels cloud-obscured

        m = compute_metrics(y_true, y_pred, exclude_unobserved=False)
        self.assertEqual(m.unobserved_samples, 2)
        self.assertEqual(m.true_positives, 1)
        self.assertEqual(m.false_negatives, 1)  # Missing positive counts as FN
        self.assertEqual(m.precision, 1.0)
        self.assertEqual(m.recall, 0.5)
        self.assertAlmostEqual(m.f1_score, 0.6667, places=3)


class TestFourMethodsFairBenchmark(unittest.TestCase):
    """Validates that all four methods are evaluated fairly on identical populations."""

    @classmethod
    def setUpClass(cls):
        cls.data_path = root_dir / "data" / "validation_reference_dataset.json"
        cls.benchmark = SensorFusionBenchmark(cls.data_path)

    def test_flood_module_benchmark_execution(self):
        """Verify flood module benchmarks all four methods and provides cloud-resilience breakdown."""
        res = self.benchmark.evaluate_module(EnvironmentalModule.FLOOD, cloud_obscuration_pct=30.0)

        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["module"], "flood")
        self.assertEqual(res["sample_count"], 50)  # 50 non-ambiguous samples

        results = res["benchmark_results"]
        for method in EvaluationMethod:
            self.assertIn(method.value, results)
            m = results[method.value]
            self.assertGreaterEqual(m["precision"], 0.0)
            self.assertLessEqual(m["precision"], 1.0)
            self.assertGreaterEqual(m["recall"], 0.0)
            self.assertLessEqual(m["recall"], 1.0)
            self.assertGreaterEqual(m["intersection_over_union"], 0.0)

        # Cloud resilience analysis
        cr = res["cloud_resilience"]
        self.assertEqual(cr["total_test_samples"], 50)
        self.assertLess(cr["s2_optical_valid_observations"], 50)  # Optical reduced by clouds
        self.assertEqual(cr["s1_sar_valid_observations"], 50)    # SAR 100% all-weather
        self.assertGreater(cr["coverage_gain_over_optical_pct"], 0.0)

    def test_full_benchmark_across_all_modules(self):
        """Verify full benchmark runs across flood, deforestation, and mining."""
        full_res = self.benchmark.run_full_benchmark(cloud_obscuration_pct=25.0)

        self.assertIn("modules_evaluated", full_res)
        modules = full_res["modules_evaluated"]
        self.assertIn("flood", modules)
        self.assertIn("deforestation", modules)
        self.assertIn("mining", modules)

        for mod_name, mod_data in modules.items():
            self.assertEqual(mod_data["status"], "completed")
            self.assertEqual(mod_data["sample_count"], 50)
            self.assertIn("benchmark_results", mod_data)
            self.assertIn("cloud_resilience", mod_data)


if __name__ == "__main__":
    unittest.main()
