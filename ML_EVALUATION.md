# ML Evaluation

Artifact: `logreg-synth-1.1.0`; synthetic data only; fixed seed 20261030.

- 1,600 rows across 80 customer groups.
- Train groups 0–49: 1,000 rows.
- Validation groups 50–64: 300 rows; threshold selected here.
- Held-out test groups 65–79: 300 rows.
- Threshold: 0.25.
- Test precision 0.4355; recall 0.7864; F1 0.5606; accuracy 0.5767; ROC AUC 0.7081.
- Confusion matrix: TP 81, FP 105, TN 92, FN 22.
- Predict-all-anomaly baseline F1 0.5112; simple two-feature rule F1 0.5547.

The modest lift over the simple rule and synthetic circular label-generation process are material limitations. This model is a reproducible portfolio demonstration, not a fraud model.

Runtime feature snapshots, artifact hash, version, threshold, score, contribution-ranked indicators, status, and failure context are persisted. Results prioritize human review only and cannot authorize financial mutation.

`npm run ml:evaluate` is deterministic and does not write. Use `npx tsx ml/train.ts --write` only for an intentional artifact replacement.
