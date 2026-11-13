export const ROUTE_CATEGORIES = [
  {
    id: "noord",
    label: "Noord-Nederland",
    mapLabel: "Groningen · Friesland · Drenthe",
    color: "#0057b8",
    dataFile: "routes-data.js",
    dataGlobal: "GPX_ROUTES"
  },
  {
    id: "dinsdaggers",
    label: "Dinsdaggers",
    mapLabel: "Dinsdaggers",
    color: "#c45b00",
    dataFile: "routes-noord-holland-data.js",
    dataGlobal: "GPX_ROUTES_NOORD_HOLLAND",
    sourceNote: 'GPX-bron: <a href="https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/" target="_blank" rel="noopener noreferrer">AKV Odysseus</a>. Routeoverzicht van Peter Groen; kaartlijnen vereenvoudigd voor snel laden.'
  },
  {
    id: "utrecht",
    label: "Utrecht & 't Gooi",
    mapLabel: "Utrecht en ’t Gooi",
    color: "#007a3d",
    dataFile: "routes-utrecht-data.js",
    dataGlobal: "GPX_ROUTES_UTRECHT",
    sourceNote: 'GPX-bron: <a href="https://kanokaartutrecht.nl/" target="_blank" rel="noopener noreferrer">Kanokaart Utrecht &amp; ’t Gooi</a>. Open de routepagina voor meer informatie.'
  },
  {
    id: "kanoroutes",
    label: "Nederland",
    mapLabel: "Nederland · kanoroutes.nl",
    color: "#a0005a",
    dataFile: "routes-kanoroutes-data.js?v=province-groups-1",
    dataGlobal: "GPX_ROUTES_KANOROUTES",
    sourceNote: 'GPS-bron: <a href="https://kanoroutes.nl/" target="_blank" rel="noopener noreferrer">kanoroutes.nl</a>. Alleen routes in Nederland; open de routepagina voor meer informatie.'
  },
  {
    id: "tkbn-rob-nuij",
    label: "TKBN · Rob Nuij",
    mapLabel: "TKBN · Rob Nuij",
    color: "#70419a",
    dataFile: "routes-tkbn-rob-nuij-data.js",
    dataGlobal: "GPX_ROUTES_TKBN_ROB_NUIJ",
    sourceNote: 'Bron: <a href="https://www.tkbn.nl/instappunten-nl/" target="_blank" rel="noopener noreferrer">TKBN instappunten</a>. Dummyroutes zijn geen echte vaarroutes.'
  },
  {
    id: "tkbn-divers",
    label: "TKBN · divers",
    mapLabel: "TKBN · divers",
    color: "#007d80",
    dataFile: "routes-tkbn-divers-data.js",
    dataGlobal: "GPX_ROUTES_TKBN_DIVERS",
    sourceNote: 'Bron: <a href="https://www.tkbn.nl/instappunten-nl/" target="_blank" rel="noopener noreferrer">TKBN instappunten</a>. Dummyroutes zijn geen echte vaarroutes.'
  }
];

const categoriesById = new Map(ROUTE_CATEGORIES.map(category => [category.id, category]));
const categoryLoadPromises = new Map();

export function createRouteCategoryButtons(container) {
  const buttons = ROUTE_CATEGORIES.map(category => {
    const button = document.createElement("button");
    button.className = "region-button";
    button.type = "button";
    button.dataset.region = category.id;
    button.setAttribute("aria-pressed", "false");
    button.textContent = category.label;
    return button;
  });

  container.replaceChildren(...buttons);
  return buttons;
}

export function bindRouteCategoryButtons(buttons, getSelected, onChange) {
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const categories = new Set(getSelected());
      if (categories.has(button.dataset.region)) categories.delete(button.dataset.region);
      else categories.add(button.dataset.region);
      onChange(categories);
    });
  });
}

export function parseRouteCategories(value) {
  if (value === null) return new Set(["dinsdaggers"]);
  return new Set(
    (value || "")
      .split(",")
      .map(category => category.trim())
      .filter(category => categoriesById.has(category))
  );
}

export function sameRouteCategories(first, second) {
  return first.size === second.size && [...first].every(category => second.has(category));
}

export function updateRouteSourceNote(element, categories) {
  const notes = [...categories]
    .map(category => categoriesById.get(category)?.sourceNote)
    .filter(Boolean);

  element.hidden = notes.length === 0;
  if (notes.length) element.innerHTML = notes.join("<br>");
  else element.replaceChildren();
}

export function loadRouteCategory(categoryId) {
  const category = categoriesById.get(categoryId);
  if (!category) throw new Error(`Onbekende routecategorie: ${categoryId}`);

  const annotateRoutes = routes => routes.map(route => ({
    ...route,
    ...(route.sourcePath ? { source: new URL(route.sourcePath, import.meta.url).href } : {}),
    sourceRegion: categoryId
  }));
  const loadedRoutes = globalThis[category.dataGlobal];
  if (Array.isArray(loadedRoutes)) return Promise.resolve(annotateRoutes(loadedRoutes));

  if (!categoryLoadPromises.has(categoryId)) {
    const loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = new URL(category.dataFile, import.meta.url).href;
      script.onload = () => {
        const routes = globalThis[category.dataGlobal];
        if (Array.isArray(routes)) resolve(routes);
        else reject(new Error(`${category.dataFile} bevat geen routegegevens.`));
      };
      script.onerror = () => reject(new Error(`${category.dataFile} kon niet worden geladen.`));
      document.head.append(script);
    }).catch(error => {
      categoryLoadPromises.delete(categoryId);
      throw error;
    });

    categoryLoadPromises.set(categoryId, loadPromise);
  }

  return categoryLoadPromises.get(categoryId).then(annotateRoutes);
}
