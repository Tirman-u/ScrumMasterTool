# TASK 002 — Local role workflow verdict routing

## Main status

`in-progress`

Owner: Main/ScrumMaster  
Current stage: QA review  
Scope lock: frozen

## User objective

Make the local Role Workflow coordinator follow the required handoff rules after QA verdicts.

## Scope

- Route `PASS` and `PASS WITH FOLLOW-UPS` from QA to Main and close the task.
- Route `FAIL` from QA to Developer remediation while keeping the task blocked.
- Allow Developer remediation to return the task to QA for a new verdict.
- Preserve the QA report to Main and add an explicit Developer remediation handoff.
- Add deterministic unit tests for these transitions.

## Excluded scope

- Real Codex sidebar-chat integration.
- Pilot authentication, PIN security, provenance, Jira retry behavior, or mobile drawer behavior.
- New UI design or Figma work.

## Repository findings

- The local coordinator is implemented in `apps/sm-tool/src/components/RoleWorkflow.tsx` and `apps/sm-tool/src/lib/role-workflow.ts`.
- It persists task state and handoff messages in browser localStorage.
- It explicitly reports `Local coordinator · no external chat access`.

## Implementation handoff

- `applyQaVerdict` returns completed verdicts to Main and routes FAIL to Developer.
- `prepareRemediationHandoff` returns a blocked Developer task to QA and clears the old verdict for re-review.
- `canAdvance` permits only the blocked Developer remediation transition; completed and paused tasks cannot advance.
- `tests/role-workflow.test.ts` covers PASS, FAIL/remediation, and Designer insertion.

## QA handoff

Verify the state transitions and the handoff log independently. Confirm that:

1. PASS and PASS WITH FOLLOW-UPS end with `currentRole: main` and a closed task.
2. FAIL ends with `currentRole: developer`, `status: blocked`, a QA → Main report, and a QA → Developer remediation handoff.
3. The remediation action returns the task to QA with an active review state.
4. A closed or paused task cannot advance.
5. No external Codex chat access is claimed by the local UI.

Validation already run by Main:

- `npm run typecheck` — PASS
- `npm test` — PASS, 17 test files / 113 tests
- `npm --prefix apps/sm-tool run build` — PASS

## QA verdict

Pending independent QA review.

## Open follow-ups

- None within this task. QA’s previously reported P1 security/provenance findings are separate tasks.
