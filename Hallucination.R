# ============================================================
# STAT 4970W - Data Ethics for AI Workflows
# Hallucination Analysis: Simulated Data, Logistic Regression,
# and Figure Generation
#
# Authors: Sanjit Subhash, Colin Arbuckle,
#          Derek Dembinsky, Adrian Cantrell
# University of Missouri-Columbia
# ============================================================

# ── 1. Setup ─────────────────────────────────────────────────────────────────
set.seed(4970)

library(ggplot2)
library(dplyr)
library(tidyr)
library(patchwork)

# True logistic regression coefficients (simulated)
# These match the values reported in Table 1 of the paper
beta_0    <-  1.4   # intercept
beta_ctx  <- -0.9   # context level effect (NC=0, PC=1, FC=2)
beta_spec <- -0.7   # specificity effect (General=0, Specific=1)


# ── 2. Simulate data ─────────────────────────────────────────────────────────
# 3x2 factorial design x 3 task types = 18 cells
# Target N = 150 (approx. 8-9 per cell)

df <- expand.grid(
  context_level = 0:2,
  specificity   = 0:1,
  task_type     = c("Interpretation", "Reporting", "Calculation")
)

# Replicate to reach N = 150
df <- df[rep(seq_len(nrow(df)), each = 3), ]
df <- df[sample(nrow(df), 150), ]
rownames(df) <- NULL

# Compute hallucination probability for each observation
df$log_odds     <- beta_0 + beta_ctx * df$context_level + beta_spec * df$specificity
df$prob_hall    <- 1 / (1 + exp(-df$log_odds))

# Simulate binary hallucination outcome Y_i ~ Bernoulli(pi_i)
df$hallucinated <- rbinom(nrow(df), 1, df$prob_hall)

# Readable factor labels
df$ctx_label  <- factor(df$context_level, levels = 0:2,
                         labels = c("No Context", "Partial Context", "Full Context"))
df$spec_label <- factor(df$specificity, levels = 0:1,
                         labels = c("General", "Specific"))

cat("Dataset created: N =", nrow(df), "\n")
head(df)


# ── 3. Descriptive hallucination rates ───────────────────────────────────────

rates <- df %>%
  group_by(ctx_label) %>%
  summarise(
    n      = n(),
    hall_n = sum(hallucinated),
    rate   = mean(hallucinated),
    se     = sqrt(rate * (1 - rate) / n),
    .groups = "drop"
  )

cat("\nHallucination rates by context level:\n")
print(rates)

rates_by_spec <- df %>%
  group_by(ctx_label, spec_label) %>%
  summarise(rate = mean(hallucinated), .groups = "drop")

cat("\nHallucination rates by context level and specificity:\n")
print(rates_by_spec)


# ── 4. Figure 1: left panel (bar chart) ──────────────────────────────────────

p_left <- ggplot(rates, aes(x = ctx_label, y = rate, fill = ctx_label)) +
  geom_col(width = 0.55, show.legend = FALSE) +
  geom_errorbar(aes(ymin = rate - se, ymax = rate + se),
                width = 0.15, linewidth = 0.6) +
  geom_text(aes(label = paste0(round(rate * 100), "%")),
            vjust = -0.8, size = 3.5, fontface = "bold") +
  scale_fill_manual(values = c(
    "No Context"      = "#E24B4A",
    "Partial Context" = "#EF9F27",
    "Full Context"    = "#639922"
  )) +
  scale_y_continuous(
    labels = scales::percent_format(),
    limits = c(0, 1.05),
    breaks = seq(0, 1, 0.2)
  ) +
  labs(
    x       = "Context Level",
    y       = "Proportion of Responses with Hallucination",
    title   = "Hallucination Rate by Context Level",
    caption = "Error bars = +/- 1 SE (simulated data)"
  ) +
  theme_minimal(base_size = 11) +
  theme(
    plot.title  = element_text(size = 11, face = "bold"),
    axis.title  = element_text(size = 10)
  )


