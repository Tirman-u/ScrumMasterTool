# TASK 001 — README Windows/macOS Jira refresh support

## 1. Decision

`src/generate-renew-launchers.ts` peab genereerima mõlemad workspace-level helperid:

- macOS: `renew-team.command`
- Windows: `renew-team.ps1`

Repository hetkeseisus on mõlema helperi genereerimine juba olemas. README peab kirjeldama mõlemat helperit ning CLI fallback peab olema dokumenteeritud nii POSIX shelli kui Windows PowerShelli süntaksis.

## 2. Scope

- README Jira refresh peatüki täpsustamine.
- macOS helperi kasutusjuhend.
- Windows helperi kasutusjuhend.
- CLI fallback mõlemale platvormile.
- Generatori vastutuse ja väljundfailide kinnitamine.

Designer handoff ei ole vajalik: task mõjutab dokumentatsiooni ja CLI developer experience’i, mitte UI-d ega Figma artefakte.

## 3. Excluded scope

- Application code’i muutmine.
- Helperite shell-koodi muutmine.
- Jira pull’i või analyze käsu loogika muutmine.
- UI või design system muudatused.
- Workspace/cache/Teams andmete muutmine.

## 4. Repository findings

- Generator defineerib mõlemad launcher-nimed failis `src/generate-renew-launchers.ts`.
- Generator kirjutab `renew-team.command` ja `renew-team.ps1` workspace’i juurkausta.
- Mõlemad helperid on working tree’s olemas.
- macOS helper kasutab workspace’i asukohana skripti kataloogi ja toetab `SM_TOOL_REPO_DIR` override’i.
- Windows helper kasutab sama workspace/repo mudelit ja toetab PowerShell execution-policy bypass’i dokumenteerimist.
- Mõlemad helperid loevad team’id, kontrollivad salvestatud JQL-i, küsivad vajadusel Jira tokenit, käivitavad Jira pull’i ja seejärel analyze käsu.
- README dokumenteerib juba macOS-i ja Windowsi helperid.
- README olemasolev CLI fallback kasutab POSIX shelli süntaksit; Windowsi PowerShelli CLI näide tuleb eraldi lisada.
- `package.json` sisaldab generatori käsku `generate:renew-launchers`.
- Working tree sisaldab ulatuslikke olemasolevaid kasutaja muudatusi. Neid ei tohi selle taski käigus puutuda.

## 5. Domain model

```text
Workspace
 ├── workspace.json
 ├── renew-team.command
 ├── renew-team.ps1
 └── Teams/ või teams/
      └── <teamId>/
           ├── team.json
           └── imports/jira-api/
```

Helper on workspace-level orchestration adapter, mitte domain-mõõdikute osa.

## 6. Data flow

```text
User
  ↓
renew-team.command või renew-team.ps1
  ↓
team.json + saved JQL
  ↓
npm run jira:pull
  ↓
issues.csv + time-in-status.csv
  ↓
npm run analyze
  ↓
cache/metrics.json ja muud cache-failid
  ↓
UI loeb workspace’i cache’i
```

CLI fallback möödub helperi interaktiivsest team-selection’ist ning kasutab otseselt workspace’i ja team’i argumente.

## 7. Interfaces

Dokumenteeritavad keskkonnamuutujad:

- `JIRA_URL`
- `JIRA_AUTH`
- `JIRA_USERNAME`
- `JIRA_TOKEN`
- `JIRA_MAX_ISSUES`
- `JIRA_IMPORT_BUCKET`
- `SM_TOOL_REPO_DIR`

Windows PowerShelli CLI fallback peab kasutama PowerShelli keskkonnamuutuja- ja jätkurea süntaksit:

```powershell
$env:JIRA_URL = "https://jira.company.net"
$env:JIRA_USERNAME = "user@example.com"
$env:JIRA_TOKEN = "token"

npm run jira:pull -- `
  --workspace "C:\path\to\workspace" `
  --team "team-folder"
```

