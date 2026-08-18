# Scrum Master Tool

Lokaalne Scrum Masteri tööriist Jira töövoo, läbilaske, tsükliaja, SLE ja andmekvaliteedi jälgimiseks. UI loeb ning kirjutab ainult kasutaja valitud workspace'i. Jira andmeid uuendab eraldi Node.js CLI, macOS helper `renew-team.command` või Windows helper `renew-team.ps1`.

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

Arenduse eeldus on Node.js 22 või uuem ja File System Access API toega Chromiumi brauser (Chrome või Edge). Generated Jira helper vajab kasutaja masinas Node.js 18+ runtime'i `PATH`-is.

### Node.js distributsiooni staatus

- **CURRENT:** repository arendus ja CI kasutavad Node.js 22; generated Jira helper töötab kasutaja masinas Node.js 18 või uuema versiooniga.
- **PARTIAL:** workspace sisaldab bundled Jira runneri JavaScript-faili ja helper-faile, kuid need ei sisalda Node.js runtime'i.
- **MISSING:** kui `node` ei ole kasutaja `PATH`-is leitav, tuleb kasutajal paigaldada Node.js 18+ ja avada uus Terminali või PowerShelli aken. Rakendus ei paigalda runtime'i automaatselt.

```bash
npm install
npm --prefix apps/sm-tool install
npm run sm:dev
```

Arendusrakendus avaneb vaikimisi aadressil `http://localhost:5173`.

## Jira andmete uuendamine

Helperid tuleb käivitada workspace'i juurest ehk samast kaustast, kus asuvad `workspace.json` ja `Teams/` või `teams/`. Tavalises voos kasutavad need workspace'i lokaalset `sm-tool/jira-pull.mjs` runner'it: repo rada ega `npm` käsku ei ole vaja määrata.

Workspace'i juurkausta helperid ja bundled runner'i paigutuse genereerib `npm run generate:renew-launchers`: generaator haldab nii `renew-team.command` kui ka `renew-team.ps1` faili. Ära muuda neid faile käsitsi; uuenda vajadusel generaatori väljundit generaatori kaudu. Pärast edukat Jira pull'i ava rakendus ja vajuta **Recalculate**, et uuendada mõõdikud ja cache.

### macOS

1. Ava **Terminal**.
2. Käivita workspace'i juurest `renew-team.command` (seda võib Finderist Terminali aknasse lohistada).
3. Sisesta küsitud Jira URL, tiim(id) ja token.
4. Pärast edukat pull'i ava rakendus ja vajuta **Recalculate**.

Näide:

```bash
zsh "/Users/yourname/Documents/ScrumMasterTool/renew-team.command"
```

### Windows

`renew-team.cmd` on Windowsi põhivool: selle võib workspace'i kaustas topeltklõpsata. Wrapper avab PowerShelli, hoiab akna vea korral nähtaval ja käivitab workspace'i lokaalse `sm-tool/jira-pull.mjs` runner'i.

1. Ava workspace Exploreris.
2. Topeltklõpsa `renew-team.cmd`.
3. Sisesta küsitud Jira URL, tiim(id) ja token.
4. Pärast edukat pull'i ava rakendus ja vajuta **Recalculate**.

Kui topeltklõpsu asemel on vaja PowerShelli otse kasutada, on `renew-team.ps1` fallback:

```powershell
cd "C:\Users\yourname\Documents\SmToolWorkspace"
.\renew-team.ps1
```

Kui PowerShell blokeerib lokaalse scripti, käivita see ainult selleks korraks bypass režiimis:

```powershell
powershell -ExecutionPolicy Bypass -File ".\renew-team.ps1"
```

### Helperi kasutamine

Helper küsib tiimi numbri:

```text
Select team to renew:
1) TEAM A
2) TEAM B
Team number(s):
```

Sisesta üks number, mitu numbrit komaga/tühikuga eraldatult või `all`.

Kui küsitakse Jira tokenit, kleebi Jira Personal Access Token ja vajuta **Enter**. Tokenit ei kirjutata faili. Kui tahad tokeni ette anda keskkonnamuutujana:

macOS:

```bash
export JIRA_TOKEN="your-token"
```

Windows PowerShell:

```powershell
$env:JIRA_TOKEN = "your-token"
```

Jira Data Centeri personal access tokeni korral kasuta vaikimisi `JIRA_AUTH=bearer`. Basic auth'i korral määra ka kasutajanimi:

macOS:

```bash
export JIRA_AUTH="basic"
export JIRA_USERNAME="user@example.com"
```

Windows PowerShell:

```powershell
$env:JIRA_AUTH = "basic"
$env:JIRA_USERNAME = "user@example.com"
```

### Täiustatud CLI fallback (valikuline)

Kui generated helperit kasutada ei saa, võib arenduskeskkonnas sama importi käivitada repo CLI-ga. See on eraldi fallback, mitte tavalise workspace helperi eeltingimus:

```bash
JIRA_URL=https://jira.company.net \
JIRA_USERNAME=user@example.com \
JIRA_TOKEN=token \
npm run jira:pull -- --workspace /absolute/path/to/workspace --team team-folder
```

Windows PowerShellis kasuta `$env:` süntaksit:

```powershell
$env:JIRA_URL = "https://jira.company.net"
$env:JIRA_USERNAME = "user@example.com"
$env:JIRA_TOKEN = "token"

npm.cmd run jira:pull -- `
  --workspace "C:\Users\yourname\Documents\SmToolWorkspace" `
  --team "team-folder"
```

PowerShelli jätkurea backtick (`` ` ``) peab olema rea viimane märk; selle järel ei tohi olla tühikuid ega kommentaari. Kui `npm` ei ole PowerShellis leitav, kasuta Windowsi npm-käivitit `npm.cmd`, nagu näites.

Kui PowerShelli execution policy blokeerib Node/npm käsu või lokaalse helperi, käivita PowerShell selle sessiooni jaoks bypass-režiimis:

```powershell
powershell -ExecutionPolicy Bypass -Command '& npm.cmd run jira:pull -- --workspace "C:\Users\yourname\Documents\SmToolWorkspace" --team "team-folder"'
```

Täielik valikute loend: `npm run jira:pull -- --help`.

Olemasolevate CSV-de analüüs:

```bash
npm run analyze -- --workspace /absolute/path/to/workspace
```

## Kontrollid

```bash
npm run check
```

Käsk teeb root- ja UI-tüübikontrolli, käivitab regressioonitestid ning ehitab production bundle'i. Mõlemas paketis saab turvakontrolli teha käsuga `npm audit`.
