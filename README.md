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
- Vernieuw het vaarwegennetwerk voor de routebouwer met `node scripts/build-waterway-network.js`; dit haalt OSM-vaarwegen per provincie op via Overpass.
- Bouw de overlay met ontbrekende waterweglijnen op meren met `node scripts/build-lake-waterway-lines.js`; dit haalt OSM-data per provincie op en schrijft `lake-waterway-lines.json`.
- Haal de Utrechtse en Gooi-routes opnieuw op met `node scripts/build-utrecht-routes.js`.
- Haal de Nederlandse routes van kanoroutes.nl opnieuw op met `node scripts/build-kanoroutes-data.js`. Deze controleert de GPS-tracks tegen de Nederlandse landsgrens, slaat routes buiten Nederland over en groepeert de routes per provincie. Gebruik `node scripts/build-kanoroutes-data.js --regroup-existing` om alleen de provincie-indeling opnieuw te berekenen.

De route-lijst toont de afstand in hele kilometers achter de routenaam. De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPS-bestanden en routepagina's. Een groene stip markeert het startpunt van de geselecteerde route. De routes worden vereenvoudigd voor een vlotte weergave; de afstand is daarop gebaseerd. Gebruik de regio-knoppen als schakelaars om routes uit meerdere gebieden tegelijk te tonen.

De knop **Kajakroute-heatmap** toont een extra kaartlaag met de Noord-Hollandse kajakroutes en GPS-opnames. Je kunt de intensiteit, vlekbreedte en het kleurcontrast aanpassen. De heatmap gebruikt geaggregeerde routevakken van ongeveer 25 meter; de bron-GPX-opnames zijn niet nodig om de kaart te bekijken en worden niet gepubliceerd. Genereer de heatmapdata opnieuw met `node scripts/build-kayak-heatmap.js`; stel eventueel `KAYAK_GPX_DIRECTORY` in op de map met GPS-opnames.

Via de kaartlaagkeuze kun je wisselen tussen OpenStreetMap, OpenTopoMap, de BRT-achtergrondkaart, een PDOK-luchtfoto en TOP25raster. Natura 2000, de vaarwegvakken uit het Nationaal Wegenbestand (NWB), de beschikbare vaarwegdekking en de niet-opgenomen OSM-waterweglijnen op meren zijn als transparante overlays beschikbaar. De OSM-waterweglijnen worden vooraf opgebouwd met `node scripts/build-lake-waterway-lines.js` en daarna uit `lake-waterway-lines.json` geladen; de kaart vraagt tijdens gebruik geen OSM-data op. Alleen niet-opgenomen waterweglijnen die een OSM-meergebied raken, worden getoond. TOP25raster past de kaart automatisch aan tot zoomniveau 14–16; de kadastrale kaart van PDOK is beschikbaar op zoomniveau 17–19. Kadastrale grenzen geven alleen een indicatie en zijn niet geschikt om maten aan te ontlenen.

Met **Zelf een GPX-route maken** kun je punten op de kaart zetten, de laatste stap ongedaan maken en de route als GPX-track downloaden. Standaard worden klikpunten binnen 500 meter vastgeklikt op kanalen en rivieren uit OpenStreetMap en wordt de route daartussen berekend. Je kunt dit uitzetten om punten rechtstreeks te verbinden. Kleine sloten en meren ontbreken mogelijk in de vaarwegdata; controleer de route daarom altijd zelf. Het netwerkbestand wordt pas geladen wanneer je het eerste routepunt toevoegt. Bron: © OpenStreetMap-bijdragers, ODbL.

Bij een geselecteerde route verschijnt **Deel route (gpx)** alleen als de browser GPX-bestanden native kan delen, zoals op veel mobiele apparaten. Als delen niet lukt, wordt de GPX gedownload. De gedeelde kaartlijn kan vereenvoudigd zijn; gebruik waar mogelijk de link naar de originele GPX voor de nauwkeurigste route.

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
- Achtergrondkaarten en overlays: [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/), de BRT-achtergrondkaart, luchtfoto en TOP25raster via [PDOK](https://www.pdok.nl/), de [Kadastrale kaart](https://www.pdok.nl/introductie/-/article/kadastrale-kaart), Natura 2000 via RVO/PDOK en de landelijke vaarwegvakken uit het [Nationaal Wegenbestand Vaarwegen](https://www.pdok.nl/introductie/-/article/nationaal-wegen-bestand-nwb-vaarwegen) van Rijkswaterstaat.

De routegegevens van kanoroutes.nl en kanokaartutrecht.nl zijn toegevoegd voor persoonlijk gebruik. Regel zelf toestemming voordat je die gegevens breder gebruikt.
