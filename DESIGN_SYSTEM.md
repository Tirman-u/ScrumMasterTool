# Scrum Master Tool - Design System

## Ülevaade
See on helelise teemaga (light theme) desktop-first SaaS rakenduse disainisüsteem. Disain rõhutab puhtust, loetavust, head visuaalset hierarhiat ja professionaalset välimust.

## Värviskeem

### Taustavärved
- **Peamine taust**: `bg-slate-50/50` - pehmelt hall taust sisu aladele
- **Kaartide taust**: `bg-white` - puhas valge kaartidele ja konteineritele
- **Päise taust**: `bg-white` - valge päised border-b äärisega

### Äärise värvid
- **Peamine ääris**: `border-slate-200` - kaartide ja konteinerite jaoks
- **Päise ääris**: `border-border` - päiste eraldamiseks

### Teksti värvid
- **Peamine tekst**: `text-slate-900` - pealkirjad ja oluline tekst
- **Sekundaarne tekst**: `text-slate-700` - normaal tekst
- **Abitava tekst**: `text-muted-foreground` või `text-slate-500` - kirjeldused ja vähem oluline info
- **Uppercase label**: `text-slate-500` - kaartide ülaosasse

### Trendi värvid
- **Positiivne trend**: `text-green-600` - hea suund
- **Negatiivne trend**: `text-red-600` - halb suund
- **Neutraalne trend**: `text-slate-600` - väike muutus (<1%)

### Gradient taustade
- **Hoiatus/Info sektsiooni**: `bg-gradient-to-br from-amber-50 to-orange-50` + `border-amber-200/60`
- **Abi sektsiooni**: `bg-gradient-to-br from-blue-50 to-indigo-50` + `border-blue-200/60`

## Tüpograafia

### Pealkirjad
- **H1 (Lehe pealkiri)**: `text-3xl font-semibold tracking-tight`
- **H2 (Sektsiooni pealkiri)**: `text-lg font-semibold text-slate-900`
- **H3 (Kaardi pealkiri)**: `font-semibold text-blue-900` või `text-amber-900` olenevalt kontekstist
- **Kaardi label**: `text-xs font-medium text-slate-500 uppercase tracking-wide`

### Numbrid ja mõõdikud
- **Suur number (metric)**: `text-4xl font-bold tracking-tight`
- **Väike ühik**: `text-2xl font-normal text-slate-500` - kuvatakse numbri kõrval (nt "d", "wk")
- **Trend protsent**: `text-sm font-medium` + vastav värv

### Kehatekst
- **Peamine kirjeldus**: `text-base text-muted-foreground`
- **Väike kirjeldus**: `text-sm text-slate-500`
- **Väga väike tekst**: `text-xs text-slate-500`
- **Rõhutatud tekst**: `font-medium text-slate-700` või `font-semibold text-slate-900`

## Vahekaugused (Spacing)

### Padding
- **Lehe peamine padding**: `px-6 md:px-10 py-8`
- **Päise padding**: `px-6 md:px-10 py-6`
- **Kaardi sisu**: `CardContent` kasutab vaikimisi padding
- **Info sektsioonid**: `p-6`

### Gap ja Margin
- **Sektsioonide vahel**: `space-y-8` või `mb-8`
- **Väikeste elementide vahel**: `space-y-3`, `gap-3`
- **Kaartide grid gap**: `gap-5`
- **Pealkirja ja sisu vahel**: `mb-5`
- **Väike vahe**: `space-y-1`, `gap-1.5`, `mb-1`

### Grid Layout
- **Mõõdikute kaardid**: 
  - Mobile: `grid-cols-1`
  - Tablet: `sm:grid-cols-2`
  - Desktop: `xl:grid-cols-4`
  - Gap: `gap-5`

## Komponendid

### Kaardid (Cards)
```tsx
<Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
  <CardHeader className="pb-2">
    <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
      <IconComponent className="size-3.5" />
      Label tekst
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="flex items-baseline gap-2">
      <CardTitle className="text-4xl font-bold tracking-tight">
        123<span className="text-2xl font-normal text-slate-500">d</span>
      </CardTitle>
      {/* Trend indicator */}
    </div>
    <p className="text-xs text-slate-500">
      Previous: <span className="font-medium text-slate-700">120d</span>
    </p>
  </CardContent>
</Card>
```

**Reeglid:**
- Kasuta alati `border-slate-200`
- Lisa `shadow-sm hover:shadow-md transition-shadow` hover efektiks
- CardHeader kasutab `pb-2`
- CardContent kasutab `space-y-3` vertikaalseks spacing'uks
- Label on uppercase tracking-wide koos ikooniga
- Number ja ühik on eraldi span'ides

