(() => {
  "use strict";

  const STORAGE_KEY = "travel-footprint-v1";
  const accountMode = new URLSearchParams(window.location.search).get("mode") === "account";
  const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["zh-CN"], { type: "region" }) : null;
  const els = {
    back: document.getElementById("backLink"), brand: document.getElementById("brandLink"), emptyBack: document.getElementById("emptyBackLink"),
    save: document.getElementById("saveState"), share: document.getElementById("shareBtn"), average: document.getElementById("averageRating"),
    rated: document.getElementById("ratedCount"), cities: document.getElementById("cityCount"), filter: document.getElementById("filterInput"),
    list: document.getElementById("rankingList"), empty: document.getElementById("emptyState"), toast: document.getElementById("toast"),
    shareDialog: document.getElementById("shareDialog"), sharePreview: document.getElementById("sharePreview"),
    downloadShare: document.getElementById("downloadShareBtn"), nativeShare: document.getElementById("nativeShareBtn")
  };

  let state = { countries: [], cities: [], cityRatings: {} };
  let activeStorageKey = STORAGE_KEY;
  let cloudReady = false;
  let saveTimer = 0;
  let toastTimer = 0;
  let shareFile = null;
  let shareImageUrl = "";

  const normalizeRating = value => {
    const rating = Math.round(Number(value) * 2) / 2;
    return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : 0;
  };

  const cityKey = city => String(city.id || `${city.countryCode || ""}:${city.name || ""}`);

  const normalizeState = value => {
    const input = value && typeof value === "object" ? value : {};
    const ratings = {};
    if (input.cityRatings && typeof input.cityRatings === "object" && !Array.isArray(input.cityRatings)) {
      Object.entries(input.cityRatings).forEach(([key, rating]) => {
        const normalized = normalizeRating(rating);
        if (key && normalized) ratings[key] = normalized;
      });
    }
    return {
      countries: Array.isArray(input.countries) ? input.countries : [],
      cities: Array.isArray(input.cities) ? input.cities : [],
      cityRatings: ratings
    };
  };

  const countryName = city => {
    if (city.countryName) return city.countryName;
    try { return regionNames?.of(String(city.countryCode || "").toUpperCase()) || city.countryCode || "未知国家"; }
    catch { return city.countryCode || "未知国家"; }
  };

  const setSaveState = (message, failed = false) => {
    els.save.lastChild.textContent = message;
    els.save.classList.toggle("error", failed);
  };

  const showToast = message => {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  };

  const getSortedCities = () => [...state.cities].sort((a, b) => {
    const difference = (state.cityRatings[cityKey(b)] || 0) - (state.cityRatings[cityKey(a)] || 0);
    if (difference) return difference;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
  });

  const saveLocal = () => {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    if (!cloudReady) {
      setSaveState("评分保存在本机");
      return;
    }
    clearTimeout(saveTimer);
    setSaveState("正在同步…");
    saveTimer = setTimeout(saveCloud, 420);
  };

  const saveCloud = async () => {
    try {
      const response = await fetch("/api/footprints", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
      });
      if (response.status === 401) {
        window.top.location.href = "/";
        return;
      }
      if (!response.ok) throw new Error("save failed");
      setSaveState("已同步到 ChatGPT 账号");
    } catch {
      setSaveState("同步失败，评分已保存在本机", true);
    }
  };

  const makeFlag = city => {
    const wrapper = document.createElement("span");
    wrapper.className = "country-flag";
    const code = String(city.countryCode || "--").toUpperCase();
    wrapper.textContent = code;
    if (/^[A-Z]{2}$/.test(code)) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 640 480");
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `./flags-sprite.svg?v=2#flag-${code.toLowerCase()}`);
      svg.append(use);
      wrapper.append(svg);
    }
    return wrapper;
  };

  const makeStars = (city, currentRating) => {
    const picker = document.createElement("div");
    picker.className = "star-picker";
    picker.setAttribute("role", "radiogroup");
    picker.setAttribute("aria-label", `为${city.name}评分，最低1星，最高5星`);
    const units = [];
    const paint = rating => units.forEach((unit, index) => {
      const star = index + 1;
      unit.classList.toggle("full", rating >= star);
      unit.classList.toggle("half", rating === star - .5);
    });
    const choose = rating => {
      state.cityRatings[cityKey(city)] = rating;
      saveLocal();
      render();
      showToast(`${city.name}：${rating.toFixed(1)} 星`);
    };
    for (let star = 1; star <= 5; star += 1) {
      const unit = document.createElement("span");
      unit.className = "star-unit";
      const empty = document.createElement("span");
      empty.className = "star-empty";
      empty.textContent = "★";
      empty.setAttribute("aria-hidden", "true");
      const light = document.createElement("span");
      light.className = "star-light";
      light.textContent = "★";
      light.setAttribute("aria-hidden", "true");
      unit.append(empty, light);
      const addHit = (rating, side) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `star-hit ${side}`;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(currentRating === rating));
        button.setAttribute("aria-label", `${rating.toFixed(1)} 星`);
        button.addEventListener("pointerenter", () => paint(rating));
        button.addEventListener("focus", () => paint(rating));
        button.addEventListener("click", () => choose(rating));
        unit.append(button);
      };
      if (star === 1) addHit(1, "whole");
      else {
        addHit(star - .5, "left");
        addHit(star, "right");
      }
      units.push(unit);
      picker.append(unit);
    }
    picker.addEventListener("pointerleave", () => paint(currentRating));
    picker.addEventListener("focusout", event => {
      if (!picker.contains(event.relatedTarget)) paint(currentRating);
    });
    paint(currentRating);
    return picker;
  };

  const formatTier = rating => Number.isInteger(rating) ? String(rating) : rating.toFixed(1);

  const makeCityCard = (city, rating) => {
    const key = cityKey(city);
    const card = document.createElement("article");
    card.className = "rating-city";
    const info = document.createElement("div");
    info.className = "city-info";
    const copy = document.createElement("div");
    copy.className = "city-copy";
    const name = document.createElement("strong");
    name.textContent = city.name || "未命名城市";
    const meta = document.createElement("span");
    meta.textContent = [city.region, countryName(city)].filter(Boolean).join(" · ");
    copy.append(name, meta);
    info.append(makeFlag(city), copy);

    const controls = document.createElement("div");
    controls.className = "rating-city-controls";
    const stars = makeStars(city, rating);
    const score = document.createElement("div");
    score.className = "score-cell";
    const value = document.createElement("output");
    value.className = `score-value${rating ? "" : " unrated"}`;
    value.textContent = rating ? rating.toFixed(1) : "未评分";
    score.append(value);
    if (rating) {
      const clear = document.createElement("button");
      clear.className = "clear-rating";
      clear.type = "button";
      clear.textContent = "清除";
      clear.setAttribute("aria-label", `清除${city.name}的评分`);
      clear.addEventListener("click", () => {
        delete state.cityRatings[key];
        saveLocal();
        render();
      });
      score.append(clear);
    }
    controls.append(stars, score);
    card.append(info, controls);
    return card;
  };

  const makeRatingGroup = (rating, cities) => {
    const group = document.createElement("section");
    group.className = `rating-group${rating ? "" : " unrated"}`;
    const head = document.createElement("header");
    head.className = "rating-group-head";
    const badge = document.createElement("div");
    badge.className = "tier-badge";
    const badgeValue = document.createElement("strong");
    badgeValue.textContent = rating ? formatTier(rating) : "—";
    const badgeStar = document.createElement("span");
    badgeStar.textContent = rating ? "★" : "○";
    badge.append(badgeValue, badgeStar);
    const title = document.createElement("div");
    title.className = "rating-group-title";
    const heading = document.createElement("h3");
    heading.textContent = rating ? `${formatTier(rating)} 星城市` : "待评分";
    const detail = document.createElement("p");
    detail.textContent = rating ? `${cities.length} 座城市 · 从左到右排列` : `${cities.length} 座城市等待留下星级`;
    title.append(heading, detail);
    head.append(badge, title);
    const grid = document.createElement("div");
    grid.className = "rating-group-grid";
    cities.forEach(city => grid.append(makeCityCard(city, rating)));
    group.append(head, grid);
    return group;
  };

  const render = () => {
    const sorted = getSortedCities();
    const query = els.filter.value.trim().toLocaleLowerCase("zh-CN");
    const visible = sorted.filter(city => !query || `${city.name} ${countryName(city)} ${city.region || ""}`.toLocaleLowerCase("zh-CN").includes(query));
    const ratedCities = sorted.filter(city => state.cityRatings[cityKey(city)]);
    const average = ratedCities.length
      ? ratedCities.reduce((sum, city) => sum + state.cityRatings[cityKey(city)], 0) / ratedCities.length
      : 0;
    els.average.textContent = average ? average.toFixed(1) : "—";
    els.rated.textContent = String(ratedCities.length);
    els.cities.textContent = String(state.cities.length);
    els.share.disabled = ratedCities.length === 0;
    els.empty.hidden = state.cities.length > 0;
    els.list.hidden = state.cities.length === 0;
    els.list.replaceChildren();
    if (!visible.length && state.cities.length) {
      const noResults = document.createElement("p");
      noResults.className = "filter-empty";
      noResults.textContent = "没有找到匹配的城市或国家";
      els.list.append(noResults);
      return;
    }

    const groups = new Map();
    visible.forEach(city => {
      const rating = state.cityRatings[cityKey(city)] || 0;
      if (!groups.has(rating)) groups.set(rating, []);
      groups.get(rating).push(city);
    });
    [...groups.keys()].sort((a, b) => b - a).forEach(rating => {
      els.list.append(makeRatingGroup(rating, groups.get(rating)));
    });
  };

  const roundRect = (context, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  };

  const fitText = (context, text, maxWidth) => {
    let value = String(text || "");
    if (context.measureText(value).width <= maxWidth) return value;
    while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    return `${value}…`;
  };

  const drawStars = (context, rating, x, y) => {
    context.font = '32px Georgia, "Times New Roman", serif';
    for (let index = 0; index < 5; index += 1) {
      const starX = x + index * 39;
      context.fillStyle = "rgba(145,166,185,.25)";
      context.fillText("★", starX, y);
      const fill = Math.max(0, Math.min(1, rating - index));
      if (!fill) continue;
      context.save();
      context.beginPath();
      context.rect(starX, y - 30, 34 * fill, 36);
      context.clip();
      context.fillStyle = "#f1d28a";
      context.fillText("★", starX, y);
      context.restore();
    }
  };

  const createShareImage = () => {
    const cities = getSortedCities().filter(city => state.cityRatings[cityKey(city)]);
    if (!cities.length) return null;
    const width = 1200;
    const rowHeight = 76;
    const height = 372 + cities.length * rowHeight + 70;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#07111f");
    background.addColorStop(.6, "#0b1c2e");
    background.addColorStop(1, "#07131f");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    const glow = context.createRadialGradient(980, 70, 0, 980, 70, 360);
    glow.addColorStop(0, "rgba(211,166,77,.22)");
    glow.addColorStop(1, "rgba(211,166,77,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, 430);

    context.fillStyle = "#50d7d1";
    context.font = "800 17px Inter, Arial, sans-serif";
    context.fillText("MY TRAVEL RANKING", 74, 70);
    context.fillStyle = "#f6f9fb";
    context.font = '500 58px Georgia, "Microsoft YaHei", serif';
    context.fillText("我的旅行排行榜", 72, 139);
    context.fillStyle = "#a9bdcc";
    context.font = 'italic 23px Georgia, "Microsoft YaHei", serif';
    context.fillText("Give every city I’ve reached a star of its own.", 75, 181);

    const average = cities.reduce((sum, city) => sum + state.cityRatings[cityKey(city)], 0) / cities.length;
    roundRect(context, 72, 218, 1056, 88, 18);
    context.fillStyle = "rgba(5,16,28,.56)";
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.13)";
    context.stroke();
    context.fillStyle = "#91a6b9";
    context.font = "17px Inter, Arial, sans-serif";
    context.fillText("平均评分", 104, 250);
    context.fillText("已评分城市", 407, 250);
    context.fillText("记录日期", 746, 250);
    context.fillStyle = "#f1d28a";
    context.font = '500 34px Georgia, "Microsoft YaHei", serif';
    context.fillText(average.toFixed(1), 104, 286);
    context.fillText(String(cities.length), 407, 286);
    context.fillStyle = "#d8e2e9";
    context.font = "23px Inter, Arial, sans-serif";
    context.fillText(new Date().toLocaleDateString("zh-CN"), 746, 284);

    context.fillStyle = "#71879a";
    context.font = "15px Inter, Arial, sans-serif";
    context.fillText("排名", 91, 349);
    context.fillText("城市 / 国家", 188, 349);
    context.fillText("我的评分", 704, 349);
    context.fillText("分数", 1040, 349);

    cities.forEach((city, index) => {
      const rating = state.cityRatings[cityKey(city)];
      const y = 368 + index * rowHeight;
      roundRect(context, 72, y, 1056, rowHeight - 8, 13);
      context.fillStyle = index < 3 ? "rgba(211,166,77,.075)" : index % 2 ? "rgba(255,255,255,.022)" : "rgba(255,255,255,.012)";
      context.fill();
      context.strokeStyle = index < 3 ? "rgba(211,166,77,.2)" : "rgba(255,255,255,.055)";
      context.stroke();
      context.fillStyle = index < 3 ? "#f1d28a" : "#71879a";
      context.font = '500 24px Georgia, "Times New Roman", serif';
      context.fillText(String(index + 1).padStart(2, "0"), 94, y + 43);
      roundRect(context, 153, y + 15, 58, 38, 8);
      context.fillStyle = "#10263b";
      context.fill();
      context.strokeStyle = "rgba(211,166,77,.3)";
      context.stroke();
      context.fillStyle = "#c5d3dd";
      context.font = "700 16px Inter, Arial, sans-serif";
      context.fillText(String(city.countryCode || "--").toUpperCase(), 168, y + 40);
      context.fillStyle = "#f5f8fa";
      context.font = '600 23px Inter, "Microsoft YaHei", sans-serif';
      context.fillText(fitText(context, city.name || "未命名城市", 260), 232, y + 31);
      context.fillStyle = "#91a6b9";
      context.font = '16px Inter, "Microsoft YaHei", sans-serif';
      context.fillText(fitText(context, countryName(city), 260), 232, y + 53);
      drawStars(context, rating, 700, y + 47);
      context.fillStyle = "#f1d28a";
      context.font = "700 23px ui-monospace, Menlo, monospace";
      context.fillText(rating.toFixed(1), 1040, y + 44);
    });

    context.fillStyle = "rgba(145,166,185,.62)";
    context.font = "15px Inter, Arial, sans-serif";
    context.fillText("Travel in Time · Every coordinate holds a story.", 72, height - 30);
    context.textAlign = "right";
    context.fillStyle = "rgba(80,215,209,.72)";
    context.fillText("TRAVEL IN TIME", 1128, height - 30);
    context.textAlign = "left";
    return canvas;
  };

  const downloadShareImage = () => {
    if (!shareFile || !shareImageUrl) return;
    const link = document.createElement("a");
    link.href = shareImageUrl;
    link.download = shareFile.name;
    document.body.append(link);
    link.click();
    link.remove();
    showToast("图片已保存，请在微信中选择图片或文件发送");
  };

  const shareWithSystem = async () => {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: "我的旅行排行榜" });
    } catch (error) {
      if (error?.name !== "AbortError") showToast("系统分享不可用，请先保存图片");
    }
  };

  const shareRanking = () => {
    const canvas = createShareImage();
    if (!canvas) return;
    els.share.disabled = true;
    canvas.toBlob(blob => {
      els.share.disabled = false;
      if (!blob) {
        showToast("分享图片生成失败，请稍后重试");
        return;
      }
      const filename = `我的旅行排行榜-${new Date().toISOString().slice(0, 10)}.png`;
      shareFile = new File([blob], filename, { type: "image/png" });
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
      shareImageUrl = URL.createObjectURL(blob);
      els.sharePreview.src = shareImageUrl;
      const canShareFile = Boolean(navigator.share && navigator.canShare?.({ files: [shareFile] }));
      els.nativeShare.hidden = !canShareFile;
      if (typeof els.shareDialog.showModal === "function") {
        els.shareDialog.showModal();
      } else {
        downloadShareImage();
      }
    }, "image/png");
  };

  const load = async () => {
    const backHref = accountMode ? "./index.html?mode=account" : "./index.html";
    [els.back, els.brand, els.emptyBack].forEach(link => { link.href = backHref; });
    if (accountMode) {
      setSaveState("正在读取账号足迹");
      try {
        const response = await fetch("/api/footprints", { cache: "no-store" });
        if (response.status === 401) {
          window.top.location.href = "/";
          return;
        }
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        state = normalizeState(data.state);
        activeStorageKey = `${STORAGE_KEY}:${data.accountKey}`;
        localStorage.setItem(activeStorageKey, JSON.stringify(state));
        cloudReady = true;
        setSaveState("已同步到 ChatGPT 账号");
      } catch {
        setSaveState("账号足迹暂时无法读取", true);
      }
    } else {
      try { state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); }
      catch { state = normalizeState({}); }
      setSaveState("评分保存在本机");
    }
    render();
  };

  els.filter.addEventListener("input", render);
  els.share.addEventListener("click", shareRanking);
  els.downloadShare.addEventListener("click", downloadShareImage);
  els.nativeShare.addEventListener("click", shareWithSystem);
  els.shareDialog.addEventListener("close", () => {
    els.sharePreview.removeAttribute("src");
    if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
    shareImageUrl = "";
    shareFile = null;
  });
  load();
})();
