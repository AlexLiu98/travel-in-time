(() => {
  "use strict";

  const STORAGE_KEY = "travel-footprint-v1";
  const SOVEREIGN_COUNT = 195;
  const ISO_CODES = "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK".split(" ");
  const FALLBACK_NAMES = { CN: "中国", DE: "德国", IT: "意大利", FR: "法国", GB: "英国", US: "美国", XK: "科索沃" };
  const CITY_NAME_ALIASES = {
    AT: { wien: "维也纳", vienna: "维也纳", "维也纳州": "维也纳" },
    IT: { pompei: "庞贝", pompeii: "庞贝", "蓬佩伊": "庞贝", roma: "罗马", rome: "罗马", "罗马市": "罗马" },
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
    "searchCityBtn", "cityCountryGroup", "cityCountrySelect", "searchStatus", "searchResults",
    "addTitle", "viewBadge", "visitedTitle", "filterInput", "visitedList", "fitBtn", "exportBtn", "importBtn",
    "importFile", "clearBtn", "confirmDialog", "confirmClearBtn", "toast", "saveNote"
  ].map(id => [id, document.getElementById(id)]));

  let currentView = "world";
  let map = null;
  let markerLayer = null;
  let worldBoundaryLayer = null;
  let chinaProvinceLayer = null;
  let chinaLabelLayer = null;
  let worldLabelLayer = null;
  let cityLabelLayer = null;
  let worldCountriesData = null;
  let chinaProvincesData = null;
  let countryCodeMap = {};
  let localCities = [];
  let localCityLoadPromise = null;
  let pendingMarker = null;
  let pendingLookupId = 0;
  let pendingMapCityName = "";
  let pendingMapCountryCode = "";
  let pendingPreviousCountryCode = "";
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
    if (!/[\u3400-\u9fff]/.test(text)) return text;
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

  function searchNormalized(value) {
    return normalized(toSimplified(value))
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[’'`-]/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function rawSearchNormalized(value) {
    return normalized(value)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[’'`-]/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
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
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('城市数据 &copy; <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>');
    markerLayer = L.layerGroup().addTo(map);
    map.on("click", handleMapClick);
    map.on("zoomend moveend", refreshVisibleCityLabels);
    map.on("zoomend", refreshWorldCountryLabels);
    applyMapScope();
    renderMarkers();
    loadMapBoundaryData();
    const preloadCities = () => ensureLocalCities().catch(() => {});
    if ("requestIdleCallback" in window) window.requestIdleCallback(preloadCities, { timeout: 1500 });
    else setTimeout(preloadCities, 350);
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

  function createWorldCountryLabels() {
    const labels = L.layerGroup();
    const zoom = map.getZoom();
    worldCountriesData.features.forEach(feature => {
      const bounds = L.geoJSON(feature).getBounds();
      if (!bounds.isValid()) return;
      const span = Math.max(
        bounds.getNorth() - bounds.getSouth(),
        bounds.getEast() - bounds.getWest()
      );
      if ((zoom <= 2 && span < 5) || (zoom === 3 && span < 2)) return;
      const alpha2 = Object.keys(countryCodeMap).find(code => countryCodeMap[code] === feature.id);
      const name = alpha2 ? getCountryName(alpha2) : toSimplified(feature.properties?.name || "");
      if (!name) return;
      L.marker(bounds.getCenter(), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "world-country-label",
          html: `<span>${escapeHtml(name)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      }).addTo(labels);
    });
    return labels;
  }

  function refreshWorldCountryLabels() {
    if (!map || currentView !== "world" || !worldCountriesData) return;
    if (worldLabelLayer) map.removeLayer(worldLabelLayer);
    worldLabelLayer = createWorldCountryLabels().addTo(map);
  }

  function renderBoundaryLayers() {
    if (!map) return;
    map.getContainer().classList.toggle("china-only-map", currentView === "china");
    [worldBoundaryLayer, chinaProvinceLayer, chinaLabelLayer, worldLabelLayer, cityLabelLayer].forEach(layer => {
      if (layer) map.removeLayer(layer);
    });
    worldBoundaryLayer = null;
    chinaProvinceLayer = null;
    chinaLabelLayer = null;
    worldLabelLayer = null;
    cityLabelLayer = null;
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
            fillColor: highlighted ? "#35bfd0" : "#243b52",
            fillOpacity: highlighted ? 0.38 : 0.82
          };
        }
      }).addTo(map);
      worldLabelLayer = createWorldCountryLabels().addTo(map);
      refreshVisibleCityLabels();
      return;
    }
    chinaProvinceLayer = L.geoJSON(chinaProvincesData, {
      pane: "mapBoundaryPane",
      interactive: false,
      style: { color: "#176f82", weight: 1.55, opacity: 1, fillColor: "#8edfe0", fillOpacity: 0.92 }
    }).addTo(map);
    chinaLabelLayer = createChinaProvinceLabels().addTo(map);
    refreshVisibleCityLabels();
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
          .bindPopup(`<div class="map-popup"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(isChinaPlace(item) ? (item.region || item.countryName) : item.countryName)}</small></div>`);
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
    }
    return true;
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

  async function ensureLocalCities() {
    if (localCities.length) return localCities;
    if (!localCityLoadPromise) {
      localCityLoadPromise = fetch("./data/cities-manifest.json")
        .then(async response => {
          if (!response.ok) throw new Error("local city manifest unavailable");
          if (!("DecompressionStream" in window)) throw new Error("this browser cannot read the local city data");
          const manifest = await response.json();
          const chunks = await Promise.all((manifest.files || []).map(async filename => {
            const chunkResponse = await fetch(`./data/${filename}`);
            if (!chunkResponse.ok || !chunkResponse.body) throw new Error("local city data unavailable");
            const stream = chunkResponse.body.pipeThrough(new DecompressionStream("gzip"));
            return new Response(stream).json();
          }));
          return chunks.flat();
        })
        .then(rows => {
          localCities = rows.map(row => {
            const originalCountryCode = String(row[2] || "").toUpperCase();
            const countryCode = normalizeCountryCode(originalCountryCode);
            const name = localizeCityName(toSimplified(row[0] || row[1]), originalCountryCode);
            const searchKeys = [...new Set([name, row[1], ...(row[8] || [])]
              .map(rawSearchNormalized)
              .filter(Boolean))];
            return {
              name,
              originalName: row[1] || name,
              countryCode,
              countryName: getCountryName(countryCode),
              region: toSimplified(row[3] || ""),
              lat: Number(row[4]),
              lng: Number(row[5]),
              population: Number(row[6] || 0),
              featureCode: row[7] || "",
              searchKeys,
              searchText: searchKeys.join("|")
            };
          }).filter(city => city.name && Number.isFinite(city.lat) && Number.isFinite(city.lng));
          refreshVisibleCityLabels();
          return localCities;
        })
        .catch(error => {
          localCityLoadPromise = null;
          throw error;
        });
    }
    return localCityLoadPromise;
  }

  function citySearchScore(city, keys) {
    let score = -1;
    keys.forEach(key => {
      if (city.searchKeys.includes(key)) score = Math.max(score, 1000);
      else if (city.searchKeys.some(value => value.startsWith(key))) score = Math.max(score, 700);
      else if (city.searchText.includes(key)) score = Math.max(score, 400);
    });
    if (score < 0) return score;
    if (["PPLC", "PPLA", "PPLA2"].includes(city.featureCode)) score += 80;
    return score + Math.log10(Math.max(1, city.population)) * 12;
  }

  function refreshVisibleCityLabels() {
    if (!map || !localCities.length || !worldCountriesData) return;
    if (cityLabelLayer) map.removeLayer(cityLabelLayer);
    cityLabelLayer = L.layerGroup();
    const zoom = map.getZoom();
    const bounds = map.getBounds().pad(.08);
    const china = currentView === "china";
    const populationFloor = china
      ? (zoom <= 3 ? 1500000 : zoom === 4 ? 600000 : zoom === 5 ? 180000 : zoom === 6 ? 60000 : 5000)
      : (zoom <= 2 ? 2500000 : zoom === 3 ? 900000 : zoom === 4 ? 300000 : zoom === 5 ? 90000 : 5000);
    const maxLabels = zoom <= 3 ? 65 : zoom <= 5 ? 95 : 130;
    const visible = localCities
      .filter(city => (!china || isChinaPlace(city)) && bounds.contains([city.lat, city.lng]))
      .filter(city => city.population >= populationFloor || ["PPLC", "PPLA"].includes(city.featureCode))
      .filter(city => zoom >= 8 || city.featureCode !== "PPLX")
      .sort((a, b) => b.population - a.population)
      .slice(0, maxLabels);

    visible.forEach(city => {
      L.marker([city.lat, city.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: `city-map-label${china ? " china-city-map-label" : ""}`,
          html: `<span>${escapeHtml(city.name)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      }).addTo(cityLabelLayer);
    });
    cityLabelLayer.addTo(map);
  }

  async function searchCities() {
    const query = els.cityInput.value.trim();
    if (!query) {
      toast("请输入想记录的城市");
      els.cityInput.focus();
      return;
    }
    clearPendingMapSelection({ clearInput: false });
    const countryCode = currentView === "china" ? "CN" : els.cityCountrySelect.value;
    els.searchCityBtn.disabled = true;
    els.searchStatus.textContent = "正在查找地点…";
    els.searchResults.replaceChildren();
    try {
      els.searchStatus.textContent = "正在读取本地城市资料…";
      const cities = await ensureLocalCities();
      const keys = [...new Set([query, getCitySearchQuery(query)].map(searchNormalized).filter(Boolean))];
      const candidates = cities
        .filter(item => !countryCode || item.countryCode === normalizeCountryCode(countryCode))
        .map(item => ({ item, score: citySearchScore(item, keys) }))
        .filter(result => result.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(result => ({
          ...result.item,
          detail: candidateDetail(result.item)
        }))
        .slice(0, 7);
      renderSearchResults(candidates);
      els.searchStatus.textContent = candidates.length
        ? `找到 ${candidates.length} 个可能地点，请选择正确的一项`
        : "本地城市资料中没有找到，请尝试英文名或先选择国家。";
    } catch {
      els.searchStatus.textContent = "本地城市资料加载失败，请刷新页面后重试。";
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

  function candidateDetail(item) {
    return [item.name, isChinaPlace(item) ? item.region : "", item.countryName].filter(Boolean).join(" · ");
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

  function distanceKm(aLat, aLng, bLat, bLng) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(bLat - aLat);
    const dLng = radians(bLng - aLng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const value = sinLat * sinLat
      + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * sinLng * sinLng;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
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
      const cities = await ensureLocalCities();
      if (lookupId !== pendingLookupId || !pendingMarker) return;
      const available = currentView === "china" ? cities.filter(isChinaPlace) : cities;
      let candidate = null;
      let nearestDistance = Infinity;
      available.forEach(city => {
        const distance = distanceKm(event.latlng.lat, event.latlng.lng, city.lat, city.lng);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          candidate = city;
        }
      });
      const maxDistance = map.getZoom() >= 8 ? 45 : map.getZoom() >= 5 ? 160 : 500;
      if (!candidate || nearestDistance > maxDistance) {
        els.searchStatus.textContent = "附近没有匹配到城市，请在右侧输入城市名称搜索。";
        return;
      }
      pendingMapCityName = candidate.name;
      pendingMapCountryCode = candidate.countryCode;
      els.cityInput.value = candidate.name;
      if (currentView === "world" && candidate.countryCode) els.cityCountrySelect.value = candidate.countryCode;
      renderSearchResults([{ ...candidate, detail: candidateDetail(candidate) }]);
      els.searchStatus.textContent = `已匹配附近城市（约 ${Math.round(nearestDistance)} 公里）；点击黄色选点可取消。`;
    } catch {
      if (lookupId !== pendingLookupId) return;
      els.searchStatus.textContent = "本地城市资料加载失败，请刷新页面后重试。";
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
