# Scrum Master Tool

Lokaalne Scrum Masteri tööriist Jira töövoo, läbilaske, tsükliaja, SLE ja andmekvaliteedi jälgimiseks. UI loeb ning kirjutab ainult kasutaja valitud workspace'i. Jira andmeid uuendab eraldi Node.js CLI või `renew-team.command`.

## Põhivõimalused

- Team, VDE / Value Stream, ART ja Portfolio vaated.
- `Team view` esitluseks sobivate voomõõdikutega ning `Scrum Master` detailvaade prognoosi-, kvaliteedi-, workflow- ja andmetööriistadega.
- Vabalt valitav kuuvahemik, näiteks jaanuar-märts või veebruar-mai, koos eelmise sama pika vahemiku võrdlusega.
- Cycle Time scatter ning samast Cycle Time'i valimist arvutatud SLE P50/P70/P85/P95.
- Lead Time, Active Time, Cycle Time ja SLE kasutavad E-R tööpäevi. Riigipühi ilma eraldi kalendriseadistuseta maha ei arvestata.
- Throughput, velocity, WIP vanus, bug ratio, work mix, flow timing ja Time in Status.
- Data Quality vaade lähteandmete puuduste, Jira projektivahetuste ja põhjendatud mõõdikueranditega.
- CSV-de rekursiivne lugemine ning sama pileti ridade dedupe uusima `Updated` väärtuse järgi.
- Jira changelog'i täielik lehekülgede kaupa laadimine.

## Liigutatud Jira piletid

Jira import salvestab veerud `Previous issue keys` ja `Project entered`. Kui pilet on teise projekti liigutatud, siis:

- vana ja uus Jira key käsitletakse ühe piletina;
- WIP vanus ja kuupäevapõhine Cycle Time'i fallback algavad hilisemast kuupäevast: `Created` või praegusesse projekti sisenemine;
- vana key kaudu tehtud mõõdikuerand kehtib ka uuele key-le;
- Time in Status read ühendatakse key aliaste kaudu.

Pärast selle versiooni kasutuselevõttu tuleb Jira andmed uuesti tõmmata, sest vana CSV ei sisalda changelog'ist tuletatud projektivahetuse välju.

## Privaatsus ja turve

- UI ei saada andmeid võrku ega kasuta telemeetriat.
- Jira CLI teeb päringuid ainult seadistatud `JIRA_URL` aadressile.
- Jira tokenit ei kirjutata workspace'i ega `team.json` faili. Launcher küsib selle peidetud terminalisisendina või loeb `JIRA_TOKEN` keskkonnamuutujast.
- TLS sertifikaadi kontroll on vaikimisi sisse lülitatud.
- Jira CSV-d, cache ja workspace võivad sisaldada ettevõttesisest infot; jaga neid eraldi rakenduse lähtekoodist.

## Workspace contract

```text
ScrumMasterTool/
  workspace.json
  Teams/ (või teams/)
    <teamId>/
      team.json
      imports/
        *.csv
        <bucket>/*.csv
      cache/
        metrics.json
        parsed.json
        bottleneck-auto.json
        time-in-status-auto.json
        progress-history.json
```

## Käivitamine

Eeldus: Node.js 22 või uuem ja File System Access API toega Chromiumi brauser (Chrome või Edge).

```bash
npm install
npm --prefix apps/sm-tool install
npm run sm:dev
```

Arendusrakendus avaneb vaikimisi aadressil `http://localhost:5173`.

## Jira andmete uuendamine

Lihtsaim viis on käivitada workspace'i juurest `renew-team.command`. Otse CLI-ga:

```bash
JIRA_URL=https://jira.example.net \
JIRA_USERNAME=user@example.com \
JIRA_TOKEN=token \
npm run jira:pull -- --workspace /absolute/path/to/workspace --team team-folder
```

Jira Data Centeri personal access tokeni korral lisa `JIRA_AUTH=bearer`. Täielik valikute loend: `npm run jira:pull -- --help`.

Olemasolevate CSV-de analüüs:

```bash
npm run analyze -- --workspace /absolute/path/to/workspace
```

## Kontrollid

```bash
npm run check
```

Käsk teeb root- ja UI-tüübikontrolli, käivitab regressioonitestid ning ehitab production bundle'i. Mõlemas paketis saab turvakontrolli teha käsuga `npm audit`.
