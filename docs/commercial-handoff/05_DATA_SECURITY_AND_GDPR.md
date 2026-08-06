# Data Security and GDPR

## What data is stored

**Implemented local storage**

- Jira issue keys, previous issue keys, issue type, status, resolution, assignee, created/updated/resolved dates, story points, sprint fields.
- Time in Status duration data by issue and status.
- Team names, team descriptions, Jira JQL queries, workflow status config, SLE config, bottleneck notes, issue exclusions and reasons.
- Metrics cache, parsed issue cache and progress history.

Tõendus: `apps/sm-tool/src/types/contracts.ts`, `apps/sm-tool/src/lib/workspace.ts`, `src/jira-pull.ts`.

## Where data is stored

- User-selected local workspace directory.
- Browser IndexedDB for remembered workspace directory handles.
- Browser localStorage for Team view mode.
- No hosted application database is visible.

## Sensitive employee information

Data can contain employee-related and company-confidential information: assignee names, Jira issue keys, project movement history, team names, JQL, issue status history and bottleneck notes. Tests include example e-mail/name data, but real workspace data must be treated as confidential.

## Authentication and authorization controls

**Implemented:** Jira CLI uses Jira credentials from environment variables or terminal input. TLS certificate validation is on by default according to README.

**Not implemented:** product login, sessions, role-based access control, tenant access checks, admin permissions.

## Data isolation

**Implemented:** isolation is by local filesystem directory. A browser permission grants access to a selected directory.

**Not implemented:** SaaS tenant isolation, organization separation, row-level security, encryption boundaries or per-user access policy.

## Retention and deletion

**Implemented:** local files can be manually deleted by the user outside the app. Cache files are overwritten during analysis.

**Not implemented:** formal retention policies, account deletion, tenant deletion, data subject deletion workflow, scheduled purge.

## Logging and audit trail

**Implemented:** CLI prints operational messages to terminal. Progress snapshots are stored in cache history.

**Not implemented:** immutable audit log, access log, admin activity log, security event log, centralized log redaction.

## AI provider data flow

No AI provider flow is implemented in visible code. If AI is added later, Jira/team data sent to an AI provider must be governed by explicit consent, data minimization, retention controls and vendor DPA.

## GDPR gaps

- Controller/processor role and legal basis not defined.
- No privacy policy, DPA, subprocessors list or data processing register.
- No data export/delete request implementation.
- No consent or notice around AI processing.
- No hosted security architecture, encryption at rest, key management or tenant isolation.
- No audit log or breach response workflow.

## Security concerns before commercial launch

- Do not ship real `Teams/`, `teams/` or `workspace.json` data.
- Add product auth, org model, tenant isolation and least-privilege roles.
- Add secret storage for Jira tokens if sync becomes hosted.
- Add logs with redaction and audit trail.
- Add backup/restore and deletion workflows.
- Run dependency audit and security review before external pilots.