### Trendide indikaatorid
```tsx
{Math.abs(trend) >= 1 && (
  <span className={`flex items-center text-sm font-medium ${
    isPositive ? 'text-green-600' : 'text-red-600'
  }`}>
    {isPositive ? <TrendingUp className="size-3.5 mr-0.5" /> : '↓'}
    {Math.abs(trend).toFixed(0)}%
  </span>
)}
```

**Reeglid:**
- Näita ainult kui muutus on >= 1%
- Roheline positiivsetele trendidele, punane negatiivsetele
- Mõõdikud kus madalam on parem: Cycle Time, SLE, 2+ Sprint %
- Mõõdikud kus kõrgem on parem: Done, Velocity
- Ikoon suurus: `size-3.5`

### Info/Abi sektsioonid
```tsx
<div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 rounded-xl p-6 shadow-sm">
  <h3 className="font-semibold mb-4 flex items-center gap-2 text-blue-900">
    <Icon className="size-5" />
    Pealkiri
  </h3>
  <div className="space-y-3">
    <div className="flex items-start gap-3">
      <div className="size-1.5 rounded-full bg-blue-600 mt-2 flex-shrink-0" />
      <p className="text-sm text-slate-700">Tekst</p>
    </div>
  </div>
</div>
```

**Reeglid:**
- Sinine taust: `from-blue-50 to-indigo-50` + `border-blue-200/60`
- Kollane/oranž taust: `from-amber-50 to-orange-50` + `border-amber-200/60`
- Kasuta `rounded-xl` ja `shadow-sm`
- Bullet point: `size-1.5 rounded-full` + vastav värv + `mt-2 flex-shrink-0`
- List items: `space-y-3`

### Nupud (Buttons)
- **Outline button**: `<Button variant="outline">`
- **Ghost button**: `<Button variant="ghost" size="sm">` (tagasi nuppudele)
- Ikooni suurus nuppudes: `size-4`
- Ikooni margin: `mr-2`

### Tabeli konteiner
```tsx
<div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
  <MetricsTable data={data} />
</div>
```

## Layout Struktuuri

### Lehe ülesehitus
```tsx
<div className="h-full flex flex-col">
  {/* Header */}
  <div className="border-b border-border bg-white">
    <div className="px-6 md:px-10 py-6">
      {/* Header content */}
    </div>
  </div>
  
  {/* Content */}
  <div className="flex-1 overflow-auto bg-slate-50/50">
    <div className="px-6 md:px-10 py-8">
      {/* Page content */}
    </div>
  </div>
</div>
```

### Päise struktuur
```tsx
<div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
  <div className="space-y-1">
    <h1 className="text-3xl font-semibold tracking-tight">Pealkiri</h1>
    <p className="text-base text-muted-foreground">Kirjeldus</p>
  </div>
  <div className="flex items-center gap-3 md:mt-1">
    {/* Action buttons */}
  </div>
</div>
```

### Sektsioonide struktuur
```tsx
<div className="mb-8">
  <h2 className="text-lg font-semibold mb-5 text-slate-900">Sektsiooni pealkiri</h2>
  {/* Section content */}
</div>
```

## Interaktsiooni reeglid

### Hover efektid
- **Kaardid**: `hover:shadow-md transition-shadow`
- **Nupud**: Vaikimisi button hover efektid
- **Lingid**: `hover:text-foreground` (kui on `text-muted-foreground`)

### Transition
- Kasuta `transition-shadow` või `transition-all` sujuvaks üleminekuks
- Vaikimisi transition kestus on piisav

## Ikoonid

### Lucide React ikoonid
- **Zap**: Total Done / kiire tegevus
- **Clock**: Cycle Time / aeg
- **TrendingUp**: Üldine trend / SLE
- **Users**: Velocity / meeskond
- **ArrowLeft**: Tagasi navigatsioon
- **Download**: Eksportimine
- **Filter**: Filtreerimine
- **Calendar**: Kuupäevad / perioodid

### Ikooni suurused
- **Nuppudes**: `size-4`
- **Kaartide labelites**: `size-3.5`
- **Trendi indikaatorites**: `size-3.5`
- **Info sektsiooni pealkirjas**: `size-5`
- **Bullet point**: `size-1.5`

## Responsiivne disain

### Breakpoint'id
- **Mobile**: vaikimisi (< 768px)
- **Tablet**: `md:` (>= 768px)
- **Desktop**: `xl:` (>= 1280px)

