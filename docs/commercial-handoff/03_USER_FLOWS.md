# User Flows

## Registration and login

**Current state:** Planned / not implemented.

Koodis ei paista registreerimist, login'i, session management'i, password reset'i ega identity provider integration'it. `apps/sm-tool` on static React app, mis töötab kohalikult valitud workspace'iga.

**Works well:** local-first kasutus ei nõua kontot.

**Incomplete:** SaaS kasutaja identiteet, org membership, role-based permissions ja audit trail puuduvad.

## Workspace or organization creation

**Current state:** Workspace implemented locally; organization planned.

Kasutaja valib `showDirectoryPicker` kaudu kohaliku kausta. Rakendus loeb/kirjutab `workspace.json` ja tiimikaustu. Viimased workspace'id salvestatakse IndexedDB-sse.

Tõendus: `apps/sm-tool/src/lib/workspace.ts`, `README.md`.

**Works well:** privaatsussõbralik kohaliku kausta mudel; workspace contract on dokumenteeritud.

**Incomplete:** organisatsioonid, tenant boundary, cloud workspace creation ja server-side storage puuduvad.

## Team creation

**Current state:** Implemented.

Kasutaja saab lisada tiimi; rakendus loob failistruktuuri `team.json`, `imports`, `cache`, `manual`. Team config sisaldab done, SLE, mapping, velocity, workflow ja Jira query seadistusi.

Tõendus: `apps/sm-tool/src/lib/workspace.ts`, `apps/sm-tool/src/types/contracts.ts`.

**Works well:** sobib üksikkasutaja kohalikuks analüüsiks.

**Incomplete:** tiimi omanikud, liikmed, permissions ja shared access puuduvad.

## Adding or inviting members

**Current state:** Planned / not implemented.

Liikmete lisamise, invite'i, e-maili või rollide koodi ei paista. Assignee on Jira andmeväli, mitte rakenduse kasutaja.

**Works well:** ei kohaldu.

**Incomplete:** kõik SaaS collaboration flow'd.

## Core Scrum Master workflow

**Current state:** Implemented local workflow.

1. Ava app.
2. Vali workspace.
3. Loo või vali team.
4. Impordi CSV failid või uuenda Jira data CLI-ga.
5. Käivita analysis/recalculation.
6. Vali periood: kuu, range, YTD või all-time.
7. Vaata dashboard'i, Team view'd või Scrum Master view'd.
8. Uuri Cycle Time scatter'it, SLE overlay'd, Time in Status, bottleneck, WIP ja Data Monitorit.
9. Muuda workflow/SLE/JQL/engineering metrics seadeid.
10. Välista põhjendatud anomaaliad ja recalculcate.

Tõendus: `apps/sm-tool/src/App.tsx`, `apps/sm-tool/src/components/TeamDetail.tsx`, `apps/sm-tool/src/lib/workspace.ts`, `apps/sm-tool/src/lib/metrics.ts`.

**Works well:** flow analytics ja andmekvaliteet on tihedalt seotud Scrum Masteri praktikaga.

**Incomplete:** guided onboarding, explainable recommendations, shared reports ja approval workflows puuduvad.

## AI-assisted workflows

**Current state:** Planned / not implemented.

Koodist ei paista OpenAI, LLM, embeddings, promptide, model config'i ega AI API call'e.

**Works well:** ei kohaldu.

**Incomplete:** AI summary, coaching suggestions, natural-language report generation, AI cost tracking, consent ja provider data flow.

## Reports and exports

**Current state:** Partial.

UI kuvab dashboard'id, graafikud, tabelid ja detailandmed. CLI kirjutab Jira import CSV-d. Rakendus kirjutab cache JSON faile.

Tõendus: `apps/sm-tool/src/App.tsx`, `apps/sm-tool/src/components/TeamDetail.tsx`, `src/jira-pull.ts`, `apps/sm-tool/src/lib/workspace.ts`.

**Works well:** demo ja ekraanipõhine tiimipresentatsioon.

**Incomplete:** PDF/PowerPoint export, public/share links, scheduled reports ja customer-safe anonymized exports puuduvad.

## Settings and administration

**Current state:** Local settings implemented; SaaS administration planned.

Implemented settings: team config, saved Jira queries, metric visibility, workspace profiles, SLE issue types, workflow statuses, bottleneck entries, issue exclusions, engineering metrics.

Tõendus: `apps/sm-tool/src/App.tsx`, `apps/sm-tool/src/lib/jira-query.ts`, `apps/sm-tool/src/types/contracts.ts`.

**Works well:** tugev kohaliku workspace'i konfiguratsioon.

**Incomplete:** global admin, organization settings, billing settings, identity management, data retention, audit log, support settings.
