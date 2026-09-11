# TASK 018 — Executive UX consolidation

## Scope and coordination

Main: `01a01448-39c3-7d32-bba3-0fe9e3137e6b`.
Main's conversation scope is authoritative for this design-only task; Architect document write was interrupted. TASK 017 is closed and unchanged.

## Designer handoff — 2026-09-11

Delivered [design handoff](../design/task-018.md) and exactly three populated Figma frames in https://www.figma.com/design/QoH9hUoVftQxr73YDvmmdU:

- `2:2`: Executive Overview desktop, with consolidation/measurement annotation.
- `2:3`: Metric Insight dialog with gap-aware synthetic history and two-column explanation.
- `2:4`: Mobile Executive responsive specimen.

Scope: concise clickable metrics, single global period, shared status row, one insight system, discoverable workflow/status/work-mix setup; Team concise and SM diagnostic. Source visual tokens preserved. No app code, customer/workspace data, version, commit or deploy changes.

Validation: all three Figma view screenshots inspected; card clipping corrected; history labels aligned; final read-back confirms three auto-layout roots and Inter on all text. See design document for exact dimensions and limitations.

Measurement target: Workflow setup entry 2 → 1 actions, 50% reduction, based on source-path baseline. Not a measured user-performance improvement. Rendered app baseline validation, Figma Make comparison, browser/keyboard/screen-reader/200% behavior and usability measurement remain follow-ups.

## Main / Developer / QA gate

Awaiting Main approval/routing. No task PASS or independent QA verdict is declared. Developer must use existing contracts and implement only approved design decisions. QA independently verifies behavior, provenance, responsive accessibility and measurement baseline before Main decides completion.

## QA review — 2026-09-11

Verdict: **FAIL** (design handoff accepted as a design artifact; current implementation is not ready for the TASK 018 UX gate).

### Findings

- **P1 — terminology/discoverability mismatch.** Figma node `2:2` specifies the primary tab as `Cycle Time`; the live source renders the second `ExecutiveTeamView` tab as `Implementation Time` (`apps/sm-tool/src/components/ExecutiveViews.tsx:1128-1132`). This conflicts with the frozen Task 012 presentation mapping and makes the intended Cycle Time destination ambiguous.
- **P1 — insight dialog does not meet the handed-off readable desktop layout.** Figma node `2:3` is a 760px two-column specimen with side-by-side current/previous and explanation/provenance. The implementation caps `.metric-insight-modal` at 480px and serializes the main content as paragraphs (`apps/sm-tool/src/styles.css:210`, `apps/sm-tool/src/components/ExecutiveViews.tsx:903-923`); only the expandable detail list is two-column. This is a material scan/readability gap, although the mobile sheet/stack rule is present.
- **P1 — duplicate/hierarchically misplaced history surfaces.** Figma node `2:2` explicitly calls for consolidating repeated history into card insight and placing diagnostic distribution/Time-in-Status content under Scrum Master drill-down. Current Team Overview still renders `Delivery Trends` after `FlowTimeCards` (`ExecutiveViews.tsx:934-951`), while Scrum Master renders `Visual Analytics`, Aging Distribution and Bottleneck Duration outside the drill-down (`ExecutiveViews.tsx:956-1000`). This leaves competing overview panels and defeats the stated consolidation goal.
- **P2 — two explanation systems remain.** `FlowTimeCards` owns a `MetricTrustPopover`, while the other cards use the shared `MetricInsightModal` provider (`ExecutiveViews.tsx:402-435`, `850-931`). This violates the handoff’s one insight system and creates inconsistent help/focus behavior.
- **P2 — workflow action target is unimplemented.** The handoff’s `2:2` annotation targets a direct `Workflow & status setup` entry, while the current Scrum Master workflow remains behind a closed drill-down and nested tab (`ExecutiveViews.tsx:956-1010`). The claimed 2→1 action reduction is therefore not demonstrated.

### Passing evidence / scope

