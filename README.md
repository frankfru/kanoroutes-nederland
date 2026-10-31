# Kajakroutes Dinsdaggers

Een interactieve Leaflet-kaart met kajakroutes uit Noord-Nederland, Noord-Holland en heel Nederland. De slogan in de kop linkt naar de routebeschrijvingen van AKV Odysseus. Een lichte omlijning houdt de routekleuren goed zichtbaar op de kaart.

## Lokaal bekijken

Installeer Node.js en start de lokale webserver vanuit deze map:

```powershell
node server.js
```

Open daarna [http://localhost:4173](http://localhost:4173).

## Routedata vernieuwen

- Genereer de routes uit `D:\GPS Groningen` met `.\build-routes.ps1`.
- Haal de Noord-Holland-routes en bijbehorende PDF-links opnieuw op met `node build-noord-holland-routes.js`.
- Haal de Nederlandse routes van kanoroutes.nl opnieuw op met `node build-kanoroutes-data.js`. Deze controleert de GPS-tracks tegen de Nederlandse landsgrens en slaat routes buiten Nederland over.

De route-lijst toont de afstand in hele kilometers achter de routenaam. De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPS-bestanden en routepagina's. Een groene stip markeert het startpunt van de geselecteerde route. De routes worden vereenvoudigd voor een vlotte weergave; de afstand is daarop gebaseerd.

Op mobiel kun je het routepaneel vanaf de handgreep omhoog slepen en na het kiezen van een route weer omlaag schuiven. Met de knop rechtsboven open je de kaart schermvullend. De routes hebben een bredere, onzichtbare klikzone zodat selecteren op touchscreens makkelijker is.

## Een route delen

Selecteer een route in de lijst om de deelbare URL bij te werken. De link opent direct het juiste routegebied, zoomt in op de route en toont de routebeschrijving. Bijvoorbeeld:

`https://frankfru.github.io/kanoroutes-nederland/?region=noord-holland&route=1-1-grachten-van-alkmaar`

## Bronnen

- Noord-Holland-routes en clublogo: [AKV Odysseus](https://www.akvodysseus.nl/). Het routeoverzicht is samengesteld door Peter Groen; de routes staan op de pagina [Routes kanotochten](https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/).
- Overige Nederlandse routepagina's en GPS-tracks: [kanoroutes.nl](https://kanoroutes.nl/). De landsgrenscontrole gebruikt [Natural Earth](https://www.naturalearthdata.com/).
- Achtergrondkaart: [OpenStreetMap](https://www.openstreetmap.org/copyright).

De kanoroutes.nl-gegevens zijn toegevoegd voor persoonlijk gebruik. Regel zelf toestemming voordat je die gegevens breder gebruikt.
