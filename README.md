# Kajakroutes Dinsdagvaarders

Een interactieve Leaflet-kaart met kajakroutes uit Noord-Nederland en Noord-Holland en omgeving. De slogan in de kop linkt naar de routebeschrijvingen van AKV Odysseus. Een lichte omlijning houdt de routekleuren goed zichtbaar op de kaart.

## Lokaal bekijken

Installeer Node.js en start de lokale webserver vanuit deze map:

```powershell
node server.js
```

Open daarna [http://localhost:4173](http://localhost:4173).

## Routedata vernieuwen

- Genereer de routes uit `D:\GPS Groningen` met `.\build-routes.ps1`.
- Haal de Noord-Holland-routes en bijbehorende PDF-links opnieuw op met `node build-noord-holland-routes.js`.

De route-lijst toont de afstand in hele kilometers achter de routenaam. De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPX-bestanden en routebeschrijvingen. Een groene stip markeert het startpunt van de geselecteerde route. Noord-Holland gebruikt vereenvoudigde GPS-lijnen voor een vlotte weergave; de afstand is daarop gebaseerd.

Op mobiel kun je het routepaneel vanaf de handgreep omhoog slepen en na het kiezen van een route weer omlaag schuiven. Met de knop rechtsboven open je de kaart schermvullend. De routes hebben een bredere, onzichtbare klikzone zodat selecteren op touchscreens makkelijker is.

## Een route delen

Selecteer een route in de lijst om de deelbare URL bij te werken. De link opent direct het juiste routegebied, zoomt in op de route en toont de routebeschrijving. Bijvoorbeeld:

`https://frankfru.github.io/kanoroutes-nederland/?region=noord-holland&route=1-1-grachten-van-alkmaar`

## Bronnen

- Noord-Holland-routes en clublogo: [AKV Odysseus](https://www.akvodysseus.nl/). Het routeoverzicht is samengesteld door Peter Groen; de routes staan op de pagina [Routes kanotochten](https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/).
- Achtergrondkaart: [OpenStreetMap](https://www.openstreetmap.org/copyright).
