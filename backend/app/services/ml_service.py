"""
GeoVision AI — ML Inference Service
Loads the trained Random Forest model and provides prediction with metadata.

Model: Experiment 2 (Leakage-Controlled)
  - 15 features (NDVI_2023 and NDVI_Change excluded)
  - 98.1% test accuracy, F1=0.981, ROC-AUC=0.998
  - Labels are rule-generated pseudo-labels, NOT independently verified ground truth

IMPORTANT LIMITATIONS (shown in every response):
  1. Labels are rule-based (NDVI thresholds), not field-verified
  2. Trained on a single pilot area (Pune) for one season (Jan–Mar)
  3. Accuracy may be inflated due to label-feature correlation
  4. Not validated as a real-world forecasting model
"""

import traceback
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ..config import settings
from .risk_engine import risk_level

# Expected feature order for the model (Experiment 2)
EXPECTED_FEATURES: List[str] = settings.MODEL_FEATURES

MODEL_LIMITATIONS = (
    "This model uses rule-generated pseudo-labels (NDVI_2023 >= 0.4 AND NDVI_Change <= -0.2) "
    "as training targets, not independently verified ground truth. It was trained on a single "
    "pilot area (Pune, India) for January–March composites (2023–2026). The reported accuracy "
    "(98.1%) may be inflated due to correlation between features and label-generating rules. "
    "Predictions are experimental risk estimates requiring field verification."
)

MODEL_METHODOLOGY = (
    "Random Forest classifier (200 trees, balanced class weights) trained on 5,000 Sentinel-2 "
    "samples. Leakage-controlled: NDVI_2023 and NDVI_Change excluded from features. Top "
    "predictors: NDWI_Change (39.4%), NDWI_2023 (17.9%), NDBI_Change (16.2%), NDBI_2023 (9.5%). "
    "5-fold cross-validation accuracy: 97.84%."
)


class MLService:
    """Manages the trained RF model lifecycle and inference."""

    def __init__(self):
        self.model = None
        self.model_loaded: bool = False
        self.model_version: str = "rf-v2-leakage-controlled"
        self.error_message: str = ""

    def load_model(self):
        """Attempt to load the joblib model file."""
        model_path = settings.MODEL_PATH
        if not model_path.exists():
            self.error_message = f"Model file not found: {model_path}"
            print(f"[MLService] {self.error_message}")
            return

        try:
            import joblib
            self.model = joblib.load(model_path)
            self.model_loaded = True
            if hasattr(self.model, "feature_names_in_"):
                self.feature_names = list(self.model.feature_names_in_)
            else:
                self.feature_names = settings.MODEL_FEATURES
            print(f"[MLService] Model loaded from {model_path} with {len(self.feature_names)} features")
        except Exception as e:
            self.error_message = f"Failed to load model: {e}"
            print(f"[MLService] {self.error_message}")
            traceback.print_exc()

    def predict(self, features: Dict[str, float]) -> Dict:
        """
        Run inference on a single sample.

        Args:
            features: dict mapping feature names to float values.
                      Must contain all 15 expected features.

        Returns:
            Dict with prediction, probability, risk_score, risk_level, and metadata.
        """
        expected_cols = getattr(self, "feature_names", EXPECTED_FEATURES)
        # Validate features
        missing = [f for f in expected_cols if f not in features]
        if missing:
            return {
                "error": f"Missing required features: {missing}",
                "expected_features": expected_cols,
            }

        if not self.model_loaded:
            return self._demo_prediction(features)

        try:
            # Build feature DataFrame with correct feature names in exact model order
            X = pd.DataFrame([[features[f] for f in expected_cols]], columns=expected_cols)
            prediction = int(self.model.predict(X)[0])
            probability = float(self.model.predict_proba(X)[0][1])

            # Map probability to risk score (0–100)
            r_score = int(probability * 100)
            r_level = risk_level(r_score)

            return {
                "prediction": prediction,
                "probability": round(probability, 4),
                "risk_score": r_score,
                "risk_level": r_level,
                "model_version": self.model_version,
                "feature_names": EXPECTED_FEATURES,
                "is_demo": False,
                "methodology": MODEL_METHODOLOGY,
                "limitations": MODEL_LIMITATIONS,
            }
        except Exception as e:
            return {
                "error": f"Prediction failed: {e}",
                "is_demo": True,
                "limitations": MODEL_LIMITATIONS,
            }

    def _demo_prediction(self, features: Dict[str, float]) -> Dict:
        """Fallback prediction when model is unavailable — uses simple heuristics."""
        # Use NDVI/NDWI/NDBI changes to estimate risk
        ndvi_2026 = features.get("NDVI_2026", 0.3)
        ndwi_change = features.get("NDWI_Change", 0.0)
        ndbi_change = features.get("NDBI_Change", 0.0)

        # Simple heuristic score
        score = max(0, min(100, int(
            abs(ndwi_change) * 150 +
            abs(ndbi_change) * 100 +
            max(0, 0.4 - ndvi_2026) * 100
        )))
        prediction = 1 if score >= 50 else 0
        probability = score / 100.0

        return {
            "prediction": prediction,
            "probability": round(probability, 4),
            "risk_score": score,
            "risk_level": risk_level(score),
            "model_version": "demo-heuristic",
            "feature_names": EXPECTED_FEATURES,
            "is_demo": True,
            "methodology": "Demo fallback: heuristic scoring based on index changes (model file unavailable).",
            "limitations": MODEL_LIMITATIONS + " NOTE: This result used a heuristic fallback, not the trained model.",
        }

    def get_feature_importance(self) -> List[Dict]:
        """Load feature importance from the saved CSV."""
        fi_path = settings.FEATURE_IMPORTANCE_PATH
        if not fi_path.exists():
            return [{"Feature": f, "Importance": 1.0 / len(EXPECTED_FEATURES)}
                    for f in EXPECTED_FEATURES]
        try:
            import pandas as pd
            df = pd.read_csv(fi_path)
            return df.to_dict(orient="records")
        except Exception:
            return []

    def get_experiment_comparison(self) -> List[Dict]:
        """Load experiment comparison from the saved CSV."""
        ec_path = settings.EXPERIMENT_COMPARISON_PATH
        if not ec_path.exists():
            return []
        try:
            import pandas as pd
            df = pd.read_csv(ec_path)
            return df.to_dict(orient="records")
        except Exception:
            return []


# ── Singleton ──────────────────────────────────────────────────────────
ml_service = MLService()
