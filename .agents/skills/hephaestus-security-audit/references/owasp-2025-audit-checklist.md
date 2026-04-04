# OWASP Top 10:2025 Audit Checklist

Use this checklist to drive `hephaestus-security-audit`.

## A01 Broken Access Control

- Are authorization checks present for all changed privileged actions?
- Are tenant/user/resource boundaries enforced consistently?
- Can caller-controlled identifiers bypass access policy?

## A02 Security Misconfiguration

- Do changed defaults expose debug/admin behavior?
- Are env/config assumptions secure by default?
- Are secrets and privileged flags externalized and validated?

## A03 Software Supply Chain Failures

- Did dependency/build/plugin/tooling versions change?
- Is integrity/provenance validation documented?
- Were risky transitive upgrades reviewed?

## A04 Cryptographic Failures

- Are secrets/tokens/keys handled safely?
- Is sensitive data protected at rest/in transit when required?
- Is crypto usage delegated to trusted libraries instead of custom primitives?

## A05 Injection

- Is untrusted input used in queries/commands/templates?
- Are parameterization/escaping/validation controls explicit?
- Are parser/serialization boundaries hardened?

## A06 Insecure Design

- Are trust boundaries explicit in spec/plan?
- Are abuse cases and non-goals documented?
- Is there a failure-safe default behavior for uncertain paths?

## A07 Authentication Failures

- Are login/session/token boundaries changed?
- Are auth flows resistant to bypass, fixation, and stale session reuse?
- Are auth failures observable and non-silent?

## A08 Software or Data Integrity Failures

- Can changed flow accept tampered artifacts or unverified data?
- Are integrity checks present at ingestion/build/deploy boundaries?
- Are update/release steps traceable and auditable?

## A09 Security Logging and Alerting Failures

- Are security-relevant failures logged with actionable context?
- Can responders detect and triage incidents from current evidence?
- Are alerting gaps explicitly called out?

## A10 Mishandling of Exceptional Conditions

- Are exceptions propagated with safe, deterministic behavior?
- Can partial-failure states corrupt data or violate invariants?
- Are retry/fallback paths explicit and non-silent?
