# ============================================================
# GEOVISION AI - RANDOM FOREST EXPERIMENT SUITE
# EDI PROJECT: ENVIRONMENTAL INTELLIGENCE PLATFORM
# ============================================================
# Experiment 1: Baseline / Rule Reproduction (With Label Leakage)
# Experiment 2: Leakage-Controlled Random Forest (NDVI_2023 & NDVI_Change Excluded)
# ============================================================

import os
import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score
)

def find_dataset():
    """Locate the dataset file across common project locations."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "geovision_ml_dataset_2023_2026.csv"),
        os.path.join(script_dir, "geovision_ml_dataset_2023_2026 (1).csv"),
        os.path.join(script_dir, "..", "geovision_ml_dataset_2023_2026.csv"),
        os.path.join(script_dir, "..", "geovision_ml_dataset_2023_2026 (1).csv"),
        os.path.join(os.getcwd(), "geovision_ml_dataset_2023_2026.csv"),
        os.path.join(os.getcwd(), "geovision_ml_dataset_2023_2026 (1).csv"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)
    raise FileNotFoundError(
        "Could not find dataset. Searched locations:\n" +
        "\n".join(f" - {p}" for p in candidates)
    )

def evaluate_model(name, model, X_train, X_test, y_train, y_test, X_all, y_all, cv=5):
    """Train, cross-validate, and evaluate a Random Forest classifier."""
    print(f"\n{'='*60}")
    print(f"RUNNING: {name.upper()}")
    print(f"{'='*60}")
    print(f"Feature count: {X_train.shape[1]}")
    print(f"Features: {list(X_train.columns)}")

    # 1. 5-Fold Cross-Validation
    print(f"\nRunning {cv}-Fold Cross-Validation...")
    cv_scores = cross_val_score(model, X_all, y_all, cv=cv, scoring="accuracy")
    cv_mean = cv_scores.mean()
    cv_std = cv_scores.std()
    print(f"  CV Accuracy: {cv_mean:.4f} (+/- {cv_std:.4f})")
    print(f"  Per-fold   : {[round(float(s), 4) for s in cv_scores]}")

    # 2. Fit on Training Split
    print("\nFitting model on training split (80%)...")
    model.fit(X_train, y_train)

    # 3. Test Predictions & Probabilities
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    # 4. Metrics
    train_acc = accuracy_score(y_train, model.predict(X_train))
    test_acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred)

    print("\nPerformance Summary:")
    print(f"  Train Accuracy : {train_acc:.4f}")
    print(f"  Test Accuracy  : {test_acc:.4f}")
    print(f"  Precision      : {prec:.4f}")
    print(f"  Recall         : {rec:.4f}")
    print(f"  F1-Score       : {f1:.4f}")
    print(f"  ROC-AUC        : {auc:.4f}")
    print("\nConfusion Matrix:")
    print(cm)

    # 5. Feature Importance
    importance = pd.DataFrame({
        "Feature": X_train.columns,
        "Importance": model.feature_importances_
    }).sort_values(by="Importance", ascending=False)

    metrics = {
        "Experiment": name,
        "Num_Features": X_train.shape[1],
        "CV_Accuracy_Mean": cv_mean,
        "CV_Accuracy_Std": cv_std,
        "Train_Accuracy": train_acc,
        "Test_Accuracy": test_acc,
        "Precision": prec,
        "Recall": rec,
        "F1_Score": f1,
        "ROC_AUC": auc,
        "TN": cm[0, 0],
        "FP": cm[0, 1],
        "FN": cm[1, 0],
        "TP": cm[1, 1],
    }

    return model, metrics, cm, importance

def main():
    print("============================================================")
    print("GEOVISION AI - COMPARATIVE ML EXPERIMENTATION SUITE")
    print("EDI Project: Sentinel-2 Multi-Spectral Change Detection")
    print("============================================================")

    # Resolve output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = script_dir if os.path.basename(script_dir).lower() == "ml" else os.path.join(script_dir, "ml")
    os.makedirs(output_dir, exist_ok=True)

    # Load dataset
    data_path = find_dataset()
    print(f"\nLoading dataset from: {data_path}")
    df = pd.read_csv(data_path)
    print(f"Dataset shape: {df.shape[0]} samples x {df.shape[1]} columns")

    # Drop non-ML identifier/spatial columns from feature matrix
    df_clean = df.drop(columns=["system:index", ".geo"], errors="ignore")
    y = df_clean["Label"]
    X_all_features = df_clean.drop(columns=["Label"])

    # Define Leakage Variables
    leakage_vars = ["NDVI_2023", "NDVI_Change"]
    X_unleaked_features = X_all_features.drop(columns=leakage_vars)

    print(f"\n[!] Research Consideration - Label Rule:")
    print("    Ground Truth Rule: Label = 1 IF (NDVI_2023 >= 0.4 AND NDVI_Change <= -0.2)")
    print(f"    Leaking variables to test in Exp 1 and isolate in Exp 2: {leakage_vars}")

    # Common Train/Test Split (stratified, same random seed for exact comparability)
    indices = np.arange(len(df_clean))
    idx_train, idx_test = train_test_split(indices, test_size=0.20, random_state=42, stratify=y)

    y_train, y_test = y.iloc[idx_train], y.iloc[idx_test]

    # ============================================================
    # EXPERIMENT 1: Baseline / Rule Reproduction (With Leakage)
    # ============================================================
    X1_train = X_all_features.iloc[idx_train]
    X1_test = X_all_features.iloc[idx_test]

    model_exp1 = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    )

    rf1, m1, cm1, imp1 = evaluate_model(
        "Exp 1: Baseline (With Leakage)",
        model_exp1,
        X1_train,
        X1_test,
        y_train,
        y_test,
        X_all_features,
        y
    )

    # ============================================================
    # EXPERIMENT 2: Leakage-Controlled Random Forest
    # ============================================================
    X2_train = X_unleaked_features.iloc[idx_train]
    X2_test = X_unleaked_features.iloc[idx_test]

    model_exp2 = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    )

    rf2, m2, cm2, imp2 = evaluate_model(
        "Exp 2: Leakage-Controlled",
        model_exp2,
        X2_train,
        X2_test,
        y_train,
        y_test,
        X_unleaked_features,
        y
    )

    # ============================================================
    # COMPARISON REPORT
    # ============================================================
    comparison_df = pd.DataFrame([m1, m2])
    print("\n" + "="*80)
    print("EXPERIMENT COMPARISON SUMMARY")
    print("="*80)

    display_cols = [
        "Experiment", "Num_Features", "CV_Accuracy_Mean", "Test_Accuracy",
        "Precision", "Recall", "F1_Score", "ROC_AUC", "FP", "FN"
    ]
    print(comparison_df[display_cols].to_string(index=False))

    # Save Comparison Table
    comp_path = os.path.join(output_dir, "experiment_comparison.csv")
    comparison_df.to_csv(comp_path, index=False)
    print(f"\nComparison table saved to: {comp_path}")

    # Save Individual Feature Importances
    imp1_path = os.path.join(output_dir, "feature_importance_exp1.csv")
    imp2_path = os.path.join(output_dir, "feature_importance_exp2.csv")
    imp1.to_csv(imp1_path, index=False)
    imp2.to_csv(imp2_path, index=False)
    print(f"Feature importance (Exp 1) saved to: {imp1_path}")
    print(f"Feature importance (Exp 2) saved to: {imp2_path}")

    # Also keep standard feature_importance.csv pointing to Exp 2 (clean)
    imp2.to_csv(os.path.join(output_dir, "feature_importance.csv"), index=False)

    # Save Models
    joblib.dump(rf1, os.path.join(output_dir, "model_exp1_baseline.joblib"))
    joblib.dump(rf2, os.path.join(output_dir, "model_exp2_leakage_controlled.joblib"))
    # Save clean model as default geovision_rf_model.joblib
    joblib.dump(rf2, os.path.join(output_dir, "geovision_rf_model.joblib"))
    print(f"Models saved successfully in: {output_dir}")

    # ============================================================
    # VISUAL COMPARISON CHARTS
    # ============================================================
    try:
        import matplotlib.pyplot as plt

        # 1. Comparative Feature Importance Plot
        fig, axes = plt.subplots(1, 2, figsize=(16, 7), sharex=True)

        top_k = 10
        top1 = imp1.head(top_k)
        top2 = imp2.head(top_k)

        axes[0].barh(top1["Feature"][::-1], top1["Importance"][::-1], color="#dc2626")
        axes[0].set_title("Exp 1: Baseline (With Leakage)\nTop 10 Features", fontsize=12, fontweight="bold")
        axes[0].set_xlabel("Importance")

        axes[1].barh(top2["Feature"][::-1], top2["Importance"][::-1], color="#2563eb")
        axes[1].set_title("Exp 2: Leakage-Controlled\nTop 10 Features (No NDVI 2023/Change)", fontsize=12, fontweight="bold")
        axes[1].set_xlabel("Importance")

        plt.suptitle("GeoVision AI - Feature Importance Shift Across Experiments", fontsize=14, fontweight="bold")
        plt.tight_layout()
        chart_path = os.path.join(output_dir, "feature_importance_comparison.png")
        plt.savefig(chart_path, dpi=150)
        plt.close()
        print(f"Comparative feature importance plot saved to: {chart_path}")

        # 2. Comparative Confusion Matrix Plot
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))

        for ax, cm, title in zip(
            axes,
            [cm1, cm2],
            ["Exp 1: Baseline (With Leakage)", "Exp 2: Leakage-Controlled"]
        ):
            im = ax.imshow(cm, cmap="Blues", interpolation="nearest")
            ax.set_title(title, fontsize=11, fontweight="bold")
            ax.set_xlabel("Predicted Label")
            ax.set_ylabel("True Label")
            ax.set_xticks([0, 1])
            ax.set_yticks([0, 1])
            ax.set_xticklabels(["0: No Change", "1: Veg Loss"])
            ax.set_yticklabels(["0: No Change", "1: Veg Loss"])

            for i in range(2):
                for j in range(2):
                    color = "white" if cm[i, j] > cm.max() / 2 else "black"
                    ax.text(j, i, f"{cm[i, j]}", ha="center", va="center", color=color, fontsize=12, fontweight="bold")

        plt.tight_layout()
        cm_chart_path = os.path.join(output_dir, "confusion_matrix_comparison.png")
        plt.savefig(cm_chart_path, dpi=150)
        plt.close()
        print(f"Comparative confusion matrix plot saved to: {cm_chart_path}")

    except Exception as e:
        print(f"Note: Could not generate visual charts ({e})")

    print("\n============================================================")
    print("GEOVISION AI ML EXPERIMENT SUITE COMPLETE")
    print("============================================================")

if __name__ == "__main__":
    main()