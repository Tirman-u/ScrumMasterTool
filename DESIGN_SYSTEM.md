# Scrum Master Tool - UI reeglid

## Eesmärk

Rakendus on korduvaks tööks mõeldud operatiivne Scrum Masteri töölaud. Esmane prioriteet on kiire skannimine, võrreldavad mõõdikud ja selge andmeallikas, mitte turunduslik visuaal.

## Paigutus

- Desktopil kasutatakse püsivat 248 px külgriba ja kuni 1680 px sisuala.
- Alla 1100 px muutub navigatsioon külgpaneeliks, mille avab menüünupp.
- Scrum Masteri detailvaate põhimõõdikud kasutavad laiekraanil kuni nelja veergu; Team view kolme. Mobiilis on üks veerg.
- Tabelid jäävad semantilisteks tabeliteks ning liiguvad kitsal ekraanil horisontaalselt.
- Lehesektsioonid on raamita. Raam on lubatud üksikul mõõdikukaardil, tabelil, dialoogil ja graafikutööriistal.

## Värvid

Põhivärvid on defineeritud `apps/sm-tool/src/styles.css` faili viimases `:root` plokis:

- taust `#f5f7f6`;
- paneel `#ffffff`;
- põhitekst `#17211c`;
- sekundaarne tekst `#64706a`;
- joon `#dce2df`;
- tegevusvärv `#17603a`.

Roheline ja punane tähistavad ainult mõõdiku suunda. Kollane/punane Data Monitoris tähistab konkreetset lähteandme puudust, mitte üldist tiimi hinnangut. Dekoratiivseid gradiente ei kasutata.

## Kuju ja tüpograafia

- Kaardi ja paneeli maksimaalne nurgaraadius on 8 px; kontrollidel 6 px.
- Pill-kuju on lubatud ainult märgendil või kompaktsel valikul.
- Teksti `letter-spacing` on 0.
- H1 on 1.75 rem; kompaktsete paneelide pealkirjad jäävad sellest selgelt väiksemaks.
- Numbriline põhiväärtus peab mahtuma kaardi sisse ilma naabersisu katmata.

## Kontrollid

- Ikoonid tulevad `lucide-react` teegist.
- Ikoon-nupul peab olema `title` või ligipääsetav nimi.
- Käsu jaoks kasutatakse teksti või ikooni ja teksti; binaarse valiku jaoks checkbox'i või toggle'it.
- Perioodi kiirvalikud on segmented controls ning kuuvahemikul on eraldi algus- ja lõppkuu select.
- Kõigil interaktiivsetel elementidel on nähtav `:focus-visible` olek.

## Mõõdikud

- `Team view` näitab ainult completion rate'i, Lead Time'i, Active Time'i, Cycle Time'i, delivery expectation'it ja üle ootuse kestnud avatud tööd.
- `Scrum Master` vaade sisaldab lisaks prognoosi, tööjaotust, kvaliteeti, pudelikaela, workflow seadistust ja Data Quality auditit.
- Lead Time, Active Time, Cycle Time ja SLE kasutavad sama E-R tööpäevade alust. SLE arvutatakse suletud töö Cycle Time'i valimist.
- Trendi näidatakse ainult siis, kui võrdlusperiood on olemas ja muutus on vähemalt 1%.
- Madalam on parem: Cycle Time, Lead Time, Active Time, SLE ja 2+ Sprint %.
- Kõrgem on parem ainult kontekstis, kus see on otseselt määratud, näiteks Done ja Velocity.
- SLE kaardil kuvatakse valimi suurus; alla 10 pileti on valim märgitud madala kindlusega.
- Tiimi või voo üldist health score'i ei arvutata. Kuvatakse mõõdetavad väärtused ja konkreetsed andmekvaliteedi vead.

## Ligipääsetavus

- Dialoogil on `role="dialog"`, fookuselõks ja Escape'iga sulgemine.
- Tabidel on `role="tab"` ja `aria-selected`.
- Staatuse teade kasutab `aria-live="polite"`.
- Scatter plot'i kõrval on avatav andmetabel, et sama info oleks loetav ka ilma pointeri või graafikuta.
- Mobiili külgmenüül on scrim ning see ei tohi jätta taustal olevaid kontrolle aktiivseks.

## Kontrollvaated

Enne UI muudatuse lõpetamist kontrollitakse vähemalt:

- 1440 x 900 dashboard;
- 1440 x 900 Data Quality ja Cycle Time;
- 2048 x 1152 Team view ja Scrum Master vaade;
- 390 x 844 detailvaade ja avatud mobiilinavigatsioon;
- tekstide mahtumine, horisontaalne overflow, fookusolek ja brauseri runtime vead.
