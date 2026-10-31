# Kanoroutes Nederland

Een interactieve Leaflet-kaart met kano- en vaarroutes uit Noord-Nederland en Noord-Holland en omgeving.

## Lokaal bekijken

Installeer Node.js en start de lokale webserver vanuit deze map:

```powershell
node server.js
```

Open daarna [http://localhost:4173](http://localhost:4173).

## Routedata vernieuwen

- Genereer de routes uit `D:\GPS Groningen` met `.\build-routes.ps1`.
- Haal de Noord-Holland-routes en bijbehorende PDF-links opnieuw op met `node build-noord-holland-routes.js`.

De route-pop-up toont de berekende afstand in kilometers en links naar de oorspronkelijke GPX-bestanden en routebeschrijvingen. Een groene stip op de kaart markeert het startpunt. Noord-Holland gebruikt vereenvoudigde GPS-lijnen voor een vlotte weergave; de afstand is daarop gebaseerd.

## Een route delen

Selecteer een route in de lijst om de deelbare URL bij te werken. De link opent direct het juiste routegebied, zoomt in op de route en toont de routebeschrijving. Bijvoorbeeld:

`https://frankfru.github.io/kanoroutes-nederland/?region=noord-holland&route=1-1-grachten-van-alkmaar`

## Bronnen

- Noord-Holland en omgeving: [AKV Odysseus — Routes kanotochten](https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/). Het overzicht is samengesteld door Peter Groen.
- Achtergrondkaart: [OpenStreetMap](https://www.openstreetmap.org/copyright).
