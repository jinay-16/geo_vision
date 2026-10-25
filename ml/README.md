# Machine Learning — GeoVision AI

This folder contains the machine-learning experimentation suite for GeoVision AI (EDI Project: Environmental Intelligence & Change Detection Platform).

## Overview of Experiments

To address the methodological consideration of rule-based labels, two comparative experiments are implemented in `random_forest.py`:

1. **Experiment 1: Baseline / Rule Reproduction (With Label Leakage)**
   - **Purpose**: Evaluates how well a Random Forest model reproduces the Google Earth Engine rule-based baseline.
   - **Ground Truth Rule**: `Label = 1 IF (NDVI_2023 >= 0.4 AND NDVI_Change <= -0.2)`
   - **Features**: All 17 Sentinel-2 and index features (including `NDVI_2023` and `NDVI_Change`).
   - **Result**: Yields 100% test accuracy because the tree discovers the exact threshold cuts. Documented as a baseline demonstrating label leakage.

2. **Experiment 2: Leakage-Controlled Random Forest**
   - **Purpose**: Evaluates genuine predictive capability when direct label definitions are excluded.
   - **Features Excluded**: `NDVI_2023`, `NDVI_Change` (15 features remaining).
   - **Input Features**: `B2_2026`, `B3_2026`, `B4_2026`, `B8_2026`, `B11_2026`, `B12_2026`, `NDWI_2023`, `NDWI_2026`, `NDWI_Change`, `NDBI_2023`, `NDBI_2026`, `NDBI_Change`, `NDVI_2024`, `NDVI_2025`, `NDVI_2026`.
   - **Result**: Achieves **97.84% 5-fold CV accuracy** and **98.10% test accuracy** ($F_1 = 0.9811$, $\text{ROC-AUC} = 0.9977$).

---

## Experimental Comparison

Evaluation on identical 80/20 stratified test split ($N = 1,000$ test samples, 500 Class 0 / 500 Class 1):

| Metric                       | Experiment 1 (Baseline / Leakage) | Experiment 2 (Leakage-Controlled) |
|----------------------------- |:---:                              |:---:|
| **Features Count**           | 17                                | 15 (Excluded `NDVI_2023`, `NDVI_Change`) |
| **5-Fold CV Accuracy**       | 99.94% (+/- 0.08%)                | **97.84% (+/- 0.35%)** |
| **Test Accuracy**            | 100.00%                           | **98.10%** |
| **Precision (Class 1)**      | 1.0000                            | **0.9781** |
| **Recall (Class 1)**         | 1.0000                            | **0.9840** |
| **F1-Score**                 | 1.0000                            | **0.9811** |
| **ROC-AUC**                  | 1.0000                            | **0.9977** |
| **False Positives (FP)**     | 0                                 | 11 |
| **False Negatives (FN)**     | 0                                 | 8 |

### Feature Importance Shift
- **Experiment 1**: Dominated by the leaked variables `NDVI_Change` (36.2%) and `NDVI_2023` (15.1%).
- **Experiment 2**: Moisture and built-up shifts emerge as the top physical proxies:
  1. `NDWI_Change` (~39.4%)
  2. `NDWI_2023` (~17.9%)
  3. `NDBI_Change` (~16.2%)
  4. `NDBI_2023` (~9.5%)

---

## File Structure

```
ml/
├── random_forest.py                     # Main runner for Experiment 1 & 2
├── experiment_comparison.csv             # Numerical comparison table
├── feature_importance_exp1.csv          # Exp 1 feature rankings
├── feature_importance_exp2.csv          # Exp 2 feature rankings
├── feature_importance_comparison.png    # Side-by-side importance chart
├── confusion_matrix_comparison.png      # Side-by-side confusion matrix plot
├── model_exp1_baseline.joblib           # Trained Exp 1 model
├── model_exp2_leakage_controlled.joblib # Trained Exp 2 model
└── geovision_rf_model.joblib            # Default clean model (Exp 2)
```

---

## Running the Suite

Run directly from anywhere in the project:
```bash
python ml/random_forest.py
```

## Next Steps

1. **Spatial Validation**: Transition from pixel-level random splitting to spatial block cross-validation (using coordinate points from `.geo`) to combat spatial autocorrelation.
2. **SHAP Explainability**: Apply `shap.TreeExplainer` on the Leakage-Controlled model to explain individual prediction decisions.
