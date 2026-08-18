# Product Roadmap

## Phase 1: Private demo

**Required features:** keep local-first flow stable, sanitized demo workspace, clear demo script, static hosted UI or local dev setup.

**Technical work:** remove real data from distributable source, verify `npm run check`, create anonymized example data, document browser requirements.

**UX work:** polish first-run workspace selection and import guidance.

**Security/legal:** mark as local demo; no customer data upload.

**Definition of done:** a user can run a demo without private Jira exports.

**Dependencies:** sanitized Jira-like sample data.

**Effort:** S/M.

## Phase 2: Design partner pilot

**Required features:** robust local onboarding, sample data, Jira CLI setup guide, feedback channel, known limitations page.

**Technical work:** installer/packaging decision, better error reporting without telemetry, configuration validation.

**UX work:** guided workspace setup, clearer Data Monitor actions.

**Security/legal:** pilot agreement, data handling instructions, no real workspace in repo.

**Definition of done:** 2-3 design partners can use local tool with their own data and report feedback.

**Dependencies:** target customer and support process.

**Effort:** M.

## Phase 3: First paying customers

**Required features:** billing, auth, org/workspace model, hosted data model or paid local license model, support SLA.

**Technical work:** choose architecture: local-first paid desktop/browser tool vs true SaaS. For SaaS: API, database, tenant isolation, secret vault, backups, monitoring.

**UX work:** account onboarding, Jira connection flow, admin settings, export/delete controls.

**Security/legal:** terms, privacy, DPA, security review, deletion/export processes.

**Definition of done:** customer can pay, onboard, use tool safely, receive support and delete/export data.

**Dependencies:** pricing, legal, architecture decision.

**Effort:** L/XL.

## Phase 4: Public SaaS launch

**Required features:** self-serve signup, plans/limits, docs, status page, analytics, error monitoring, onboarding emails.

**Technical work:** production-grade CI/CD, staging/prod, migration strategy, rate limiting, audit logs.

**UX work:** public onboarding, sample workspace, product tours, report exports.

**Security/legal:** GDPR readiness, subprocessors, incident response, vulnerability process.

**Definition of done:** unknown users can safely sign up and convert without manual setup.

**Dependencies:** Phase 3 SaaS foundation.

**Effort:** XL.

## Phase 5: Scale and enterprise readiness

**Required features:** SSO/SAML, SCIM, advanced RBAC, enterprise audit logs, regional data controls, API/export.

**Technical work:** tenant-level scalability, background sync workers, observability, disaster recovery tests.

**UX work:** enterprise admin console, governance around exclusions and metric definitions.

**Security/legal:** SOC 2 path, DPIA support, vendor security package.

**Definition of done:** enterprise customer can pass security/procurement review.

**Dependencies:** enterprise demand and security investment.

**Effort:** XL.
