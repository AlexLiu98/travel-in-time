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
  let audioContext = null;
  let pageNoise = null;

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

  const ensurePageAudio = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
      const master = audioContext.createGain();
      const limiter = audioContext.createDynamicsCompressor();
      master.gain.value = .78;
      limiter.threshold.value = -8;
      limiter.knee.value = 12;
      limiter.ratio.value = 5;
      limiter.attack.value = .003;
      limiter.release.value = .16;
      master.connect(limiter);
      limiter.connect(audioContext.destination);
      audioContext.pageTurnOutput = master;
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    if (!pageNoise) {
      pageNoise = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * .62), audioContext.sampleRate);
      const channel = pageNoise.getChannelData(0);
      let last = 0;
      for (let index = 0; index < channel.length; index += 1) {
        const white = Math.random() * 2 - 1;
        last = last * .62 + white * .38;
        channel[index] = last;
      }
    }
    return audioContext;
  };

  const playPageTurn = (direction = 1, cover = false) => {
    const context = ensurePageAudio();
    if (!context) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = pageNoise;
    source.playbackRate.value = cover ? .88 : 1.05 + Math.random() * .12;
    filter.type = "bandpass";
    filter.frequency.value = cover ? 1250 : 1650;
    filter.Q.value = .38;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(cover ? .27 : .34, now + .028);
    gain.gain.exponentialRampToValueAtTime(.11, now + .17);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (cover ? .5 : .42));
    source.connect(filter);
    if (typeof context.createStereoPanner === "function") {
      const pan = context.createStereoPanner();
      pan.pan.setValueAtTime(direction > 0 ? .65 : -.65, now);
      pan.pan.linearRampToValueAtTime(direction > 0 ? -.5 : .5, now + .45);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(context.pageTurnOutput);
    } else {
      filter.connect(gain);
      gain.connect(context.pageTurnOutput);
    }
    source.start(now);
    source.stop(now + .52);
  };

  const playStampSound = (delay = 0) => {
    const context = ensurePageAudio();
    if (!context) return;
    const when = context.currentTime + delay;
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.type = "triangle";
    thump.frequency.setValueAtTime(112, when);
    thump.frequency.exponentialRampToValueAtTime(76, when + .09);
    thumpGain.gain.setValueAtTime(.0001, when);
    thumpGain.gain.exponentialRampToValueAtTime(.055, when + .008);
    thumpGain.gain.exponentialRampToValueAtTime(.0001, when + .105);
    thump.connect(thumpGain);
    thumpGain.connect(context.pageTurnOutput);
    thump.start(when);
    thump.stop(when + .12);

    const contact = context.createBufferSource();
    const contactFilter = context.createBiquadFilter();
    const contactGain = context.createGain();
    contact.buffer = pageNoise;
    contact.playbackRate.value = 1.8;
    contactFilter.type = "lowpass";
    contactFilter.frequency.value = 520;
    contactGain.gain.setValueAtTime(.0001, when);
    contactGain.gain.exponentialRampToValueAtTime(.075, when + .006);
    contactGain.gain.exponentialRampToValueAtTime(.0001, when + .075);
    contact.connect(contactFilter);
    contactFilter.connect(contactGain);
    contactGain.connect(context.pageTurnOutput);
    contact.start(when);
    contact.stop(when + .09);
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
    const shapes = ["stamp-oblong", "stamp-oval", "stamp-ticket", "stamp-oblong"];
    return `<article class="visa-stamp country-stamp ${shapes[index % shapes.length]}" data-stamp style="${stampStyle(index)}">
      <div class="stamp-inner">
        <div class="stamp-top"><span>IMMIGRATION</span>${flagMarkup(code)}<span>ADMITTED</span></div>
        <div class="stamp-country"><b>${escapeHtml(code)}</b><h3>${escapeHtml(country.name)}</h3></div>
        <div class="stamp-route"><i aria-hidden="true">✦</i><span>ENTRY</span><i aria-hidden="true">✦</i></div>
        <div class="stamp-meta"><span>TRAVEL IN TIME</span><span>ENTRY NO. ${String(number).padStart(4, "0")}</span></div>
        <small class="stamp-micro">VALID FOR ONE RECORDED JOURNEY · BORDER CONTROL</small>
      </div>
    </article>`;
  };

  const pageHeading = (eyebrow, title, meta) => `<header class="page-heading">
    <div><span>${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div><small>${escapeHtml(meta)}</small>
  </header>`;

  const makeDocumentPage = countryCount => ({
    chapter: "旅行证件",
    html: `<div class="document-page">
      ${pageHeading("TRAVEL DOCUMENT", "旅行护照", "TRAVEL IN TIME")}
      <div class="document-motif" aria-hidden="true">
        <svg viewBox="0 0 360 170">
          <path class="motif-route" d="M28 123C89 34 202 38 323 104" />
          <path class="motif-dash" d="M35 126C98 53 205 54 317 106" />
          <g class="motif-compass" transform="translate(176 84)">
            <path d="M0-58 11-12 0 0-11-12Z" /><path d="M0 58 11 12 0 0-11 12Z" />
            <path d="M-58 0-12-11 0 0-12 11Z" /><path d="M58 0 12-11 0 0 12 11Z" />
            <circle r="8" />
          </g>
          <path class="motif-plane" d="m315 91 27-9-10 14 10 8-27-4-13 10 4-13-4-13Z" />
        </svg>
      </div>
      <div class="document-fields">
        <div><span>TYPE / 类型</span><strong>P</strong></div>
        <div><span>CODE / 代码</span><strong>TIT</strong></div>
        <div><span>ENTRY STAMPS / 入境签章</span><strong>${countryCount}</strong></div>
        <div><span>STATUS / 状态</span><strong>VALID</strong></div>
      </div>
    </div>`
  });

  const makeStampPage = (items, pageNumber, startNumber) => {
    const stamps = items.map((item, index) => countryStamp(item, startNumber + index, index)).join("");
    return {
      chapter: "入境签章",
      html: `${pageHeading("VISAS", "签证", `VISA PAGE ${String(pageNumber).padStart(2, "0")}`)}<div class="stamp-grid">${stamps}</div>`
    };
  };

  const makeBlankPage = pageNumber => ({
    chapter: "入境签章",
    html: `${pageHeading("VISAS", "签证", `VISA PAGE ${String(pageNumber).padStart(2, "0")}`)}
      <div class="blank-page"><div><span>✦</span><small>NO ENTRY STAMPS</small></div></div>`
  });

  const buildPages = () => {
    const countries = getCountries();
    pages = [makeDocumentPage(countries.length)];
    chunks(countries, 4).forEach((group, index) => pages.push(makeStampPage(group, index + 2, index * 4 + 1)));
    if (pages.length === 1) pages.push(makeBlankPage(2));
    if (pages.length % 2) pages.push(makeBlankPage(pages.length + 1));
    pageIndex = 0;
    renderSpread(false);
  };

  const pageStep = () => singlePageQuery.matches ? 1 : 2;

  const animateStamps = () => {
    const visiblePages = singlePageQuery.matches ? [els.left] : [els.left, els.right];
    const stamps = visiblePages.flatMap(page => [...page.querySelectorAll("[data-stamp]")]);
    stamps.forEach(stamp => stamp.classList.remove("is-stamped"));
    void els.spread.offsetWidth;
    stamps.forEach((stamp, index) => {
      stamp.classList.add("is-stamped");
      if (opened) playStampSound(.09 + index * .11);
    });
    els.replay.disabled = stamps.length === 0;
  };

  function renderSpread(animate = true) {
    const left = pages[pageIndex] || makeBlankPage(pageIndex + 1);
    const right = pages[pageIndex + 1] || makeBlankPage(pageIndex + 2);
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
    playPageTurn(direction);
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
    playPageTurn(1, true);
    els.book.classList.add("opened");
    els.open.setAttribute("aria-expanded", "true");
    setTimeout(animateStamps, 900);
  };

  const closeBook = () => {
    if (!opened || turning) return;
    opened = false;
    playPageTurn(-1, true);
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
