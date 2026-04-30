# TruthfulQA Presentation Visuals

This folder contains an R Markdown version of the simulated TruthfulQA presentation workflow.

Generated outputs:

- truthfulqa_presentation_visuals.Rmd
- truthfulqa_simulated_experiment.csv
- truthfulqa_logistic_regression_results.csv
- truthfulqa_bayesian_logistic_results.csv
- truthfulqa_model_comparison_results.csv
- truthfulqa_dataset_overview.png
- truthfulqa_top_categories.png
- truthfulqa_condition_heatmap.png
- truthfulqa_task_context_lines.png
- truthfulqa_specificity_bars.png
- truthfulqa_model_comparison.png

Simulation notes:

- TruthfulQA.csv is used as the prompt bank.
- Each question is expanded across the 3 x 2 design: context level x prompt specificity.
- Task types are assigned heuristically from the question text.
- The simulation is designed to align with the draft paper's message: more context and more specific prompts lower hallucination risk.
- The Bayesian model is a logistic regression with weak normal priors and a Laplace posterior approximation, implemented directly in R so no extra Bayesian packages are required.
