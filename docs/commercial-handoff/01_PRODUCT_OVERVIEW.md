# Product Overview

## Product purpose

Scrum Master Tool aitab Scrum Masteril Jira andmetest teha korduvat delivery ja flow analüüsi. Rakendus kasutab kohalikke CSV importfaile või CLI-ga tõmmatud Jira andmeid ning arvutab mõõdikud kohalikku workspace'i.

Tõendus: `README.md`, `apps/sm-tool/src/lib/workspace.ts`, `src/cli.ts`, `src/jira-pull.ts`.

## Target users and roles

**Implemented**

- Scrum Master: detailne Scrum Master vaade, data monitor, workflow seadistus, SLE filter, issue exclusions.
- Team audience: Team view piiratud ja esitlussõbralike flow-mõõdikutega.
- Delivery/portfolio juht: VDE / Value Stream, ART ja Portfolio dashboard'id.

**Partial**

- SAFe rollid ja entity mapping on konfigureeritavad, kuid mitte täis SAFe operating model.
- Workspace profiles võimaldavad vaateid/grupeerimist, kuid mitte organisatsiooni- või rollipõhist ligipääsu.

**Unknown**

- Ostja persona, maksev klient, support owner, enterprise admin roll.

## Main use cases

- Jira CSV-de import ja mõõdikute arvutamine.
- Jira API-st issue ja Time in Status CSV genereerimine CLI kaudu.
- Tiimi flow tervise hindamine: throughput, Cycle Time, SLE, WIP risk, stale WIP.
- Pudelikaelte ja queue-time probleemide tuvastamine Time in Status andmetest.
- Andmekvaliteedi audit enne mõõdikute kasutamist coaching'us või juhtimises.
- Tiimide võrdlus value stream, ART või portfolio vaates.
- Esitlusvalmis Team view kasutamine tiimikoosolekul.

## Main workflows

1. Kasutaja avab veebirakenduse ja valib kohaliku workspace directory.
2. Rakendus loeb `workspace.json`, `Teams/` või `teams/` kaustad, iga tiimi `team.json`, `imports/`, `cache/` ja `manual/` failid.
3. Kasutaja loob või valib tiimi.
4. Kasutaja impordib CSV failid või käivitab CLI/launcher'i Jira andmete uuendamiseks.
5. Rakendus analüüsib failid, dedupe'ib issue read, arvutab mõõdikud ja kirjutab cache failid.
6. Kasutaja valib perioodi ja vaatab dashboard'i, detailvaadet, Cycle Time scatter'it, Time in Status ja Data Quality vaateid.
7. Kasutaja korrigeerib konfiguratsiooni: saved JQL, workflow statuses, SLE issue types, bottleneck, engineering metrics, issue exclusions.

Tõendus: `apps/sm-tool/src/App.tsx`, `apps/sm-tool/src/components/TeamDetail.tsx`, `apps/sm-tool/src/lib/workspace.ts`, `apps/sm-tool/src/lib/jira-query.ts`.

## User value

- Kiire arusaam, kas töö liigub prognoositavalt.
- SLE ja Cycle Time visualiseerimine reaalse Jira data põhjal.
- Parem coaching input: mis on pudelikael, kas WIP vananeb, kas andmed on usaldusväärsed.
- Local-first mudel vähendab andmete pilve saatmise riski.
- Scrum Master saab hoida esitluse ja diagnostika eraldi.

## Differentiation potential

**Implemented või evidence-based**

- Kohalik töö Jira ekspordiga, ilma UI võrgusaatmiseta.
- Time in Status ja flow timing ei ole lihtsalt staatuseridade summa; Lead/Active/Cycle Time on eraldi tööpäevapõhine loogika.
- SLE põhineb Cycle Time'il ja filtreeritavatel issue type'idel.
- Data Quality kontrollid on toote osa, mitte kõrvalmärkus.
- SAFe metric support tähistab ausalt `supported`, `partial` ja `external` kategooriaid.

## Current limitations

- Puudub login, registreerimine, organisatsioon, invite, member management ja rollid.
- Puudub serveripoolne data model, multi-tenancy ja tenant isolation.
- Puudub AI assistant või AI provider integration.
- Puudub billing, subscription, usage tracking ja kommertsiaalne onboarding.
- Staatiline hosting config on olemas, kuid hostitav SaaS backend puudub.
- Tööriist eeldab Chromium File System Access API tuge.