### Responsiivne grid
```tsx
grid-cols-1 sm:grid-cols-2 xl:grid-cols-4
```

### Responsiivne padding
```tsx
px-6 md:px-10 py-8
```

### Responsiivne flex
```tsx
flex-col md:flex-row md:items-start md:justify-between
```

## Andmete esitamine

### Numbrite formateerimine
- **Täisarvud**: Ilma kümnendkohtadeta (nt 42)
- **Cycle Time**: 1 kümnendkoht (nt 5.3d)
- **SLE percentiles**: 1 kümnendkoht (nt 8.7d)
- **Protsendid**: Täisarvuna (nt 15%)
- **Ühikud**: "d" päevade jaoks, "wk" velocity jaoks

### Trendi loogika
```typescript
// Arvuta trend
const trend = ((current - previous) / previous) * 100;

// Määra kas positiivne
const isPositive = lowerIsBetter ? change < 0 : change > 0;

// Näita ainult kui >= 1%
const isNeutral = Math.abs(trend) < 1;
```

**Mõõdikud kus madalam on parem:**
- Avg Cycle Time
- SLE P50, P70, P85, P95
- 2+ Sprint %

**Mõõdikud kus kõrgem on parem:**
- Done
- Velocity

## Best Practices

1. **Konsistentsus**: Kasuta alati samu spacing'u, värvi ja font suurusi
2. **Hierarhia**: Selge visuaalne hierarhia pealkirjade, numbrite ja teksti vahel
3. **Loetavus**: Hea kontrast, piisav spacing, selge tüpograafia
4. **Puhtus**: Valge ruum on oluline, ära topi asju kokku
5. **Professionaalsus**: Pehmelt shadow'd, ümarad nurgad (`rounded-lg`, `rounded-xl`)
6. **Accessibility**: Piisav värvi kontrast, selged labelid, ikonid koos tekstiga
7. **Hover feedback**: Alati näita interaktiivsete elementide hover seisundit
8. **Transition**: Sujuvad üleminekud shadow'de ja hover efektide jaoks

## Komponentide järjekord lehel

### Dashboard
1. Päis koos pealkirja ja nuppudega
2. Overview kaardid (4 metrikat)
3. Team Metrics tabel konteineris
4. Understanding Trends abi sektsioon

### Team Detail
1. Päis koos tagasi nupuga, pealkirja ja export nupuga
2. Tabs (Overview, Cycle Time Analysis)
3. **Overview tab:**
   - Key Metrics kaardid (4 metrikat)
   - Detailed Metrics tabel
   - Quick Insights abi sektsioon
4. **Cycle Time tab:**
   - Scatter plot kaart
   - Reading the Scatter Plot abi sektsioon

## Koodi näited

### Trendi arvutamine ja kuvamine
```typescript
const getTrendData = (current: number, previous: number, lowerIsBetter: boolean = false) => {
  const change = current - previous;
  const percentChange = previous !== 0 ? (change / previous) * 100 : 0;
  const isPositive = lowerIsBetter ? change < 0 : change > 0;
  const isNeutral = Math.abs(percentChange) < 1;
  
  return { change, percentChange, isPositive, isNeutral };
};

const cycleTrend = getTrendData(
  metrics.current.avgCycleTime, 
  metrics.previous.avgCycleTime, 
  true // lowerIsBetter
);
```

### Mõõdiku kaart koos trendiga
```tsx
<Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
  <CardHeader className="pb-2">
    <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
      <Clock className="size-3.5" />
      Avg Cycle Time
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="flex items-baseline gap-2">
      <CardTitle className="text-4xl font-bold tracking-tight">
        {metrics.current.avgCycleTime.toFixed(1)}
        <span className="text-2xl font-normal text-slate-500">d</span>
      </CardTitle>
      {!cycleTrend.isNeutral && (
        <span className={`flex items-center text-sm font-medium ${
          cycleTrend.isPositive ? 'text-green-600' : 'text-red-600'
        }`}>
          {cycleTrend.isPositive ? '↓' : <TrendingUp className="size-3.5 mr-0.5" />}
          {Math.abs(cycleTrend.percentChange).toFixed(0)}%
        </span>
      )}
    </div>
    <p className="text-xs text-slate-500">
      Previous: <span className="font-medium text-slate-700">{metrics.previous.avgCycleTime.toFixed(1)}d</span>
    </p>
  </CardContent>
</Card>
```

---

**Viimati uuendatud**: 2026-02-27
**Versioon**: 1.0
