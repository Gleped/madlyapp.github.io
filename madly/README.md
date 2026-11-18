# Madly

Madly er en webapp til opskrifter og en log over, hvad I fik, når I havde gæster. Den kører helt på din telefon og virker også uden internet.

## Læg den på GitHub Pages

1. Log ind på github.com og opret et nyt repository, fx `madly`. Det skal være **Public**, hvis du bruger en gratis konto.
2. Klik på **Add file → Upload files**, og træk alle filerne og mappen `icons` ind. Vigtigt: `index.html` skal ligge i roden, ikke inde i en undermappe.
3. Klik **Commit changes**.
4. Gå til **Settings → Pages**. Under *Build and deployment* vælger du **Deploy from a branch**, branch `main` og mappen `/ (root)`. Klik **Save**.
5. Efter et minut eller to ligger appen på `https://<dit-brugernavn>.github.io/madly/`.

## Installér på telefonen

- **iPhone:** Åbn adressen i **Safari**, tryk på Del-knappen og vælg **Føj til hjemmeskærm**.
- **Android:** Åbn adressen i **Chrome**, tryk på ⋮ og vælg **Installer app** (eller **Føj til startskærm**).

Når appen er åbnet én gang, virker den også uden internet.

## Dine data og backup

Alt bliver gemt **lokalt på telefonen**, også billederne. Intet sendes til GitHub eller andre steder.

- **Eksportér backup** (under Indstillinger) laver én `.json`-fil med alt indhold, inklusive billeder. På telefonen åbner delingsmenuen, så du kan gemme filen i Filer, iCloud Drive eller Google Drev.
- **Importér backup** kan **flette** filen ind (tilføjer og opdaterer) eller **erstatte** alt.

Tag en backup jævnligt. Hvis du sletter appen fra hjemmeskærmen eller rydder browserens data, forsvinder dine opskrifter.

På iPhone har appen på hjemmeskærmen sin egen lagerplads, adskilt fra Safari. Data, du har lagt ind via Safari, kan du flytte over til den installerede app med eksport og import.

## Opdatering

Upload de nye filer til samme repository. Appen henter den nye version i baggrunden og bruger den, næste gang du åbner den. Dine data bliver ikke rørt.

## Filer

| Fil | Indhold |
|---|---|
| `index.html` | Selve siden |
| `app.js` | Al logik: opskrifter, gæster, begivenheder, backup |
| `styles.css` | Udseende (lyst og mørkt tema) |
| `sw.js` | Gør appen tilgængelig offline |
| `manifest.webmanifest` | Navn og ikon ved installation |
| `icons/` | App-ikoner |