## 8. Failure/data-quality behavior

README peab kirjeldama järgmisi kasutajale nähtavaid eeldusi:

- workspace’i juur peab sisaldama `workspace.json` ning `Teams/` või `teams/` kataloogi;
- repo asukoht tuleb määrata `SM_TOOL_REPO_DIR` abil, kui repo ja workspace on eri kataloogides;
- puuduv või ebarealistlik salvestatud JQL peatab helperi enne pull’i;
- puuduv Jira token küsitakse interaktiivselt;
- PowerShell execution policy blokeerimise korral kasutatakse ajutist `Bypass` käsku;
- puuduva või võimaliku truncation’iga Jira changelog’i korral jäävad CLI hoiatused nähtavaks;
- refresh puhastab ainult enda genereeritud Jira export-failid valitud import-bucket’is;
- refresh ei tohi dokumentatsiooni järgi jätta muljet, et Jira API export on append-only ajaloohoidla.

## 9. Financial-data safety

Finantsandmeid taskis ei töödelda. Rakendatavad konfidentsiaalse Jira-andmestiku reeglid:

- tokenit ei tohi README näidetes päriselt kasutada;
- tokenit ei kirjutata faili;
- issue key’d, team names, JQL, CSV-d ja cache on konfidentsiaalsed;
- näited kasutavad ainult placeholder’eid;
- `Teams/`, cache’i ega workspace’i ei tohi lisada source control’i.

Finantsandmete provenance, signal strength/data confidence ja historical reproducibility ei muutu selle dokumentatsioonitaski scope’is.

## 10. Verification plan

Developer peab:

1. Kontrollima README macOS, Windows ja CLI fallback sektsioone.
2. Kontrollima, et README nimed ühtivad generatori väljunditega.
3. Kontrollima, et generator kirjutab mõlemad helperid.
4. Kontrollima, et README kasutab ainult näidis-URL-e, kasutajanimesid ja tokeneid.
5. Käivitama `npm run check`.
6. Kontrollima Git diff’i, et application code, helperite implementation ja kasutaja workspace-andmed ei muutunud.

## 11. Acceptance criteria

1. README dokumenteerib `renew-team.command` kasutamise macOS-is.
2. README dokumenteerib `renew-team.ps1` kasutamise Windows PowerShellis.
3. README dokumenteerib Windows execution-policy fallback’i.
4. README dokumenteerib CLI fallback’i POSIX shelli ja PowerShelli vormis.
5. README kirjeldab `SM_TOOL_REPO_DIR` kasutamist.
6. Generator loob mõlemad helperid.
7. README ja generator kasutavad samu failinimesid.
8. Tokenid, päris JQL ja konfidentsiaalsed workspace-andmed ei satu dokumentatsiooni.
9. Selle taski käigus ei muudeta application code’i ega helperite implementation’i.

## 12. Open decisions

- Kas Windows CLI fallback peab dokumenteerima ka `npm.cmd` alternatiivi?
- Kas refresh-juhised jäävad README-sse või eraldatakse hiljem `docs/refresh.md` faili?
- Kas helperite genereeritud väljundeid tuleb tulevikus CI-s canonical generator-output’iga võrrelda?
- Kas helperite cross-platform smoke-test vajab eraldi taski?

## 13. Developer handoff

1. Muuda ainult README-d, lisades Windows PowerShelli CLI fallback’i ja kontrollides olemasolevate helperijuhiste täpsust.
2. Ära muuda `renew-team.command`, `renew-team.ps1` ega `src/generate-renew-launchers.ts`, sest mõlema helperi genereerimine on juba olemas.
3. Säilita CLI fallback, `SM_TOOL_REPO_DIR`, tokeni ohutus ja workspace’i juurkausta eeldus.
4. Käivita `npm run check`.
5. Anna Mainile tagasi muudetud failide loetelu, kontrolli tulemus ja võimalikud open decisions.
