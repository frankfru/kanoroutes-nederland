# Gebruikersgids Kajakroutes Dinsdaggers

Deze gids legt uit hoe je de kaart en de routeplanner gebruikt. Hij is bedoeld voor kanoërs, niet voor ontwikkelaars. Technische informatie vind je in de [README](../README.md).

## Inhoud

1. [De kaart](#de-kaart)
2. [Routes bekijken en delen](#routes-bekijken-en-delen)
3. [De routeplanner](#de-routeplanner)
4. [Vaarwegen](#vaarwegen)
5. [Lang indrukken voor een OSM-link](#lang-indrukken-voor-een-osm-link)
6. [Bronnen](#bronnen)
7. [Veelgestelde vragen](#veelgestelde-vragen)

## De kaart

De kaart toont kajakroutes uit Noord-Nederland, Noord-Holland, Utrecht en het gebied van TKBN. Routes uit hetzelfde gebied hebben dezelfde kleur. Met de categorieknoppen zet je gebieden aan of uit.

- **Kaartlaag:** Met de kaartlaagkeuze wissel je tussen OpenStreetMap, OpenTopoMap, een luchtfoto en andere achtergronden.
- **Overlays:** Natura 2000, vaarwegen en kanosteigers kun je als transparante laag over de kaart zetten.
- **Heatmap:** De knop **Kajakroute-heatmap** toont waar op de Noord-Hollandse routes veel gevaren is.

## Routes bekijken en delen

1. Klik op een route in de lijst of op de kaart.
2. De popup toont de afstand in kilometers, en links naar de originele GPS-bestanden en routepagina's.
3. Een groene stip markeert het startpunt van de route.
4. Om een route te delen, kopieer je de link uit de adresbalk. Die opent de kaart met dezelfde gebieden, dezelfde route en de routebeschrijving.

**Let op:** De lijn op de kaart is vereenvoudigd en de afstand is daarop gebaseerd. Gebruik voor de nauwkeurigste route de link naar de originele GPX.

**Deel route (gpx):** Deze knop verschijnt alleen als je browser GPX-bestanden kan delen, bijvoorbeeld op veel telefoons. Lukt delen niet, dan wordt de GPX gedownload.

### Op mobiel

- Het routepaneel open je of sluit je met de handgreep. Sleep omhoog om de lijst te zien en omlaag om de kaart vrij te maken.
- Met de knop rechtsboven zet je de kaart op volledig scherm.
- Installeer de webapp via het browsermenu op Android, of via **Delen → Zet op beginscherm** in Safari op iPhone. Voor de kaart en vaarwegdata blijft internet nodig.

## De routeplanner

Met de routeplanner teken je zelf een route en download je die als GPX-bestand.

### Openen

- Klik op het routeplannerpictogram in de werkbalk.
- Op een computer staat de werkbalk links. Op een telefoon staat hij bovenaan de kaart.

### Punten zetten

1. Klik op de kaart om een punt te zetten. Het tekenen start vanzelf zodra je de planner opent.
2. Zet zoveel punten als je wilt. De route wordt tussen de punten getekend.
3. Standaard klikt een punt binnen 500 meter vast op een kanaal of rivier uit OpenStreetMap. De route tussen de punten volgt dan het water.
4. Wil je punten rechtstreeks met elkaar verbinden, dan kun je het vastklikken uitzetten.
5. Een vrij punt zonder koppeling aan een vaarweg zet je door de kaart 0,5 seconde ingedrukt te houden.

**Let op:** Kleine sloten en meren ontbreken soms in de vaarwegdata. Controleer de route altijd zelf.

### Ongedaan maken

- **Ctrl+Z** maakt de laatste stap ongedaan. **Ctrl+Y** herhaalt die stap.
- In tekstvelden werken de gewone sneltoetsen voor tekst.
- Na een nieuwe wijziging vervallen de stappen die je eerder ongedaan hebt gemaakt.

### Stoppen met tekenen

- **Stop tekenen** stopt het tekenen terwijl de planner open is.
- Sluit je de planner, dan stopt het tekenen ook. Je route blijft bewaard.

### Route downloaden

1. Klik op **Download GPX** in de werkbalk.
2. Pas de bestandsnaam aan als je wilt en bevestig met **Download GPX**.
3. De routenaam in de GPX blijft ongewijzigd.

### GPX openen

Kies **Open GPX** in de routeplanner en selecteer een GPX-bestand van maximaal 10 MB. Tracks en routes worden als routelijnen geladen. Staat er al een route in de planner, dan wordt eerst om bevestiging gevraagd.

Alleen de routenaam en routelijnen worden overgenomen. Hoogtes, tijden en losse waypoints worden niet meegenomen wanneer je de route opnieuw downloadt.

Op Android kan de geïnstalleerde webapp ook verschijnen als je vanuit een andere app een GPX deelt. Dit hangt af van de browser en de app die het bestand deelt. Op iPhone gebruik je **Open GPX**.

### Routenaam wijzigen

Open **Route-instellingen** in de werkbalk om de naam van de route te wijzigen.

### Traject aanpassen van een bestaande route

1. Laad de route.
2. Kies **Traject aanpassen**.
3. Klik op het begin- en eindpunt van het deel dat je wilt vervangen.
4. Voeg tussenpunten toe. De nieuwe omleiding verschijnt als stippellijn.
5. Klik op **Pas wijziging toe** om de wijziging in de route te zetten.

## Vaarwegen

Met het vaarwegpictogram in de werkbalk zet je **Toon beschikbare vaarwegen** aan of uit. Die staat standaard uit.

- Routeerbare overdrachten zijn oranje stippellijnen. Dit zijn plekken waar je het water kunt verlaten en weer kunt instappen, bijvoorbeeld bij een sluis.
- De planner gebruikt deze overdrachten automatisch als dat past.
- Onduidelijke overdrachten worden niet gebruikt.

Het vaarwegnetwerk laadt als je het eerste routepunt zet of de vaarwegdekking aanzet. De eerste keer kan dat even duren.

## Lang indrukken voor een OSM-link

Houd een plek op de kaart 0,5 seconde ingedrukt. Er opent een popup met een link naar OpenStreetMap, waarmee je die omgeving kunt bewerken. De link opent in een nieuw tabblad.

- Dit werkt alleen als de routeplanner dicht is. Zo botst het niet met het plaatsen van vrije routepunten.

## Bronnen

De routes komen van de volgende bronnen:

- **Noord-Holland:** [AKV Odysseus](https://www.akvodysseus.nl/). Het overzicht is samengesteld door Peter Groen.
- **Utrecht en Gooi:** [Kanokaart Utrecht & 't Gooi](https://kanokaartutrecht.nl/).
- **Overige Nederlandse routes:** [kanoroutes.nl](https://kanoroutes.nl/).
- **Vaarwegen en kanosteigers:** © [OpenStreetMap-bijdragers](https://www.openstreetmap.org/copyright), ODbL.

## Veelgestelde vragen

**Waarom wijkt de afstand af van de GPX?**
De lijn op de kaart is vereenvoudigd om sneller te laden. De afstand wordt daarop berekend. Gebruik de link naar de originele GPX voor de precieze route.

**Waarom volgt mijn route niet de vaarweg?**
Vastklikken werkt alleen binnen 500 meter van een kanaal of rivier uit OpenStreetMap. Verder weg, of waar de data ontbreekt, verbindt de planner de punten rechtstreeks. Controleer de route altijd zelf.

**Waarom verschijnt de knop Deel route niet?**
Die knop verschijnt alleen als je browser GPX-bestanden kan delen. Anders wordt de GPX gedownload.

**Ik zie geen vaarwegen op de kaart. Wat nu?**
Controleer of **Toon beschikbare vaarwegen** aan staat (vaarwegpictogram in de werkbalk). Het netwerk wordt dan geladen als dat nog niet gebeurd is.

**Ik heb per ongeluk een punt gezet. Hoe haal ik dat weg?**
Gebruik **Ctrl+Z** om de laatste stap ongedaan te maken.

**Blijft mijn route bewaard als ik de planner sluit?**
Ja. Het tekenen stopt wel. Open de planner opnieuw om verder te gaan.

**Waar komt de data vandaan?**
Zie [Bronnen](#bronnen).
