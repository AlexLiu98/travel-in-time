(() => {
  "use strict";

  const STORAGE_KEY = "travel-footprint-v1";
  const accountMode = new URLSearchParams(window.location.search).get("mode") === "account";
  const singlePageQuery = window.matchMedia("(max-width: 760px)");
  const regionNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["zh-CN"], { type: "region" })
    : null;
  const els = {
    back: document.getElementById("backLink"),
    brand: document.getElementById("brandLink"),
    state: document.getElementById("dataState"),
    book: document.getElementById("passportBook"),
    open: document.getElementById("openPassport"),
    close: document.getElementById("closePassport"),
    spread: document.getElementById("bookSpread"),
    left: document.getElementById("leftPage"),
    right: document.getElementById("rightPage"),
    sheet: document.getElementById("turnSheet"),
    prev: document.getElementById("prevPage"),
    next: document.getElementById("nextPage"),
    replay: document.getElementById("replayStamps"),
    chapter: document.getElementById("chapterLabel"),
    indicator: document.getElementById("pageIndicator"),
    toast: document.getElementById("passportToast")
  };

  let state = { countries: [], cities: [], cityRatings: {} };
  let pages = [];
  let pageIndex = 0;
  let opened = false;
  let turning = false;
  let toastTimer = 0;
  let pointerStartX = null;

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalizeState = value => {
    const input = value && typeof value === "object" ? value : {};
    return {
      countries: Array.isArray(input.countries) ? input.countries : [],
      cities: Array.isArray(input.cities) ? input.cities : [],
      cityRatings: input.cityRatings && typeof input.cityRatings === "object" ? input.cityRatings : {}
    };
  };

  const getCountryName = (code, fallback = "") => {
    if (fallback) return fallback;
    const upper = String(code || "").toUpperCase();
    if (!upper) return "未知国家 / 地区";
    try { return regionNames?.of(upper) || upper; }
    catch { return upper; }
  };

  const showToast = message => {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1900);
  };

  const setDataState = (message, failed = false) => {
    els.state.lastChild.textContent = message;
    els.state.classList.toggle("error", failed);
  };

  const readLocalState = () => {
    const candidateKeys = [STORAGE_KEY];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${STORAGE_KEY}:`)) candidateKeys.unshift(key);
    }
    for (const key of candidateKeys) {
      try {
        const value = normalizeState(JSON.parse(localStorage.getItem(key) || "{}"));
        if (value.countries.length || value.cities.length) return value;
      } catch { /* try the next cache */ }
    }
    return normalizeState({});
  };

  const getCountries = () => {
    const countries = new Map();
    state.countries.forEach(country => {
      const code = String(country.code || "").toUpperCase();
      if (!code) return;
      countries.set(code, { code, name: getCountryName(code, country.name) });
    });
    state.cities.forEach(city => {
      const code = String(city.countryCode || "").toUpperCase();
      if (!code || countries.has(code)) return;
      countries.set(code, { code, name: getCountryName(code, city.countryName) });
    });
    return [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  };

  const chunks = (values, size) => {
    const result = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
  };

  const flagMarkup = code => {
    const safeCode = /^[A-Z]{2}$/.test(code) ? code : "--";
    if (safeCode === "--") return `<span class="flag-mark">--</span>`;
    return `<span class="flag-mark">${safeCode}<svg viewBox="0 0 640 480" aria-hidden="true"><use href="./flags-sprite.svg?v=2#flag-${safeCode.toLowerCase()}"></use></svg></span>`;
  };

  const stampStyle = index => {
    const tilts = [-6, 3, -2, 6, -4, 2];
    const inks = ["#7c3042", "#285d68", "#5e5578", "#38664f", "#8a5734", "#365e85"];
    return `--tilt:${tilts[index % tilts.length]}deg;--stamp-ink:${inks[index % inks.length]};--delay:${90 + (index % 6) * 110}ms`;
  };

  const countryStamp = (country, number, index) => {
    const code = String(country.code || "").toUpperCase();
    return `<article class="visa-stamp country-stamp" data-stamp style="${stampStyle(index)}">
      <div class="stamp-inner">
        <div class="stamp-top">${flagMarkup(code)}<span>ENTRY PERMIT</span></div>
        <h3>${escapeHtml(country.name)}</h3>
        <p>${escapeHtml(code)} · COUNTRY / REGION</p>
        <div class="stamp-meta"><span>TRAVEL IN TIME</span><span>NO. ${String(number).padStart(3, "0")}</span></div>
      </div>
    </article>`;
  };

  const cityStamp = (city, number, index) => {
    const code = String(city.countryCode || "").toUpperCase();
    const region = [city.region, city.countryName || getCountryName(code)].filter(Boolean).join(" · ");
    return `<article class="visa-stamp city-stamp" data-stamp style="${stampStyle(index + 2)}">
      <div class="stamp-inner">
        <div class="stamp-top">${flagMarkup(code)}<span>ARRIVAL</span></div>
        <h3>${escapeHtml(city.name || "未命名城市")}</h3>
        <p>${escapeHtml(region || code || "TRAVEL DESTINATION")}</p>
        <div class="stamp-meta"><span>PERSONALLY VISITED</span><span>NO. ${String(number).padStart(3, "0")}</span></div>
      </div>
    </article>`;
  };

  const pageHeading = (eyebrow, title, meta) => `<header class="page-heading">
    <div><span>${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div><small>${escapeHtml(meta)}</small>
  </header>`;

  const makeSummaryPage = (countryCount, cityCount) => ({
    chapter: "旅程总览",
    html: `<div class="summary-page">
      ${pageHeading("TRAVEL DOCUMENT", "旅程总览", "TRAVEL IN TIME")}
      <div class="summary-seal" data-stamp style="--delay:100ms">✦</div>
      <div class="summary-copy"><p>这本护照由已经记录的真实足迹自动装订。每一个印章，都代表一次亲自抵达。</p></div>
      <div class="summary-stats">
        <div class="summary-stat"><strong>${countryCount}</strong><span>国家 / 地区签章</span></div>
        <div class="summary-stat"><strong>${cityCount}</strong><span>城市入境签章</span></div>
      </div>
      <div class="summary-note">无需额外填写资料；游客足迹读取自当前浏览器，登录状态下读取已同步的账号足迹。</div>
    </div>`
  });

  const makeStampPage = (items, type, pageNumber, startNumber) => {
    const countryPage = type === "country";
    const title = countryPage ? "国家与地区签章" : "城市入境记录";
    const eyebrow = countryPage ? "COUNTRY VISAS" : "CITY ARRIVALS";
    const stamps = items.map((item, index) => countryPage
      ? countryStamp(item, startNumber + index, index)
      : cityStamp(item, startNumber + index, index)).join("");
    return {
      chapter: title,
      html: `${pageHeading(eyebrow, title, `VISA PAGE ${String(pageNumber).padStart(2, "0")}`)}<div class="stamp-grid">${stamps}</div>`
    };
  };

  const makeBlankPage = (empty = false) => ({
    chapter: empty ? "等待下一次抵达" : "旅程未完待续",
    html: `<div class="blank-page"><div><span>✦</span><h2>${empty ? "护照还没有签章" : "下一页，留给新的旅程"}</h2>
      <p>${empty ? "先在旅行地图中记录去过的国家和城市，它们会自动出现在这里。" : "继续在地图中记录足迹，这一页会被新的入境章慢慢填满。"}</p>
      <a href="${accountMode ? "./index.html?mode=account" : "./index.html"}">返回地图记录足迹</a></div></div>`
  });

  const buildPages = () => {
    const countries = getCountries();
    const cities = [...state.cities];
    pages = [makeSummaryPage(countries.length, cities.length)];
    chunks(countries, 6).forEach((group, index) => pages.push(makeStampPage(group, "country", pages.length + 1, index * 6 + 1)));
    chunks(cities, 6).forEach((group, index) => pages.push(makeStampPage(group, "city", pages.length + 1, index * 6 + 1)));
    if (!countries.length && !cities.length) pages.push(makeBlankPage(true));
    if (pages.length % 2) pages.push(makeBlankPage(false));
    pageIndex = 0;
    renderSpread(false);
  };

  const pageStep = () => singlePageQuery.matches ? 1 : 2;

  const animateStamps = () => {
    const visiblePages = singlePageQuery.matches ? [els.left] : [els.left, els.right];
    const stamps = visiblePages.flatMap(page => [...page.querySelectorAll("[data-stamp]")]);
    stamps.forEach(stamp => stamp.classList.remove("is-stamped"));
    void els.spread.offsetWidth;
    stamps.forEach(stamp => stamp.classList.add("is-stamped"));
    els.replay.disabled = stamps.length === 0;
  };

  function renderSpread(animate = true) {
    const left = pages[pageIndex] || makeBlankPage(false);
    const right = pages[pageIndex + 1] || makeBlankPage(false);
    els.left.innerHTML = left.html;
    els.right.innerHTML = right.html;
    const step = pageStep();
    const lastVisible = Math.min(pages.length, pageIndex + step);
    els.chapter.textContent = step === 1 || left.chapter === right.chapter ? left.chapter : `${left.chapter} · ${right.chapter}`;
    els.indicator.textContent = step === 1
      ? `${String(pageIndex + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`
      : `${String(pageIndex + 1).padStart(2, "0")}–${String(lastVisible).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    els.prev.disabled = pageIndex === 0;
    els.next.disabled = pageIndex + step >= pages.length;
    if (animate && opened) setTimeout(animateStamps, 40);
  }

  const turnTo = direction => {
    if (!opened || turning) return;
    const step = pageStep();
    const target = pageIndex + direction * step;
    if (target < 0 || target >= pages.length) return;
    turning = true;
    const source = direction > 0 ? (singlePageQuery.matches ? els.left : els.right) : els.left;
    els.sheet.innerHTML = source.innerHTML;
    els.sheet.className = `turn-sheet ${direction > 0 ? "turn-next" : "turn-prev"}`;
    setTimeout(() => {
      pageIndex = target;
      renderSpread(false);
    }, 280);
    setTimeout(() => {
      els.sheet.className = "turn-sheet";
      els.sheet.replaceChildren();
      turning = false;
      animateStamps();
    }, 780);
  };

  const openBook = () => {
    if (opened) return;
    opened = true;
    els.book.classList.add("opened");
    els.open.setAttribute("aria-expanded", "true");
    setTimeout(animateStamps, 900);
    showToast("旅行护照已打开");
  };

  const closeBook = () => {
    if (!opened || turning) return;
    opened = false;
    pageIndex = 0;
    els.book.classList.remove("opened");
    els.open.setAttribute("aria-expanded", "false");
    setTimeout(() => renderSpread(false), 760);
  };

  const load = async () => {
    const backHref = accountMode ? "./index.html?mode=account" : "./index.html";
    els.back.href = backHref;
    els.brand.href = backHref;
    if (accountMode) {
      setDataState(" 正在读取账号足迹");
      try {
        const response = await fetch("/api/footprints", { cache: "no-store" });
        if (response.status === 401) {
          window.top.location.href = "/";
          return;
        }
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        state = normalizeState(data.state);
        if (data.accountKey) localStorage.setItem(`${STORAGE_KEY}:${data.accountKey}`, JSON.stringify(state));
        setDataState(" 已同步账号足迹");
      } catch {
        state = readLocalState();
        setDataState(" 暂用本机足迹", true);
      }
    } else {
      state = readLocalState();
      setDataState(" 游客足迹 · 当前浏览器");
    }
    buildPages();
  };

  els.open.addEventListener("click", openBook);
  els.close.addEventListener("click", closeBook);
  els.prev.addEventListener("click", () => turnTo(-1));
  els.next.addEventListener("click", () => turnTo(1));
  els.replay.addEventListener("click", () => {
    animateStamps();
    showToast("入境章已重新盖印");
  });
  document.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") turnTo(-1);
    if (event.key === "ArrowRight") turnTo(1);
    if (event.key === "Escape") closeBook();
  });
  els.spread.addEventListener("pointerdown", event => { pointerStartX = event.clientX; });
  els.spread.addEventListener("pointerup", event => {
    if (pointerStartX === null) return;
    const distance = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(distance) < 55) return;
    turnTo(distance < 0 ? 1 : -1);
  });
  singlePageQuery.addEventListener("change", () => {
    pageIndex = singlePageQuery.matches ? pageIndex : pageIndex - (pageIndex % 2);
    renderSpread(opened);
  });

  load();
})();
