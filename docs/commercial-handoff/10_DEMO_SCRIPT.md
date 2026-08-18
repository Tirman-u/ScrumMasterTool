# Demo Script

## 2-minute demo

**Required demo data:** sanitized local workspace with at least one team, issue CSV, Time in Status CSV and generated cache.

1. Open Scrum Master Tool.
2. Open remembered demo workspace.
3. Show Team view and explain the presentation-safe metrics: completion, Lead Time, Active Time, Cycle Time, delivery expectation and aged open work.
4. Switch to Scrum Master view.
5. Open Cycle Time scatter and point to P50/P70/P85/P95 SLE lines.
6. Open Data Monitor and show how missing data or metric blockers are flagged.
7. Close with bottleneck / Time in Status section as the coaching input.

**Expected outputs:** visible metrics, scatter plot, SLE values, data quality entries and bottleneck/status diagnostics.

**Possible disruptions:** browser permission prompt, missing File System Access API, missing cache if analysis was not run, private issue keys if demo data is not sanitized.

## 10-minute sales demo

**Required demo data**

- Sanitized workspace with 3-5 teams.
- At least one team with strong Time in Status data.
- At least one team with Data Monitor warnings.
- At least one moved issue example if possible.
- Saved Jira queries with non-sensitive JQL.

**Exact user actions**

1. Open the app and select the demo workspace.
2. Show the workspace/team dashboard across Teams, VDE/Value Stream, ART or Portfolio scope.
3. Filter/select a period and explain comparison to previous same-length period.
4. Select one team and show Team view.
5. Switch to Scrum Master view.
6. Walk through detailed metrics: throughput, Cycle Time, Lead/Active/Cycle, WIP risk, forecast and work mix.
7. Open Cycle Time scatter, toggle SLE issue types if useful.
8. Select an outlier and show issue exclusion with reason, but explain governance would be needed in SaaS.
9. Open Time in Status / bottleneck trend.
10. Open Data Monitor and show why some metrics may be unavailable.
11. Open import/settings area and show saved Jira query setup.
12. Explain current local-first status and SaaS roadmap honestly.

**Expected outputs**

- Dashboard and detail metrics load from local cache.
- SLE values are visible.
- Bottleneck and Data Quality entries are visible.
- Saved Jira queries are visible without secrets.

## Current product issues that could disrupt demo

- Real customer data may appear if `Teams/` local workspace is used.
- Browser may not support File System Access API.
- Jira CLI requires network/VPN and credentials; avoid live pull in demo unless prepared.
- No login means SaaS buyer may ask about tenant isolation immediately.
- No report export means screenshots are the current safest demo artifact.
