# Anti-Pattern Catalog

Use this catalog to classify laziness-audit findings.

## 1) Hardcoded deploy-varying values

- Config, secrets, URLs, ports, environment names, credentials, branch assumptions in source.

## 2) Magic literals without domain explanation

- Numbers/strings that should be constants, enums, or config.

## 3) Structural bloat

- God files/classes, oversized functions/components, poor decomposition.

## 4) Duplicate logic

- Repeated behavior that should be extracted/shared.

## 5) Weak abstractions

- Long parameter lists, mode booleans, flag arguments, leaky boundaries.

## 6) Failure-path neglect

- Happy-path-only implementation, hidden fallbacks, weak error propagation.

## 7) Verification weakness

- Untested changed behavior, test theater, flaky acceptance without documentation.

## 8) Architecture drift

- Interface/topology changes without updated spec/plan rationale.

## 9) Dependency bloat

- Heavy dependency additions without necessity or justification.

## 10) Observability gaps

- Swallowed errors, vague logs, missing operational signals.

## 11) Style/pattern drift

- Unjustified divergence from local repo conventions and structure.

## 12) Retry without diagnosis

- Blind CI reruns without explicit root-cause hypothesis and recorded reason.

## 13) CI failure suppression

- Swallowed CI failures, ignored non-zero exits, or optimistic status reporting.

## 14) Weak CI observability

- Missing stage-level events, weak failure excerpts, or non-actionable logs.

## 15) Unstable pipeline assumptions

- Treating flaky/transient outcomes as proven fixes without evidence.
