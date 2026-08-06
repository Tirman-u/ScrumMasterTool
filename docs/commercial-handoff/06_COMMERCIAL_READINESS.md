# Commercial Readiness

| Area | Current state | Evidence | Missing | Importance |
|---|---|---|---|---|
| Multi-tenancy | Not implemented | No backend/database; local workspace only in `README.md`, `apps/sm-tool/src/lib/workspace.ts` | Tenant model, org IDs, data isolation, access checks | Critical |
| Organization/workspace separation | Local workspace only | `workspace.json`, File System Access API | Hosted organizations, cloud workspaces, ownership transfer | Critical |
| User roles and permissions | Not implemented | No auth/role files visible | RBAC, admin/member/viewer roles | Critical |
| Subscription and billing | Not implemented | No Stripe/billing code | Plans, checkout, invoices, entitlements | Critical |
| Usage limits | Partial local CLI limits | `src/jira-pull.ts` max issue constants | Tenant quotas, import limits, enforcement, metering | High |
| AI cost tracking | Not implemented | No AI integration visible | Per-request telemetry, budget, model config, cost dashboard | High |
| Onboarding | Partial local README | `README.md` | SaaS signup, sample workspace, guided Jira connection | High |
| Email flows | Not implemented | No email provider code | Verify email, invites, password reset, notifications | High |
| Password reset | Not implemented | No auth provider | Identity provider or password reset system | Critical |
| Terms/privacy | Not implemented | No legal docs visible | Terms, privacy policy, DPA, cookie policy if needed | Critical |
| Support/feedback | Not implemented | No support channel code/docs visible | In-app feedback, support mailbox, SLAs | Medium |
| Product analytics | Not implemented | README says no telemetry | Privacy-aware analytics, event model | Medium |
| Error monitoring | Not implemented | No Sentry/monitoring dependency | Client/server error monitoring, alerting | High |
| Backups | Not implemented for SaaS | Local files only | Managed backups, restore tests, retention | Critical |
| Data export/deletion | Partial local file access | Local JSON/CSV files | SaaS export/delete flows, DSAR support | Critical |
| Admin tooling | Local config only | `apps/sm-tool/src/App.tsx` settings | Customer admin console, user/org management | High |
| Demo environment | Partial | Static build and local demo possible | Sanitized demo data, hosted demo, resettable tenants | High |
| Localization | Partial | UI/doc text mixed English/Estonian | Product language strategy, i18n framework | Medium |
| Deployment | Partial static hosting | `firebase.json` | Backend deploy, env management, CI/CD, staging/prod | High |
| Security posture | Partial local privacy | README privacy section | Threat model, pentest, vulnerability management | Critical |
| Jira integration | Implemented CLI, not SaaS connector | `src/jira-pull.ts` | OAuth/PAT vault, scheduled sync, connector UI | High |
| Tests | Good domain coverage | `tests/*.test.ts`, `npm run check` | E2E tests, security tests, SaaS backend tests | Medium |

## Verdict

The product is **not ready to accept paying SaaS customers**. It is suitable for a private local demo or design partner discovery if positioned honestly as a local-first Jira analytics prototype/tool. Paying SaaS readiness requires a foundation build before customer data is hosted.