# ── 5. Logistic regression model (Table 1) ───────────────────────────────────

model <- glm(hallucinated ~ context_level + specificity + task_type,
             data   = df,
             family = binomial(link = "logit"))

cat("\nLogistic regression summary:\n")
print(summary(model))

# Odds ratios with 95% confidence intervals (Wald-based)
or_table <- data.frame(
  Predictor = names(coef(model)),
  Beta_hat  = round(coef(model), 2),
  OR        = round(exp(coef(model)), 2),
  CI_lower  = round(exp(confint(model)[, 1]), 2),
  CI_upper  = round(exp(confint(model)[, 2]), 2),
  p_value   = round(summary(model)$coefficients[, 4], 3)
)

cat("\nOdds ratio table:\n")
print(or_table)

# Likelihood ratio test vs. null (intercept-only) model
null_model <- glm(hallucinated ~ 1, data = df, family = binomial())
lrt <- anova(null_model, model, test = "Chisq")
cat("\nLikelihood ratio test:\n")
print(lrt)

# Cohen's kappa (inter-rater reliability)
# Replace obs_agree with empirical value once real coding is complete
obs_agree <- 0.88
exp_agree <- 0.50
kappa     <- (obs_agree - exp_agree) / (1 - exp_agree)
cat("\nCohen's kappa (simulated placeholder):", round(kappa, 3), "\n")
cat("Target threshold: >= 0.80\n")


# ── 6. Figure 1: right panel (probability curves) ────────────────────────────

pred_grid <- expand.grid(
  context_level = seq(0, 2, by = 0.05),
  specificity   = 0:1,
  task_type     = "Interpretation"   # held at reference level
)

pred_grid$prob       <- predict(model, newdata = pred_grid, type = "response")
pred_grid$spec_label <- factor(pred_grid$specificity, levels = 0:1,
                                labels = c("General Prompt", "Specific Prompt"))

p_right <- ggplot(pred_grid,
                  aes(x = context_level, y = prob,
                      color = spec_label, linetype = spec_label)) +
  geom_line(linewidth = 1.1) +
  scale_color_manual(values = c(
    "General Prompt"  = "#E24B4A",
    "Specific Prompt" = "#378ADD"
  )) +
  scale_linetype_manual(values = c(
    "General Prompt"  = "solid",
    "Specific Prompt" = "dashed"
  )) +
  scale_x_continuous(
    breaks = 0:2,
    labels = c("0\nN(None)ct", "1\nPa(Partial)ct", "2\nFu(Full)ct")
  ) +
  scale_y_continuous(
    labels = scales::percent_format(),
    limits = c(0, 1),
    breaks = seq(0, 1, 0.2)
  ) +
  labs(
    x        = "Context Level (Numeric)",
    y        = "P(Hallucination = 1)",
    title    = "Logistic Regression:\nP(Hallucination) by Context & Prompt Type",
    color    = NULL,
    linetype = NULL,
    caption  = "Simulated coefficients: b0=1.4, b1=-0.9, b2(specific)=-0.7"
  ) +
  theme_minimal(base_size = 11) +
  theme(
    legend.position = "top",
    plot.title      = element_text(size = 11, face = "bold"),
    axis.title      = element_text(size = 10)
  )


# ── 7. Combine panels and export Figure 1 ────────────────────────────────────

fig1 <- (p_left | p_right) +
  plot_annotation(
    title = "AI Hallucination Rate by Context Level -- STAT 4970W (Simulated Data)",
    theme = theme(
      plot.title = element_text(size = 12, face = "bold", hjust = 0.5)
    )
  )

# Create img/ directory if it does not exist
if (!dir.exists("img")) dir.create("img")

ggsave("img/hallucination_plots.png", fig1,
       width = 10, height = 4.5, dpi = 300)

cat("\nFigure 1 saved to img/hallucination_plots.png\n")
cat("Done.\n")
