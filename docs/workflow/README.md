# Role-chat coordination

This project uses the repository as the shared handoff channel between the visible Codex role chats.

## Handoff sequence

```text
Main/ScrumMaster
      ↓
Architect → docs/architecture/task-NNN.md
      ↓ UI only
Designer  → docs/design/task-NNN.md
      ↓
Developer → implementation + QA handoff in docs/tasks/task-NNN.md
      ↓
QA        → verdict in docs/tasks/task-NNN.md and Main/ScrumMaster chat
      ↓
Main/ScrumMaster → user status and next-task decision
```

## Shared-file rules

- Main assigns the next task number and records the current state in `docs/tasks/task-NNN.md`.
- Architect writes the approved scope and technical handoff in `docs/architecture/task-NNN.md`.
- Designer writes a handoff in `docs/design/task-NNN.md` only when the task affects UI or Figma.
- Developer reads the approved handoffs, implements only that scope, and appends the implementation and QA handoff to `docs/tasks/task-NNN.md`.
- QA reads the same task, architecture, design, and repository diff, then appends the independent verdict to `docs/tasks/task-NNN.md` and reports it in Main/ScrumMaster.
- Main may start another task only after the QA verdict is recorded.

The files are coordination records, not a substitute for the visible chat messages. Each role chat must read the current task record before acting and write its handoff before ending.

## In-app coordinator

The `Role Workflow` view in `apps/sm-tool` is a local-first coordination board. It persists tasks, handoffs, notes and QA verdicts in browser local storage and enforces the same routing rules for a single operator:

- new tasks start at Architect;
- Designer is inserted only when UI/Figma is marked in scope;
- Developer follows the approved handoff;
- QA returns `PASS`, `PASS WITH FOLLOW-UPS`, `FAIL` or `PAUSED` to Main;
- `FAIL` blocks completion and `PASS WITH FOLLOW-UPS` closes the task with follow-ups.

This view is not a Codex runtime bridge. It cannot list, read or send messages to Codex chats because those capabilities belong to the Codex desktop runtime, not to a repository prompt or browser bundle. A future integration may implement the `ThreadCoordinator` boundary, but must be explicitly authenticated and permissioned; the local workflow remains the safe default.

## Verdict states

`PASS` closes the task. `PASS WITH FOLLOW-UPS` closes the task but keeps documented follow-ups. `FAIL` keeps the task open and routes remediation to Developer. `PAUSED` stops new work until the user gives a new instruction.

Never commit real Jira exports, cache files, `Teams/`, `teams/`, `workspace.json`, or secrets into these records.
