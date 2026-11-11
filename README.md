# Kajakroutes Dinsdaggers

Een interactieve Leaflet-kaart met kajakroutes uit Noord-Nederland, Noord-Holland en heel Nederland. De slogan in de kop linkt naar de routebeschrijvingen van AKV Odysseus. Routes binnen een routegebied delen dezelfde kleur; elk gebied heeft een eigen kleur. De donkere, verzadigde kleuren met een lichte omlijning houden routes goed zichtbaar op de kaart.

## Lokaal bekijken

Installeer Node.js en start de lokale webserver vanuit deze map:

```powershell
node server.js
```

Open daarna [http://localhost:4173](http://localhost:4173).

`index.html` bevat de pagina-opbouw en laadt de stijlen uit `styles.css`. De applicatiecode staat in native JavaScript-modules: `src/main.js` verbindt kaart en routes, `src/heatmap.js` beheert de heatmap, `src/route-builder.js` de routebouwer en trajectbewerking, en `src/waterway-router.js` het vaarwegennetwerk. De scripts voor het genereren en vernieuwen van routedata staan in `scripts/`; de gegenereerde bestanden blijven in de hoofdmap staan.

## Routedata vernieuwen

- Genereer de routes uit `D:\GPS Groningen` met `.\scripts\build-routes.ps1`.
- Haal de Noord-Holland-routes en bijbehorende PDF-links opnieuw op met `node scripts/build-noord-holland-routes.js`.
- Vernieuw het vaarwegennetwerk voor de routebouwer met `node scripts/build-waterway-network.js`; dit haalt OSM-vaarwegen (`waterway=canal|river|fairway`) per provincie op via Overpass en neemt de goedgekeurde trajecten uit `waterway-coverage-candidates.json` mee. Bij het invoegen worden aansluitingen binnen maximaal 4 meter hersteld als de bestaande 3 meter vereenvoudiging een OSM-knooppunt heeft verwijderd. Gebruik `node scripts/build-waterway-network.js --merge-candidates-only` om de lokale kandidaatdata in het bestaande netwerkbestand op te nemen zonder Overpass opnieuw te raadplegen.
- Bouw de overlays met ontbrekende waterweglijnen en kandidaattrajecten voor de vaarwegdekking met `node scripts/build-lake-waterway-lines.js`; dit haalt OSM-data per provincie op en schrijft `lake-waterway-lines.json` en `waterway-coverage-candidates.json`.
- Bouw de overlay met NWB-vaarwegen buiten de routeerbare dekking met `node scripts/build-waterway-coverage-gaps.js`; deze vergelijkt de NWB-vaarwegvakken via PDOK WFS met de lokale OSM-routerdata en schrijft `waterway-coverage-gaps.json`. Een NWB-lijn geldt als niet gedekt wanneer deze op meetpunten om de 20 meter verder dan 25 meter van de routerdata ligt.
- Haal de Utrechtse en Gooi-routes opnieuw op met `node scripts/build-utrecht-routes.js`.
- Haal de Nederlandse routes van kanoroutes.nl opnieuw op met `node scripts/build-kanoroutes-data.js`. Deze controleert de GPS-tracks tegen de Nederlandse landsgrens, slaat routes buiten Nederland over en groepeert de routes per provincie. Gebruik `node scripts/build-kanoroutes-data.js --regroup-existing` om alleen de provincie-indeling opnieuw te berekenen.

De route-lijst toont de afstand in hele kilometers achter de routenaam. De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPS-bestanden en routepagina's. Een groene stip markeert het startpunt van de geselecteerde route. De routes worden vereenvoudigd voor een vlotte weergave; de afstand is daarop gebaseerd. Gebruik de regio-knoppen als schakelaars om routes uit meerdere gebieden tegelijk te tonen.

De knop **Kajakroute-heatmap** toont een extra kaartlaag met de Noord-Hollandse kajakroutes en GPS-opnames. Je kunt de intensiteit, vlekbreedte en het kleurcontrast aanpassen. De heatmap gebruikt geaggregeerde routevakken van ongeveer 25 meter; de bron-GPX-opnames zijn niet nodig om de kaart te bekijken en worden niet gepubliceerd. Genereer de heatmapdata opnieuw met `node scripts/build-kayak-heatmap.js`; stel eventueel `KAYAK_GPX_DIRECTORY` in op de map met GPS-opnames.

Via de kaartlaagkeuze kun je wisselen tussen OpenStreetMap, OpenTopoMap, de BRT-achtergrondkaart, een PDOK-luchtfoto en TOP25raster. Natura 2000, de vaarwegvakken uit het Nationaal Wegenbestand (NWB), de beschikbare vaarwegdekking en de OSM-waterweg-overlays zijn als transparante overlays beschikbaar. De OSM-overlaydata wordt vooraf opgebouwd met `node scripts/build-lake-waterway-lines.js`; tijdens gebruik vraagt de kaart geen OSM-data op. **Niet-opgenomen OSM-waterwegen op meren** toont waterweglijnen die ontbreken in de vaarwegdekking en een meergebied raken. **NWB-vaarwegen buiten de vaarwegdekking** toont de NWB-lijnstukken die op meetpunten om de 20 meter meer dan 25 meter van de routeerbare OSM-dekking af liggen; bouw de data met `node scripts/build-waterway-coverage-gaps.js`. **Toegevoegde OSM-vaarwegen (knooppunt / breed water)** markeert de extra trajecten die nu ook in de vaarwegdekking en de routeplanner zitten. Ze zijn geselecteerd omdat beide eindpunten een OSM-knooppunt delen met de bestaande dekking, of omdat de lijn minstens 100 meter aaneengesloten door water loopt dat ter plaatse minstens 50 meter breed is. Voor dit breedtecriterium worden `waterway=ditch` en `waterway=drain` niet meegenomen. De lijnkleur geeft aan welk criterium geldt; trajecten met `access=no`, `boat=no` of `tunnel=culvert` worden uitgesloten. Aansluitingen worden alleen hersteld tot maximaal 4 meter; trajecten zonder zo'n aansluiting blijven als aparte netwerkdelen zichtbaar en vormen geen routeverbinding met de bestaande graaf. TOP25raster past de kaart automatisch aan tot zoomniveau 14–16; de kadastrale kaart van PDOK is beschikbaar op zoomniveau 17–19. Kadastrale grenzen geven alleen een indicatie en zijn niet geschikt om maten aan te ontlenen.

Met **Routeplanner** op de kaart kun je punten op de kaart zetten, stappen terug- en vooruitzetten en de route als GPX-track downloaden. Gebruik hiervoor ook Ctrl+Z en Ctrl+Y zolang de planner open is of tekenen actief is; in tekstvelden blijven de normale sneltoetsen werken. Na een nieuwe wijziging vervallen de stappen vooruit. Bij het openen start het tekenen automatisch. Sluit je de planner, dan blijft tekenen actief; de knop geeft dit aan en met **Stop tekenen** kun je het stoppen. Standaard worden klikpunten binnen 500 meter vastgeklikt op kanalen en rivieren uit OpenStreetMap en wordt de route daartussen berekend. Je kunt dit uitzetten om punten rechtstreeks te verbinden. Kleine sloten en meren ontbreken mogelijk in de vaarwegdata; controleer de route daarom altijd zelf. Het netwerkbestand wordt pas geladen wanneer je het eerste routepunt toevoegt. Bron: © OpenStreetMap-bijdragers, ODbL.

Bij een geselecteerde route verschijnt **Deel route (gpx)** alleen als de browser GPX-bestanden native kan delen, zoals op veel mobiele apparaten. Als delen niet lukt, wordt de GPX gedownload. De gedeelde kaartlijn kan vereenvoudigd zijn; gebruik waar mogelijk de link naar de originele GPX voor de nauwkeurigste route.

De kaartlaag **Mogelijke kanosteigers (OSM)** toont alle punten uit `canoe-landings.json`. De algemene selectie op `leisure=slipway` is verwijderd; slipways die ook aan een kano-gerelateerde selectieregel voldoen blijven zichtbaar. Dit blijft een ruime selectie en niet iedere locatie is een bevestigde kanosteiger. Klik op een punt en klap **OpenStreetMap-tags** uit om alle oorspronkelijke tags te zien; de popup bevat ook een link naar het OSM-element. Bron: © OpenStreetMap-bijdragers, ODbL.

Je kunt ook een bestaand traject in een geladen route vervangen: kies **Traject aanpassen**, klik op het te vervangen begin- en eindpunt en voeg tussenpunten toe. De omleiding wordt automatisch als stippellijn getoond; de basisroute verandert pas na **Pas wijziging toe**.

Op mobiel kun je het routepaneel vanaf de handgreep omhoog slepen en na het kiezen van een route weer omlaag schuiven. Met de knop rechtsboven open je de kaart schermvullend. De routes hebben een bredere, onzichtbare klikzone zodat selecteren op touchscreens makkelijker is.

## Een route delen

Selecteer een route in de lijst om de deelbare URL bij te werken. De link opent direct de geselecteerde routegebieden, zoomt in op de route en toont de routebeschrijving. Meerdere regio's staan komma-gescheiden in de `region`-parameter. Bijvoorbeeld:

`https://frankfru.github.io/kanoroutes-nederland/?region=dinsdaggers&route=1-1-grachten-van-alkmaar`

`https://frankfru.github.io/kanoroutes-nederland/?region=dinsdaggers,utrecht`

## Bronnen

- Noord-Holland-routes en clublogo: [AKV Odysseus](https://www.akvodysseus.nl/). Het routeoverzicht is samengesteld door Peter Groen; de routes staan op de pagina [Routes kanotochten](https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/).
- Utrechtse en Gooi-routes en GPS-tracks: [Kanokaart Utrecht & 't Gooi](https://kanokaartutrecht.nl/).
- Overige Nederlandse routepagina's en GPS-tracks: [kanoroutes.nl](https://kanoroutes.nl/). De landsgrenscontrole gebruikt [Natural Earth](https://www.naturalearthdata.com/).
- De routebouwer en de meer-overlay gebruiken vaarweg- en meergegevens uit [OpenStreetMap](https://www.openstreetmap.org/copyright), beschikbaar onder de ODbL.
- De overlay met ontbrekende NWB-vaarwegen gebruikt de NWB Vaarwegen-service van [PDOK](https://www.pdok.nl/ogc-webservices/-/article/nationaal-wegen-bestand-nwb-vaarwegen); de gegevens zijn beschikbaar onder CC0.
- Achtergrondkaarten en overlays: [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/), de BRT-achtergrondkaart, luchtfoto en TOP25raster via [PDOK](https://www.pdok.nl/), de [Kadastrale kaart](https://www.pdok.nl/introductie/-/article/kadastrale-kaart), Natura 2000 via RVO/PDOK en de landelijke vaarwegvakken uit het [Nationaal Wegenbestand Vaarwegen](https://www.pdok.nl/introductie/-/article/nationaal-wegen-bestand-nwb-vaarwegen) van Rijkswaterstaat.

De routegegevens van kanoroutes.nl en kanokaartutrecht.nl zijn toegevoegd voor persoonlijk gebruik. Regel zelf toestemming voordat je die gegevens breder gebruikt.
