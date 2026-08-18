# Executive Summary

## Mis toode see on

Scrum Master Tool on local-first veebirakendus ja Node.js CLI Jira CSV ekspordi analüüsimiseks. Rakendus aitab Scrum Masteril ja tiimijuhtidel vaadata Jira põhjal flow-mõõdikuid, SLE-d, Cycle Time'i, Lead Time'i, Active Time'i, throughput'i, WIP vanust, Time in Status signaale, andmekvaliteeti ja tiimide/voogude ülevaateid.

Tõendus: `README.md`, `apps/sm-tool/src/App.tsx`, `apps/sm-tool/src/lib/workspace.ts`, `apps/sm-tool/src/lib/metrics.ts`, `src/jira-pull.ts`.

## Peamine probleem

Toode lahendab probleemi, et Jira andmetest on Scrum Masteril raske kiiresti näha, kus töö aeglustub, milline on delivery expectation, kas andmed on usaldusväärsed ja millised teemad vajavad tiimicoaching'ut. Tööriist koondab CSV/Jira API andmed kohalikku workspace'i ning teeb nendest esitlus- ja diagnoosivaated.

## Praegune küpsustase

**Implemented:** lokaalne analüütikatööriist, CSV import, Jira pull CLI, workspace'i failipõhine andmemudel, React UI, mõõdikud ja regressioonitestid.

**Partially implemented:** Firebase Hosting staatilise UI jaoks, SAFe metric mapping, Jira saved query haldus, workspace profiles, progress history.

**Planned or suggested:** SaaS backend, multi-tenancy, autentimine, organisatsioonid, rollid, billing, AI funktsioonid, audit log, support, analytics, error monitoring, GDPR protsessid.

**Unknown:** sihtklient, hinnastus, ärimudel, õigused Jira andmete töötlemiseks, IP/omandi staatus.

## Peamised kasutajagrupid

- Scrum Masterid ja Agile Coachid.
- Team Leadid ja Engineering Managerid.
- Value Stream / VDE / ART / Portfolio taseme delivery juhid.
- Demo või sisemise tööriista kontekstis: üks kasutaja, kes omab kohalikku Jira export workspace'i.

## Tugevaimad praegused võimekused

- Local-first privaatsusmudel: UI loeb/kirjutab kasutaja valitud kausta, mitte pilvebackend'isse.
- Detailne Jira flow analytics: Cycle Time, SLE percentiles, Lead/Active/Cycle Time, velocity, WIP, forecast, bottleneck, Time in Status.
- Scrum Master vaade ja lihtsam Team view.
- Andmekvaliteedi kontrollid ning mõõdikute eelduste nähtavaks tegemine.
- Jira CLI, mis toetab saved JQL'e, issue importi ja changelog-põhist Time in Status CSV-d.
- Testid katavad parserit, mõõdikuid, Jira pull'i, working days loogikat ja UI mõõdikute normaliseerimist.

## Suurimad riskid ja lüngad

- Toode ei ole praegu SaaS: puudub backend, andmebaas, autentimine, organisatsioonid, õigused ja tenant isolation.
- Puudub subscription/billing, usage metering ja AI kulude kontroll.
- Puuduvad SaaS turbe- ja GDPR mehhanismid: audit log, retention, deletion, export, DPA protsessid, serveripoolsed ligipääsukontrollid.
- Jira andmed võivad sisaldada töötajate nimesid, issue võtmeid, JQL'e ja ettevõttesisest infot.
- AI integratsiooni koodist ei paista; AI põhiseid väiteid ei tohi turunduses kasutada.

## 200-sõnaline kokkuvõte business advisorile

Scrum Master Tool on varajase kommertsialiseerimise potentsiaaliga local-first Jira analytics tööriist Scrum Masteritele, Agile Coachidele ja delivery juhtidele. Toode ei ole veel SaaS, vaid brauseris töötav React/Vite rakendus koos Node.js CLI-ga, mis impordib Jira CSV või Jira API andmed kasutaja valitud kohalikku workspace'i. Peamine väärtus on kiire ja praktiline ülevaade tiimi flow'st: Cycle Time, Lead Time, Active Time, SLE percentiles, throughput, velocity, WIP aging, forecast, bottleneck, Time in Status ja andmekvaliteedi probleemid. Rakendus eristab esitlusvalmis Team view'd ja detailsemat Scrum Master view'd ning toetab tiimi, VDE/value stream, ART ja portfolio taseme vaateid.

Äriliselt on tugev alus Scrum Masteri töövoo ja Jira andmete diagnostika jaoks, kuid maksvate SaaS klientide vastuvõtmiseks puuduvad kriitilised komponendid: autentimine, multi-tenancy, organisatsioonid, serveripoolne andmebaas, õigused, billing, usage limits, audit log, support, error monitoring, retention/deletion ja GDPR protsessid. AI funktsioone ei ole koodist näha, seega neid ei tohiks positsioneerida olemasoleva väärtusena. Sobiv järgmine samm on privaatne demo või design partner pilot, kus local-first mudel müüakse privaatsuse eelisena, samal ajal ehitatakse eraldi SaaS foundation.
