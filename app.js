(() => {
  "use strict";

  const STORAGE_KEY = "travel-footprint-v1";
  const SOVEREIGN_COUNT = 195;
  const ISO_CODES = "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK".split(" ");
  const FALLBACK_NAMES = { CN: "中国", DE: "德国", IT: "意大利", FR: "法国", GB: "英国", US: "美国", XK: "科索沃" };
  const CITY_NAME_ALIASES = {
    AT: { wien: "维也纳", vienna: "维也纳", "维也纳州": "维也纳" },
    IT: { pompei: "庞贝", pompeii: "庞贝", "蓬佩伊": "庞贝" },
    PL: { zakopane: "扎科帕内", "札科帕内": "扎科帕内" }
  };
  const CITY_SEARCH_ALIASES = {
    "维也纳": "Wien",
    "扎科帕内": "Zakopane",
    "庞贝": "Pompei",
    "马略卡": "Mallorca",
    "马略卡岛": "Mallorca"
  };
  const CHINA_REGION_CODES = new Set(["CN", "TW", "HK", "MO"]);
  const WORLD_MAP_BOUNDS = [[-85.05112878, -180], [85.05112878, 180]];
  const CHINA_MAP_BOUNDS = [[15.5, 71.5], [55.5, 137.5]];
  const els = Object.fromEntries([
    "countryCount", "countryProgress", "cityCount", "chinaCityCount", "worldTabMeta", "chinaTabMeta",
    "mapLabel", "mapHint", "mapFallback", "countryGroup", "countrySelect", "addCountryBtn", "cityInput",
    "searchCityBtn", "cityCountryGroup", "cityCountrySelect", "searchStatus", "searchResults", "manualCityBtn",
    "addTitle", "viewBadge", "visitedTitle", "filterInput", "visitedList", "fitBtn", "exportBtn", "importBtn",
    "importFile", "clearBtn", "confirmDialog", "confirmClearBtn", "toast", "saveNote"
  ].map(id => [id, document.getElementById(id)]));

  let currentView = "world";
  let map = null;
  let baseTileLayer = null;
  let chinaTileLayer = null;
  let markerLayer = null;
  let worldBoundaryLayer = null;
  let chinaProvinceLayer = null;
  let chinaLabelLayer = null;
  let worldCountriesData = null;
  let chinaProvincesData = null;
  let countryCodeMap = {};
  let pendingMarker = null;
  let pendingLookupId = 0;
  let pendingMapCityName = "";
  let pendingMapCountryCode = "";
  let pendingPreviousCountryCode = "";
  let lastRequestAt = 0;
  let toastTimer = null;
  let activeStorageKey = STORAGE_KEY;

  const regionNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["zh-CN"], { type: "region" })
    : null;
  const traditionalToSimplified = window.OpenCC?.Converter
    ? window.OpenCC.Converter({ from: "tw", to: "cn" })
    : value => String(value || "");
  let state = loadState();

  function toSimplified(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try { return traditionalToSimplified(text); } catch { return text; }
  }

  function localizeCityName(value, countryCode) {
    const simplified = toSimplified(value);
    const key = simplified.toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
    return CITY_NAME_ALIASES[String(countryCode || "").toUpperCase()]?.[key] || simplified;
  }

  function getCitySearchQuery(value) {
    return CITY_SEARCH_ALIASES[normalized(value)] || value;
  }

  function getCountryName(code) {
    if (!code) return "未知国家 / 地区";
    const upper = code.toUpperCase();
    if (FALLBACK_NAMES[upper]) return FALLBACK_NAMES[upper];
    try { return toSimplified(regionNames?.of(upper) || upper); } catch { return upper; }
  }

  function normalizeCountryCode(code) {
    const upper = String(code || "").toUpperCase();
    return CHINA_REGION_CODES.has(upper) ? "CN" : upper;
  }

  function isChinaPlace(item) {
    return normalizeCountryCode(typeof item === "string" ? item : item?.countryCode) === "CN";
  }

  function normalizeStateData(data) {
    const countriesByCode = new Map();
    data.countries.forEach(item => {
      const originalCode = String(item.code || "").toUpperCase();
      const code = normalizeCountryCode(item.code);
      if (!code || (countriesByCode.has(code) && originalCode !== code)) return;
      countriesByCode.set(code, {
        ...item,
        code,
        name: getCountryName(code),
        lat: originalCode === code ? item.lat : null,
        lng: originalCode === code ? item.lng : null
      });
    });
    return {
      countries: [...countriesByCode.values()],
      cities: data.cities.map(item => {
        const originalCode = String(item.countryCode || "").toUpperCase();
        const countryCode = normalizeCountryCode(originalCode);
        return {
          ...item,
          name: localizeCityName(item.name, originalCode),
          countryCode,
          countryName: countryCode ? getCountryName(countryCode) : toSimplified(item.countryName),
          region: CHINA_REGION_CODES.has(originalCode) && originalCode !== "CN"
            ? ({ TW: "台湾省", HK: "香港特别行政区", MO: "澳门特别行政区" }[originalCode])
            : toSimplified(item.region)
        };
      })
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.countries) && Array.isArray(saved.cities)) {
        const normalizedState = normalizeStateData(saved);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
        return normalizedState;
      }
    } catch { /* use a clean state */ }
    return { countries: [], cities: [] };
  }

  function saveState() {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
  }

  function setSyncStatus(message, failed = false) {
    if (!els.saveNote) return;
    els.saveNote.lastChild.textContent = ` ${message}`;
    els.saveNote.classList.toggle("sync-error", failed);
  }

  function normalized(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
  }

  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2300);
  }

  function populateCountries() {
    const countries = ISO_CODES
      .filter(code => !["TW", "HK", "MO"].includes(code))
      .map(code => ({ code, name: getCountryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    [els.countrySelect, els.cityCountrySelect].forEach((select, index) => {
      countries.forEach(({ code, name }) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = `${name} · ${code}`;
        select.appendChild(option);
      });
      if (index === 1) select.value = "";
    });
  }

  function initMap() {
    if (!window.L) {
      els.mapFallback.hidden = false;
      return;
    }
    map = L.map("map", {
      worldCopyJump: false,
      zoomControl: true,
      minZoom: 2,
      maxBounds: WORLD_MAP_BOUNDS,
      maxBoundsViscosity: 1
    }).setView([28, 12], 2);
    map.createPane("mapBoundaryPane");
    map.getPane("mapBoundaryPane").style.zIndex = "230";
    map.getPane("mapBoundaryPane").style.pointerEvents = "none";
    baseTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      noWrap: true,
      bounds: WORLD_MAP_BOUNDS,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on("click", handleMapClick);
    applyMapScope();
    renderMarkers();
    loadMapBoundaryData();
  }

  async function loadMapBoundaryData() {
    try {
      const responses = await Promise.all([
        fetch("./data/world-countries.geo.json"),
        fetch("./data/china-provinces.geo.json"),
        fetch("./data/country-code-map.json")
      ]);
      if (responses.some(response => !response.ok)) throw new Error("boundary data unavailable");
      [worldCountriesData, chinaProvincesData, countryCodeMap] = await Promise.all(responses.map(response => response.json()));
      hydrateCountryCoordinatesFromBoundaries();
      render();
    } catch { /* the base map remains usable without boundary overlays */ }
  }

  function hydrateCountryCoordinatesFromBoundaries() {
    if (!map || !worldCountriesData) return;
    let changed = false;
    state.countries.forEach(country => {
      if (Number.isFinite(country.lat) && Number.isFinite(country.lng)) return;
      const alpha3 = countryCodeMap[country.code];
      const feature = worldCountriesData.features.find(item => item.id === alpha3);
      if (!feature) return;
      const center = L.geoJSON(feature).getBounds().getCenter();
      country.lat = center.lat;
      country.lng = center.lng;
      changed = true;
    });
    if (changed) saveState();
  }

  function createChinaTileLayer() {
    const ChinaTiles = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = L.DomUtil.create("canvas", "leaflet-tile");
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        tile.setAttribute("aria-hidden", "true");
        const context = tile.getContext("2d");
        const image = new Image();
        const subdomain = "abc"[Math.abs(coords.x + coords.y) % 3];

        image.onload = () => {
          const tileOrigin = L.point(coords.x * size.x, coords.y * size.y);
          const addRing = ring => {
            ring.forEach(([lng, lat], index) => {
              const point = this._map.project(L.latLng(lat, lng), coords.z).subtract(tileOrigin);
              if (index === 0) context.moveTo(point.x, point.y);
              else context.lineTo(point.x, point.y);
            });
            context.closePath();
          };

          context.beginPath();
          chinaProvincesData.features.forEach(feature => {
            const geometry = feature.geometry;
            if (!geometry) return;
            const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
            polygons.forEach(polygon => polygon.forEach(addRing));
          });
          context.save();
          context.clip("evenodd");
          context.drawImage(image, 0, 0, size.x, size.y);
          context.restore();
          done(null, tile);
        };
        image.onerror = () => done(new Error("地图文字加载失败"), tile);
        image.src = `https://${subdomain}.tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`;
        return tile;
      }
    });

    return new ChinaTiles({
      minZoom: 3,
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors"
    });
  }

  function getProvinceLabel(name) {
    return String(name || "")
      .replace(/特别行政区$/, "")
      .replace(/壮族自治区$/, "")
      .replace(/回族自治区$/, "")
      .replace(/维吾尔自治区$/, "")
      .replace(/自治区$/, "")
      .replace(/[省市]$/, "");
  }

  function createChinaProvinceLabels() {
    const labels = L.layerGroup();
    chinaProvincesData.features.forEach(feature => {
      const properties = feature.properties || {};
      const point = properties.centroid || properties.center;
      if (!properties.name || !Array.isArray(point)) return;
      L.marker([point[1], point[0]], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "china-admin-label",
          html: `<span>${escapeHtml(getProvinceLabel(properties.name))}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      }).addTo(labels);
    });
    return labels;
  }

  function renderBoundaryLayers() {
    if (!map) return;
    map.getContainer().classList.toggle("china-only-map", currentView === "china");
    [worldBoundaryLayer, chinaProvinceLayer, chinaLabelLayer].forEach(layer => {
      if (layer) map.removeLayer(layer);
    });
    worldBoundaryLayer = null;
    chinaProvinceLayer = null;
    chinaLabelLayer = null;

    if (currentView === "china") {
      if (baseTileLayer && map.hasLayer(baseTileLayer)) map.removeLayer(baseTileLayer);
      if (chinaTileLayer && !map.hasLayer(chinaTileLayer)) chinaTileLayer.addTo(map);
    } else if (baseTileLayer && !map.hasLayer(baseTileLayer)) {
      baseTileLayer.addTo(map);
    }
    if (currentView === "world" && chinaTileLayer && map.hasLayer(chinaTileLayer)) map.removeLayer(chinaTileLayer);
    if (!worldCountriesData || !chinaProvincesData) return;

    if (currentView === "world") {
      const visited = new Set(state.countries.map(country => countryCodeMap[country.code]).filter(Boolean));
      if (visited.has("CHN")) visited.add("TWN");
      worldBoundaryLayer = L.geoJSON(worldCountriesData, {
        pane: "mapBoundaryPane",
        interactive: false,
        style: feature => {
          const highlighted = visited.has(feature.id);
          return {
            color: highlighted ? "#50dedb" : "#8ba2b8",
            weight: highlighted ? 1.8 : 0.75,
            opacity: highlighted ? 1 : 0.72,
            fillColor: highlighted ? "#35bfd0" : "transparent",
            fillOpacity: highlighted ? 0.22 : 0
          };
        }
      }).addTo(map);
      return;
    }

    if (!chinaTileLayer) chinaTileLayer = createChinaTileLayer();
    if (!map.hasLayer(chinaTileLayer)) chinaTileLayer.addTo(map);
    chinaProvinceLayer = L.geoJSON(chinaProvincesData, {
      pane: "mapBoundaryPane",
      interactive: false,
      style: { color: "#176f82", weight: 1.45, opacity: 1, fillColor: "#49d6d1", fillOpacity: 0.1 }
    }).addTo(map);
    chinaLabelLayer = createChinaProvinceLabels().addTo(map);
  }

  function applyMapScope() {
    if (!map) return;
    if (currentView === "china") {
      map.setMinZoom(3);
      map.setMaxBounds(CHINA_MAP_BOUNDS);
    } else {
      map.setMinZoom(2);
      map.setMaxBounds(WORLD_MAP_BOUNDS);
    }
  }

  function countryIcon() {
    return L.divIcon({ className: "", html: '<div class="country-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
  }

  function cityIcon() {
    return L.divIcon({ className: "", html: '<div class="city-marker"></div>', iconSize: [14, 19], iconAnchor: [7, 17] });
  }

  function pendingIcon() {
    return L.divIcon({ className: "", html: '<div class="pending-marker"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }

  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const showChinaOnly = currentView === "china";

    if (!showChinaOnly) {
      state.countries.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach(item => {
        L.marker([item.lat, item.lng], { icon: countryIcon(), zIndexOffset: 100 })
          .bindPopup(`<div class="map-popup"><strong>${escapeHtml(item.name)}</strong><small>已记录国家 / 地区</small></div>`)
          .addTo(markerLayer);
      });
    }

    state.cities
      .filter(item => !showChinaOnly || isChinaPlace(item))
      .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .forEach(item => {
        const marker = L.marker([item.lat, item.lng], { icon: cityIcon(), zIndexOffset: 300 })
          .bindPopup(`<div class="map-popup"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.region || item.countryName)}</small></div>`);
        if (showChinaOnly) {
          marker.bindTooltip(escapeHtml(item.name), {
            permanent: true,
            direction: "top",
            offset: [0, -15],
            className: "visited-city-tooltip"
          });
        }
        marker.addTo(markerLayer);
      });
  }

  function render() {
    const countryTotal = state.countries.length;
    const cityTotal = state.cities.length;
    const chinaCities = state.cities.filter(isChinaPlace).length;
    els.countryCount.textContent = countryTotal;
    els.cityCount.textContent = cityTotal;
    els.chinaCityCount.textContent = chinaCities;
    els.countryProgress.textContent = `${Math.min(100, Math.round(countryTotal / SOVEREIGN_COUNT * 100))}%`;
    els.worldTabMeta.textContent = `${countryTotal} 个国家 · ${cityTotal} 个城市`;
    els.chinaTabMeta.textContent = `${chinaCities} 个城市`;
    renderVisitedList();
    renderBoundaryLayers();
    renderMarkers();
  }

  function renderVisitedList() {
    const query = normalized(els.filterInput.value);
    const isChina = currentView === "china";
    const matchesQuery = item => normalized(`${item.name} ${item.countryName || ""} ${item.region || ""}`).includes(query);
    const countries = (isChina ? [] : state.countries)
      .map(item => ({ ...item, kind: "country" }))
      .filter(matchesQuery)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const cities = state.cities
      .filter(city => isChina ? isChinaPlace(city) : !isChinaPlace(city))
      .map(item => ({ ...item, kind: "city" }))
      .filter(matchesQuery)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    els.visitedList.replaceChildren();
    if (!countries.length && !cities.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = query
        ? "<span>⌁</span><strong>没有匹配的地点</strong><small>换个关键词试试</small>"
        : `<span>✦</span><strong>${isChina ? "还没有中国城市足迹" : "第一段足迹正等你记录"}</strong><small>可以搜索城市，也可以点击地图</small>`;
      els.visitedList.appendChild(empty);
      return;
    }

    if (isChina) {
      els.visitedList.appendChild(createClassifiedCityGroup("城市（按省级地区）", cities, true));
      return;
    }

    const columns = document.createElement("div");
    columns.className = "visited-columns";
    columns.append(
      createVisitedGroup("国家 / 地区", countries, "还没有记录国家"),
      createClassifiedCityGroup("城市（按国家）", cities, false)
    );
    els.visitedList.appendChild(columns);
  }

  function createVisitedGroup(title, items, emptyText) {
    const group = document.createElement("section");
    group.className = "visited-group";
    group.setAttribute("aria-label", title);

    const heading = document.createElement("div");
    heading.className = "visited-group-heading";
    const label = document.createElement("h3");
    label.textContent = title;
    const count = document.createElement("span");
    count.textContent = items.length;
    heading.append(label, count);

    const list = document.createElement("div");
    list.className = "visited-group-list";
    if (items.length) {
      items.forEach(item => list.appendChild(createPlaceRow(item)));
    } else {
      const empty = document.createElement("div");
      empty.className = "visited-group-empty";
      empty.textContent = emptyText;
      list.appendChild(empty);
    }

    group.append(heading, list);
    return group;
  }

  function getChinaRegionName(city) {
    const region = String(city.region || "").trim();
    const ignoredRegions = ["中国", "中华人民共和国", "手动记录"];
    if (region && !ignoredRegions.includes(region)) return region;

    const cityName = normalized(city.name);
    const specialRegions = [
      { names: ["北京", "北京市", "beijing"], label: "北京市" },
      { names: ["天津", "天津市", "tianjin"], label: "天津市" },
      { names: ["上海", "上海市", "shanghai"], label: "上海市" },
      { names: ["重庆", "重庆市", "chongqing"], label: "重庆市" },
      { names: ["香港", "香港特别行政区", "hong kong"], label: "香港特别行政区" },
      { names: ["澳门", "澳门特别行政区", "macao", "macau"], label: "澳门特别行政区" }
    ];
    const match = specialRegions.find(item => item.names.some(name => cityName.includes(normalized(name))));
    return match?.label || "省份待确认";
  }

  function createClassifiedCityGroup(title, items, isChina) {
    const group = document.createElement("section");
    group.className = "visited-group classified-city-group";
    group.setAttribute("aria-label", title);

    const heading = document.createElement("div");
    heading.className = "visited-group-heading";
    const label = document.createElement("h3");
    label.textContent = title;
    const count = document.createElement("span");
    count.textContent = items.length;
    heading.append(label, count);

    const content = document.createElement("div");
    content.className = "city-classification-list";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "visited-group-empty";
      empty.textContent = "还没有记录城市";
      content.appendChild(empty);
    } else {
      const classified = new Map();
      items.forEach(city => {
        const key = isChina
          ? getChinaRegionName(city)
          : city.countryCode || city.countryName || "unknown";
        const groupLabel = isChina
          ? key
          : city.countryName || getCountryName(city.countryCode);
        if (!classified.has(key)) classified.set(key, { label: groupLabel, cities: [] });
        classified.get(key).cities.push(city);
      });

      [...classified.values()]
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
        .forEach(entry => {
          const block = document.createElement("section");
          block.className = "city-subgroup";

          const blockHeading = document.createElement("div");
          blockHeading.className = "city-subgroup-heading";
          const blockTitle = document.createElement("h4");
          blockTitle.textContent = `${entry.label}：`;
          blockHeading.append(blockTitle);

          const cityList = document.createElement("div");
          cityList.className = "city-subgroup-list";
          entry.cities
            .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
            .forEach(city => cityList.appendChild(createPlaceRow(city, { grouped: true })));

          block.append(blockHeading, cityList);
          content.appendChild(block);
        });
    }

    group.append(heading, content);
    return group;
  }

  function createPlaceRow(item, options = {}) {
    const row = document.createElement("article");
    row.className = `place-item ${item.kind}`;
    const symbol = document.createElement("span");
    symbol.className = "place-symbol";
    symbol.textContent = item.kind === "country" ? "◎" : "⌖";
    const copy = document.createElement("div");
    copy.className = "place-copy";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("small");
    meta.textContent = item.kind === "country"
      ? `${item.code} · 国家 / 地区`
      : options.grouped
        ? (item.region && item.region !== "手动记录" ? item.region : "城市")
        : [item.region, item.countryName].filter(Boolean).join(" · ");
    copy.append(title, meta);
    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除 ${item.name}`);
    remove.addEventListener("click", () => removePlace(item.kind, item.kind === "country" ? item.code : item.id));
    row.append(symbol, copy, remove);
    row.addEventListener("click", event => {
      if (event.target === remove) return;
      if (map && Number.isFinite(item.lat) && Number.isFinite(item.lng)) map.flyTo([item.lat, item.lng], item.kind === "country" ? 5 : 9, { duration: .8 });
    });
    return row;
  }

  function removePlace(kind, id) {
    if (kind === "country") {
      const dependent = state.cities.some(city => city.countryCode === id);
      if (dependent) {
        toast("这个国家还有城市记录，请先删除相关城市");
        return;
      }
      state.countries = state.countries.filter(item => item.code !== id);
    } else {
      state.cities = state.cities.filter(item => item.id !== id);
    }
    saveState();
    render();
  }

  async function addCountry(code, options = {}) {
    const upper = normalizeCountryCode(code);
    if (!upper) {
      toast("请先选择一个国家或地区");
      return false;
    }
    if (state.countries.some(item => item.code === upper)) {
      if (!options.silent) toast("这个国家已经记录过了");
      return false;
    }
    const item = {
      code: upper,
      name: options.name || getCountryName(upper),
      lat: Number.isFinite(options.lat) ? options.lat : null,
      lng: Number.isFinite(options.lng) ? options.lng : null,
      addedAt: Date.now()
    };
    state.countries.push(item);
    saveState();
    render();
    if (!options.silent) toast(`已记录：${item.name}`);
    if (!Number.isFinite(item.lat)) {
      hydrateCountryCoordinatesFromBoundaries();
      if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) renderMarkers();
      else hydrateCountryLocation(item);
    }
    return true;
  }

  async function hydrateCountryLocation(item) {
    try {
      const response = await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(item.code)}?fields=latlng`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.latlng) && data.latlng.length === 2) {
        item.lat = Number(data.latlng[0]);
        item.lng = Number(data.latlng[1]);
        saveState();
        renderMarkers();
      }
    } catch { /* a coordinate is optional */ }
  }

  function addCity(candidate, options = {}) {
    const originalCountryCode = String(candidate.countryCode || "").toUpperCase();
    const countryCode = normalizeCountryCode(originalCountryCode);
    const name = localizeCityName(candidate.name, originalCountryCode);
    if (!name) {
      toast("请输入城市名称");
      return false;
    }
    const duplicate = state.cities.some(item => normalized(item.name) === normalized(name) && item.countryCode === countryCode);
    if (duplicate) {
      toast("这个城市已经记录过了");
      return false;
    }
    const countryName = countryCode === "CN" ? "中国" : (candidate.countryName || getCountryName(countryCode));
    const city = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      countryCode,
      countryName,
      region: candidate.region || "",
      lat: Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
      lng: Number.isFinite(Number(candidate.lng)) ? Number(candidate.lng) : null,
      addedAt: Date.now()
    };
    state.cities.push(city);
    if (countryCode) addCountry(countryCode, { name: countryName, silent: true });
    saveState();
    clearSearchResults();
    els.cityInput.value = "";
    render();
    toast(`已记录城市：${name}`);
    if (map && Number.isFinite(city.lat) && Number.isFinite(city.lng)) map.flyTo([city.lat, city.lng], 8, { duration: .9 });
    if (options.closePopup && map) map.closePopup();
    return true;
  }

  async function respectRateLimit() {
    const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  }

  function getSearchResultPriority(result) {
    const priorities = {
      city: 100, town: 95, municipality: 90, village: 85, borough: 80,
      island: 70, county: 35, state: 25, administrative: 20, country: 10
    };
    return priorities[result.addresstype] ?? (result.category === "place" ? 50 : 0);
  }

  function addressToCandidate(result, requestedName = "") {
    const address = result.address || {};
    const details = result.namedetails || {};
    const originalCountryCode = String(address.country_code || "").toUpperCase();
    const countryCode = normalizeCountryCode(originalCountryCode);
    const localizedName = details["name:zh-Hans"] || details["name:zh-CN"] || details["name:zh"]
      || address.city || address.town || address.village || address.municipality
      || address.city_district || result.name || String(result.display_name || "").split(",")[0];
    let name = localizeCityName(localizedName, originalCountryCode);
    const requested = toSimplified(requestedName);
    const cityLike = ["city", "town", "municipality", "village", "borough"].includes(result.addresstype);
    if (cityLike && /[\u3400-\u9fff]/.test(requested)) {
      const requestedKey = normalized(requested);
      const nameKey = normalized(name);
      if (["州", "省", "市", "地区", "大区", "行政区"].some(suffix => nameKey === `${requestedKey}${suffix}`)) {
        name = requested;
      }
    }
    const countryName = countryCode ? getCountryName(countryCode) : toSimplified(address.country);
    const region = ({ TW: "台湾省", HK: "香港特别行政区", MO: "澳门特别行政区" }[originalCountryCode])
      || toSimplified(address.state || address.province || address.region || address.county || "");
    return {
      name,
      countryCode,
      countryName,
      region,
      lat: Number(result.lat),
      lng: Number(result.lon),
      detail: [name, region, countryName].filter(Boolean).join(" · "),
      searchPriority: getSearchResultPriority(result)
    };
  }

  async function searchCities() {
    const query = els.cityInput.value.trim();
    if (!query) {
      toast("请输入想记录的城市");
      els.cityInput.focus();
      return;
    }
    clearPendingMapSelection({ clearInput: false });
    const countryCode = currentView === "china" ? "CN,TW,HK,MO" : els.cityCountrySelect.value;
    els.searchCityBtn.disabled = true;
    els.searchStatus.textContent = "正在查找地点…";
    els.searchResults.replaceChildren();
    try {
      await respectRateLimit();
      const lookupQuery = getCitySearchQuery(query);
      const params = new URLSearchParams({
        format: "jsonv2", q: lookupQuery, addressdetails: "1", namedetails: "1", limit: "10",
        "accept-language": "zh-CN,zh-Hans;q=0.9,zh;q=0.8,en;q=0.4"
      });
      if (countryCode) params.set("countrycodes", countryCode.toLowerCase());
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      if (!response.ok) throw new Error("search unavailable");
      const raw = await response.json();
      const seen = new Set();
      const candidates = raw
        .map(result => addressToCandidate(result, query))
        .filter(item => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .sort((a, b) => b.searchPriority - a.searchPriority)
        .filter(item => {
          const key = `${normalized(item.name)}|${item.countryCode}|${normalized(item.region)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 7);
      renderSearchResults(candidates);
      els.searchStatus.textContent = candidates.length ? `找到 ${candidates.length} 个可能地点，请选择正确的一项` : "没有找到匹配地点，可以按输入名称直接记录。";
    } catch {
      els.searchStatus.textContent = "在线地图搜索暂时不可用，仍可直接记录输入的名称。";
    } finally {
      els.searchCityBtn.disabled = false;
    }
  }

  function renderSearchResults(candidates) {
    els.searchResults.replaceChildren();
    candidates.forEach(candidate => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = candidate.name;
      const detail = document.createElement("small");
      detail.textContent = candidate.detail;
      copy.append(title, detail);
      const plus = document.createElement("span");
      plus.textContent = "+";
      button.append(copy, plus);
      button.addEventListener("click", () => addCity(candidate));
      els.searchResults.appendChild(button);
    });
  }

  function clearPendingMapSelection(options = {}) {
    const selectedCityName = pendingMapCityName;
    const selectedCountryCode = pendingMapCountryCode;
    const previousCountryCode = pendingPreviousCountryCode;
    pendingLookupId += 1;
    els.searchStatus.textContent = "";
    els.searchResults.replaceChildren();
    if (pendingMarker && map) {
      map.removeLayer(pendingMarker);
    }
    pendingMarker = null;
    pendingMapCityName = "";
    pendingMapCountryCode = "";
    pendingPreviousCountryCode = "";

    if (options.clearInput && selectedCityName && normalized(els.cityInput.value) === normalized(selectedCityName)) {
      els.cityInput.value = "";
    }
    if (selectedCountryCode && els.cityCountrySelect.value === selectedCountryCode) {
      els.cityCountrySelect.value = previousCountryCode;
    }
    if (options.announce) toast("已取消地图选点");
  }

  function clearSearchResults(options = {}) {
    clearPendingMapSelection(options);
  }

  function addManualCity() {
    const name = els.cityInput.value.trim();
    const countryCode = currentView === "china" ? "CN" : els.cityCountrySelect.value;
    if (!name) {
      toast("请先输入城市名称");
      return;
    }
    if (!countryCode) {
      toast("直接记录时，请选择城市所在国家 / 地区");
      els.cityCountrySelect.focus();
      return;
    }
    addCity({ name, countryCode, countryName: getCountryName(countryCode), region: "手动记录" });
  }

  async function handleMapClick(event) {
    if (!map) return;
    clearPendingMapSelection({ clearInput: true });
    pendingPreviousCountryCode = els.cityCountrySelect.value;
    const lookupId = ++pendingLookupId;
    els.searchStatus.textContent = "正在识别地图位置…";
    els.searchResults.replaceChildren();
    pendingMarker = L.marker(event.latlng, {
      icon: pendingIcon(),
      zIndexOffset: 600,
      bubblingMouseEvents: false
    }).addTo(map);
    pendingMarker.on("click", markerEvent => {
      if (markerEvent.originalEvent) L.DomEvent.stopPropagation(markerEvent.originalEvent);
      clearPendingMapSelection({ clearInput: true, announce: true });
    });
    try {
      await respectRateLimit();
      if (lookupId !== pendingLookupId || !pendingMarker) return;
      const params = new URLSearchParams({
        format: "jsonv2", lat: String(event.latlng.lat), lon: String(event.latlng.lng),
        addressdetails: "1", namedetails: "1", zoom: "12",
        "accept-language": "zh-CN,zh-Hans;q=0.9,zh;q=0.8,en;q=0.4"
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
      if (!response.ok) throw new Error("reverse unavailable");
      const result = await response.json();
      if (lookupId !== pendingLookupId || !pendingMarker) return;
      const candidate = addressToCandidate(result);
      if (currentView === "china" && !isChinaPlace(candidate)) {
        els.searchStatus.textContent = "这里不在中国地图范围内，请切换到世界地图记录。";
        return;
      }
      pendingMapCityName = candidate.name;
      pendingMapCountryCode = candidate.countryCode;
      els.cityInput.value = candidate.name;
      if (currentView === "world" && candidate.countryCode) els.cityCountrySelect.value = candidate.countryCode;
      renderSearchResults([candidate]);
      els.searchStatus.textContent = "已识别这个位置；点击黄色选点可取消。";
    } catch {
      if (lookupId !== pendingLookupId) return;
      els.searchStatus.textContent = "暂时无法识别这个位置，请在右侧输入城市名称。";
    }
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
    const china = view === "china";
    els.countryGroup.hidden = china;
    els.cityCountryGroup.hidden = china;
    els.addTitle.textContent = china ? "添加中国城市" : "添加世界足迹";
    els.viewBadge.textContent = china ? "CHINA" : "WORLD";
    els.visitedTitle.textContent = china ? "我的中国足迹" : "我的世界足迹";
    els.mapLabel.textContent = china ? "中国城市足迹" : "世界足迹";
    els.cityInput.placeholder = china ? "例如：天津、北京、成都" : "例如：Bonn、博洛尼亚、东京";
    els.filterInput.value = "";
    clearSearchResults({ clearInput: true });
    render();
    if (map) {
      applyMapScope();
      map.flyTo(china ? [35.2, 103.8] : [28, 12], china ? 4 : 2, { duration: .8 });
      setTimeout(() => map.invalidateSize(), 100);
    }
  }

  function fitFootprints() {
    if (!map) return;
    const points = [];
    if (currentView === "world") {
      state.countries.forEach(item => { if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) points.push([item.lat, item.lng]); });
    }
    state.cities.forEach(item => {
      if ((currentView === "world" || isChinaPlace(item)) && Number.isFinite(item.lat) && Number.isFinite(item.lng)) points.push([item.lat, item.lng]);
    });
    if (!points.length) {
      map.flyTo(currentView === "china" ? [35.2, 103.8] : [28, 12], currentView === "china" ? 4 : 2, { duration: .7 });
      toast("还没有带坐标的足迹");
      return;
    }
    if (points.length === 1) map.flyTo(points[0], 7, { duration: .8 });
    else map.fitBounds(points, { padding: [55, 55], maxZoom: 8 });
  }

  function exportData() {
    const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `我的旅行足迹-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("足迹备份已导出");
  }

  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.countries) || !Array.isArray(data.cities)) throw new Error("invalid data");
      state = normalizeStateData(data);
      saveState();
      render();
      fitFootprints();
      toast("足迹备份已导入");
    } catch {
      toast("无法导入：请选择本站导出的 JSON 文件");
    } finally {
      els.importFile.value = "";
    }
  }

  function bindEvents() {
    document.querySelectorAll(".view-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
    els.addCountryBtn.addEventListener("click", () => {
      const code = els.countrySelect.value;
      addCountry(code).then(added => { if (added) els.countrySelect.value = ""; });
    });
    els.searchCityBtn.addEventListener("click", searchCities);
    els.cityInput.addEventListener("keydown", event => { if (event.key === "Enter") searchCities(); });
    els.cityInput.addEventListener("input", () => {
      if (pendingMarker) clearPendingMapSelection({ clearInput: false });
    });
    els.manualCityBtn.addEventListener("click", addManualCity);
    els.filterInput.addEventListener("input", renderVisitedList);
    els.fitBtn.addEventListener("click", fitFootprints);
    els.exportBtn.addEventListener("click", exportData);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", () => { if (els.importFile.files[0]) importData(els.importFile.files[0]); });
    els.clearBtn.addEventListener("click", () => els.confirmDialog.showModal());
    els.confirmClearBtn.addEventListener("click", () => {
      state = { countries: [], cities: [] };
      saveState();
      render();
      toast("所有足迹已清空");
    });
    window.addEventListener("resize", () => map?.invalidateSize());
  }

  populateCountries();
  bindEvents();
  render();
  initMap();
  setSyncStatus("游客模式 · 仅保存在本机");
})();
