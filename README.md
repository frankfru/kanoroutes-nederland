# Kajakroutes Dinsdaggers

Een interactieve Leaflet-kaart met kajakroutes uit Noord-Nederland, Noord-Holland en heel Nederland. De slogan in de kop linkt naar de routebeschrijvingen van AKV Odysseus. Donkere, verzadigde routekleuren met een lichte omlijning houden de routes goed zichtbaar op de kaart.

## Lokaal bekijken

Installeer Node.js en start de lokale webserver vanuit deze map:

```powershell
node server.js
```

Open daarna [http://localhost:4173](http://localhost:4173).

## Routedata vernieuwen

- Genereer de routes uit `D:\GPS Groningen` met `.\build-routes.ps1`.
- Haal de Noord-Holland-routes en bijbehorende PDF-links opnieuw op met `node build-noord-holland-routes.js`.
- Vernieuw het vaarwegennetwerk voor de routebouwer met `node build-waterway-network.js`; dit haalt OSM-vaarwegen per provincie op via Overpass.
- Haal de Utrechtse en Gooi-routes opnieuw op met `node build-utrecht-routes.js`.
- Haal de Nederlandse routes van kanoroutes.nl opnieuw op met `node build-kanoroutes-data.js`. Deze controleert de GPS-tracks tegen de Nederlandse landsgrens, slaat routes buiten Nederland over en groepeert de routes per provincie. Gebruik `node build-kanoroutes-data.js --regroup-existing` om alleen de provincie-indeling opnieuw te berekenen.

De route-lijst toont de afstand in hele kilometers achter de routenaam. De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPS-bestanden en routepagina's. Een groene stip markeert het startpunt van de geselecteerde route. De routes worden vereenvoudigd voor een vlotte weergave; de afstand is daarop gebaseerd. Gebruik de regio-knoppen als schakelaars om routes uit meerdere gebieden tegelijk te tonen.

De knop **Kajakroute-heatmap** toont een extra kaartlaag met de Noord-Hollandse kajakroutes en GPS-opnames. Je kunt de intensiteit, vlekbreedte en het kleurcontrast aanpassen. De heatmap gebruikt geaggregeerde routevakken van ongeveer 25 meter; de bron-GPX-opnames zijn niet nodig om de kaart te bekijken en worden niet gepubliceerd. Genereer de heatmapdata opnieuw met `node build-kayak-heatmap.js`; stel eventueel `KAYAK_GPX_DIRECTORY` in op de map met GPS-opnames.

Via de kaartlaagkeuze kun je wisselen tussen OpenStreetMap, OpenTopoMap, de BRT-achtergrondkaart, een PDOK-luchtfoto en TOP25raster. Natura 2000 en de vaarwegvakken uit het Nationaal Wegenbestand (NWB) zijn als transparante overlays beschikbaar. TOP25raster past de kaart automatisch aan tot zoomniveau 14–16; de kadastrale kaart van PDOK is beschikbaar op zoomniveau 17–19. Kadastrale grenzen geven alleen een indicatie en zijn niet geschikt om maten aan te ontlenen.

Met **Zelf een GPX-route maken** kun je punten op de kaart zetten, de laatste stap ongedaan maken en de route als GPX-track downloaden. Standaard worden klikpunten binnen 500 meter vastgeklikt op kanalen en rivieren uit OpenStreetMap en wordt de route daartussen berekend. Je kunt dit uitzetten om punten rechtstreeks te verbinden. Kleine sloten en meren ontbreken mogelijk in de vaarwegdata; controleer de route daarom altijd zelf. Het netwerkbestand wordt pas geladen wanneer je het eerste routepunt toevoegt. Bron: © OpenStreetMap-bijdragers, ODbL.

Op mobiel kun je het routepaneel vanaf de handgreep omhoog slepen en na het kiezen van een route weer omlaag schuiven. Met de knop rechtsboven open je de kaart schermvullend. De routes hebben een bredere, onzichtbare klikzone zodat selecteren op touchscreens makkelijker is.

## Een route delen

Selecteer een route in de lijst om de deelbare URL bij te werken. De link opent direct de geselecteerde routegebieden, zoomt in op de route en toont de routebeschrijving. Meerdere regio's staan komma-gescheiden in de `region`-parameter. Bijvoorbeeld:

`https://frankfru.github.io/kanoroutes-nederland/?region=noord-holland&route=1-1-grachten-van-alkmaar`

`https://frankfru.github.io/kanoroutes-nederland/?region=noord-holland,utrecht`

## Bronnen

- Noord-Holland-routes en clublogo: [AKV Odysseus](https://www.akvodysseus.nl/). Het routeoverzicht is samengesteld door Peter Groen; de routes staan op de pagina [Routes kanotochten](https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/).
- Utrechtse en Gooi-routes en GPS-tracks: [Kanokaart Utrecht & 't Gooi](https://kanokaartutrecht.nl/).
- Overige Nederlandse routepagina's en GPS-tracks: [kanoroutes.nl](https://kanoroutes.nl/). De landsgrenscontrole gebruikt [Natural Earth](https://www.naturalearthdata.com/).
- De routebouwer gebruikt vaarweggegevens uit [OpenStreetMap](https://www.openstreetmap.org/copyright), beschikbaar onder de ODbL.
- Achtergrondkaarten en overlays: [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/), de BRT-achtergrondkaart, luchtfoto en TOP25raster via [PDOK](https://www.pdok.nl/), de [Kadastrale kaart](https://www.pdok.nl/introductie/-/article/kadastrale-kaart), Natura 2000 via RVO/PDOK en de landelijke vaarwegvakken uit het [Nationaal Wegenbestand Vaarwegen](https://www.pdok.nl/introductie/-/article/nationaal-wegen-bestand-nwb-vaarwegen) van Rijkswaterstaat.

De routegegevens van kanoroutes.nl en kanokaartutrecht.nl zijn toegevoegd voor persoonlijk gebruik. Regel zelf toestemming voordat je die gegevens breder gebruikt.
