# Scrum Master Tool (V1, Offline)

V1 sisaldab:
- Workspace picker (`/teams` lugemine)
- Teami lisamine (`team folder + team.json`)
- CSV import tiimi `imports/` alla:
  - `imports/` (root)
  - `imports/YYYY-MM`
  - `imports/<custom-folder>`
- Recursive import lugemine (`imports` alamkaustad toetatud)
- Dedupe (`issue key`, uusim `updated`)
- `cache/parsed.json` ja `cache/metrics.json` genereerimine
- Team Health dashboard + team detail scatter chart percentile joontega
- Advanced team config on UI-s peidetud (optional)

## Offline & Privacy

- Ei tee ühtegi Jira API call'i.
- Ei kasuta telemetry/analytics/error-reporting teenuseid.
- Töötab ainult kasutaja valitud lokaalse workspace kaustaga.
- Cache salvestatakse ainult lokaalsesse failisüsteemi.

## Workspace contract

```text
ScrumMasterTool/
  workspace.json
  teams/
    <teamId>/
      team.json
      imports/
        *.csv
        <bucket>/*.csv
      cache/
        metrics.json
        parsed.json
```

## UI käivitamine

```bash
cd /Users/oscartirman/Documents/ScrumMasterTool
npm run sm:install
npm run sm:dev
```

## CLI

```bash
npm run analyze -- --workspace /absolute/path/to/workspace
```

## Unit testid

```bash
npm test
```

Testid katavad muu hulgas:
- percentile.inc arvutuse
- cycle time arvutuse
- CSV duplicate-header merge
- recursive import folder lugemise
