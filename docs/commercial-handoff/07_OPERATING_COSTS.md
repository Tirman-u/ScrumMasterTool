# Operating Costs

## Visible fixed and variable costs

| Cost area | Current code evidence | Product actions that generate cost | Current state |
|---|---|---|---|
| Hosting | `firebase.json` static hosting config | Serving static UI assets | Partial; exact provider cost unknown |
| Database | No hosted DB visible | None yet | Not implemented |
| Authentication | No auth provider visible | None yet | Not implemented |
| File storage | Local workspace only | Customer stores local CSV/JSON files | No SaaS file storage cost |
| Jira API | `src/jira-pull.ts` | Running CLI pull, changelog pagination | Customer/network cost, not app SaaS cost yet |
| AI/API calls | No AI integration visible | None yet | Not implemented |
| Email | No email provider visible | None yet | Not implemented |
| Monitoring | No monitoring provider visible | None yet | Not implemented |
| Analytics | README says no telemetry; no analytics dependency visible | None yet | Not implemented |
| CI/build | `npm run check`, Vite build | Developer validation/build | Local/dev cost |
| Support | No support tooling visible | Manual support only | Not implemented |

## Likely SaaS costs if commercialized

- Static and API hosting.
- Database and backups.
- Object storage for uploads/imports/cache if CSVs are hosted.
- Auth provider or identity platform.
- Jira connector infrastructure and scheduled sync workers.
- Email provider.
- Observability: logs, metrics, traces, frontend error monitoring.
- Product analytics.
- Billing platform.
- AI provider cost if AI features are added.
- Security/compliance tooling, audits and vulnerability scanning.

Exact prices are not available from the repository and should not be invented.

## Cost-generating product actions

**Implemented local**

- Jira pull CLI generates Jira API traffic and local disk writes.
- UI import/analysis uses browser CPU/memory and local disk writes.

**Future SaaS**

- User signup and auth events.
- Jira sync and changelog pagination.
- CSV upload/storage.
- Metrics calculation jobs.
- AI summaries/recommendations.
- Report generation/export.
- Product analytics and error logging.
- Backups and data retention.

## Telemetry needed for cost per customer

- Active users per organization.
- Workspace/team count.
- Imported issue count and CSV size.
- Jira sync count, pages fetched, changelog pages fetched and failures.
- Metrics job duration, CPU/memory and queue time.
- Stored raw data size, cache size and backup size.
- Report exports.
- AI requests, token counts, selected model and retries.
- Email sends.
- Error/log volume by tenant.