- Figma nodes `2:2` (1200×954), `2:3` (760×1027), and `2:4` (390×1009) were retrieved and visually inspected. The frames are populated, readable, and include the specified desktop/mobile hierarchy, adjacent-history/gap wording, provenance, and mobile disclosure intent.
- Source inspection confirms the modal has typed metric-specific meaning/calculation/state/provenance, adjacent-pair gating, gap-aware text, keyboard point controls, focus trap/restore, Escape and outside close. CSS confirms bottom-sheet/mobile stacking and internal scrolling rules. These were not browser/screen-reader proofs.
- Local browser smoke was unavailable: `http://localhost:5188` refused connection and Vite could not bind loopback (`EPERM`). No broad build or test was run, per the read-only design-audit scope.
- Worktree contains pre-existing `Teams/**`, cache/import/team files and `workspace.json`; they were not inspected as product changes and remain out of scope. No production/customer data was modified.

### Required follow-ups

1. Rename/expose the primary detail tab as `Cycle Time` while keeping the Task 012 semantic mapping intact.
2. Consolidate overview history and move unique Scrum Master diagnostics to the intended drill-down; remove the second trust popup in favor of the shared insight modal.
3. Implement the handed-off 760px desktop dialog grid and verify 390/320px, 200% zoom, focus, touch and screen-reader behavior.
4. Add a direct visible Workflow/status setup entry and measure the 2→1 path with the same fixture before claiming improvement.

Next step: **blocked** until Developer remediation and a fresh QA review; no next implementation task should start from this gate.

## QA re-review — 2026-09-11

Verdict: **PASS WITH FOLLOW-UPS**.

### Evidence

- Current remediation was independently inspected at `c866518`. `ExecutiveTeamView` now exposes `Cycle Time` as the primary detail tab (`apps/sm-tool/src/components/ExecutiveViews.tsx:988-994`).
- Team and Scrum Master overview history panels were removed from the rendered paths: `Delivery Trends`/`Visual Analytics` and their duplicate charts are no longer rendered in `TeamDesignView`/`ScrumMasterDesignView` (`ExecutiveViews.tsx:830-946`).
- `MetricTrustPopover` and its CSS were removed. `FlowTimeCards` now adapts trust data into the same `FlowMetricCard`/`MetricInsightModal` path; no legacy historical-series fallback remains. Typed-series current values use the selected snapshot, and period labels use `metrics.asOf` while `capturedAt` remains capture provenance (`App.tsx:6277-6281`).
- The modal now uses `.metric-insight-main-grid` with a 760px maximum width, 900px viewport cap and one-column mobile stack (`styles.css:210-221, 250-255`). Existing dialog semantics include typed metric copy, current state/reason, provenance, adjacent/gap-aware history, keyboard point interaction, focus trap/restore, Escape and outside close.
- Local validation passed: focused `tests/task-018.test.ts` 5/5; `npm run check` passed typecheck, 37 test files/225 tests and production build; `git diff --check` passed. Build emitted only the existing dynamic-import and chunk-size warnings.
- Verified writer changes route CSV imports through stable read-back/atomic `writeVerifiedFile`; build-time source mutation script is deleted and app `prebuild` is absent.
- Existing `Teams/**`, caches/imports, `workspace.json` and other dirty files were preserved as unrelated scope; no customer data was modified.

### Follow-ups / limitations

- Browser smoke was attempted fresh but remained unavailable: Vite failed to bind `127.0.0.1:5188` with `EPERM`; no live 1200/760/390/320px, 200% zoom, touch or screen-reader evidence exists.
- The 2→1 Workflow setup improvement and direct setup affordance are source/design-aligned but not user-timed/measured in a browser. Validate with the same fixture before claiming a measured usability improvement.
- Next task may begin, with responsive/browser/accessibility verification retained as follow-ups; no P0/P1 blocker remains in the inspected source or automated checks.

## Developer implementation — 2026-09-11

Implemented the approved remediation scope without touching customer/workspace data:

- consolidated flow-time explanations onto the shared MetricInsightModal path and removed the separate trust popover;
- exposed the Cycle Time tab/heading consistently and removed duplicate overview Delivery Trends/Visual Analytics panels while retaining Scrum Master drill-down diagnostics;
- changed historical period materialization to prefer the persisted observation `asOf`, retaining `capturedAt` as provenance, and made absent typed series explicitly unavailable rather than falling back to legacy semantics;
- widened the dialog to the approved readable desktop layout with stacked mobile reflow;
- routed CSV import writes through the existing verified sibling-temp/atomic-replacement writer;
- removed the build-time source mutation hook and patch script.

Focused regression coverage was added in `tests/task-018.test.ts`. Full validation is pending the required `npm run check` and `git diff --check` run; independent QA owns the verdict.
