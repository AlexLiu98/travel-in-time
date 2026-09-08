(() => {
  "use strict";

  const LEVELS = {
    easy: { name: "简单", rows: 4, cols: 6, pairs: 12, seconds: 120 },
    medium: { name: "中等", rows: 6, cols: 8, pairs: 24, seconds: 240 },
    hard: { name: "困难", rows: 8, cols: 10, pairs: 40, seconds: 360 }
  };

  const FLAGS = [
    ["cn","中国"],["jp","日本"],["kr","韩国"],["kp","朝鲜"],["mn","蒙古国"],["ru","俄罗斯"],["kz","哈萨克斯坦"],["uz","乌兹别克斯坦"],["kg","吉尔吉斯斯坦"],["tj","塔吉克斯坦"],["tm","土库曼斯坦"],["af","阿富汗"],["pk","巴基斯坦"],["in","印度"],["np","尼泊尔"],["bt","不丹"],["bd","孟加拉国"],["lk","斯里兰卡"],["mv","马尔代夫"],["mm","缅甸"],["th","泰国"],["la","老挝"],["kh","柬埔寨"],["vn","越南"],["my","马来西亚"],["sg","新加坡"],["id","印度尼西亚"],["ph","菲律宾"],["bn","文莱"],["tl","东帝汶"],["ir","伊朗"],["iq","伊拉克"],["sy","叙利亚"],["lb","黎巴嫩"],["il","以色列"],["jo","约旦"],["sa","沙特阿拉伯"],["ye","也门"],["om","阿曼"],["ae","阿联酋"],["qa","卡塔尔"],["bh","巴林"],["kw","科威特"],["tr","土耳其"],["ge","格鲁吉亚"],["am","亚美尼亚"],["az","阿塞拜疆"],
    ["gb","英国"],["ie","爱尔兰"],["fr","法国"],["de","德国"],["it","意大利"],["va","梵蒂冈"],["es","西班牙"],["pt","葡萄牙"],["nl","荷兰"],["be","比利时"],["lu","卢森堡"],["ch","瑞士"],["at","奥地利"],["pl","波兰"],["cz","捷克"],["sk","斯洛伐克"],["hu","匈牙利"],["si","斯洛文尼亚"],["hr","克罗地亚"],["ba","波黑"],["rs","塞尔维亚"],["me","黑山"],["al","阿尔巴尼亚"],["mk","北马其顿"],["gr","希腊"],["bg","保加利亚"],["ro","罗马尼亚"],["md","摩尔多瓦"],["ua","乌克兰"],["by","白俄罗斯"],["lt","立陶宛"],["lv","拉脱维亚"],["ee","爱沙尼亚"],["fi","芬兰"],["se","瑞典"],["no","挪威"],["dk","丹麦"],["is","冰岛"],["cy","塞浦路斯"],["mt","马耳他"],
    ["eg","埃及"],["ly","利比亚"],["tn","突尼斯"],["dz","阿尔及利亚"],["ma","摩洛哥"],["sd","苏丹"],["et","埃塞俄比亚"],["er","厄立特里亚"],["dj","吉布提"],["so","索马里"],["ke","肯尼亚"],["ug","乌干达"],["rw","卢旺达"],["bi","布隆迪"],["tz","坦桑尼亚"],["cd","刚果（金）"],["cg","刚果（布）"],["ga","加蓬"],["cm","喀麦隆"],["ng","尼日利亚"],["gh","加纳"],["ci","科特迪瓦"],["sn","塞内加尔"],["ml","马里"],["ne","尼日尔"],["td","乍得"],["cf","中非共和国"],["gq","赤道几内亚"],["ao","安哥拉"],["zm","赞比亚"],["zw","津巴布韦"],["mw","马拉维"],["mz","莫桑比克"],["na","纳米比亚"],["bw","博茨瓦纳"],["za","南非"],["ls","莱索托"],["sz","埃斯瓦蒂尼"],["mg","马达加斯加"],["mu","毛里求斯"],["sc","塞舌尔"],["cv","佛得角"],
    ["ca","加拿大"],["us","美国"],["mx","墨西哥"],["gt","危地马拉"],["bz","伯利兹"],["hn","洪都拉斯"],["sv","萨尔瓦多"],["ni","尼加拉瓜"],["cr","哥斯达黎加"],["pa","巴拿马"],["cu","古巴"],["jm","牙买加"],["ht","海地"],["do","多米尼加"],["bs","巴哈马"],["bb","巴巴多斯"],["tt","特立尼达和多巴哥"],["gd","格林纳达"],["lc","圣卢西亚"],["vc","圣文森特和格林纳丁斯"],["ag","安提瓜和巴布达"],["dm","多米尼克"],["kn","圣基茨和尼维斯"],["co","哥伦比亚"],["ve","委内瑞拉"],["gy","圭亚那"],["sr","苏里南"],["ec","厄瓜多尔"],["pe","秘鲁"],["bo","玻利维亚"],["br","巴西"],["py","巴拉圭"],["uy","乌拉圭"],["ar","阿根廷"],["cl","智利"],
    ["au","澳大利亚"],["nz","新西兰"],["pg","巴布亚新几内亚"],["fj","斐济"],["sb","所罗门群岛"],["vu","瓦努阿图"],["ws","萨摩亚"],["to","汤加"],["ki","基里巴斯"],["fm","密克罗尼西亚联邦"],["mh","马绍尔群岛"],["pw","帕劳"],["nr","瑙鲁"],["tv","图瓦卢"]
  ].map(([code, name]) => ({ code, name }));

  const BEST_KEY = "travel_in_time_flag_link_best_v1";
  const AUDIO_KEY = "travel_in_time_flag_link_audio_v1";
  const els = {
    board: document.getElementById("gameBoard"), frame: document.getElementById("boardFrame"),
    path: document.getElementById("pathLayer"), effects: document.getElementById("matchEffects"), timer: document.getElementById("timer"),
    pairs: document.getElementById("pairCount"), level: document.getElementById("levelName"),
    start: document.getElementById("startBtn"), hint: document.getElementById("hintBtn"),
    hintCount: document.getElementById("hintCount"), pause: document.getElementById("pauseBtn"),
    shuffle: document.getElementById("shuffleBtn"), last: document.getElementById("lastMatch"),
    toast: document.getElementById("gameToast"), dialog: document.getElementById("resultDialog"),
    resultEyebrow: document.getElementById("resultEyebrow"), resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"), resultTime: document.getElementById("resultTime"),
    again: document.getElementById("againBtn"), closeResult: document.getElementById("closeResultBtn"),
    sound: document.getElementById("soundToggle")
  };

  let levelKey = "easy";
  let board = [];
  let selected = null;
  let remainingPairs = 0;
  let hints = 3;
  let playing = false;
  let paused = false;
  let locked = false;
  let deadline = 0;
  let remainingMs = LEVELS.easy.seconds * 1000;
  let timerId = 0;
  let toastId = 0;
  let runId = 0;
  let audioContext = null;
  let bgmTimer = 0;
  let bgmStep = 0;
  let soundEnabled = localStorage.getItem(AUDIO_KEY) !== "off";

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const BGM_MELODY = [
    523.25, 659.25, 783.99, 659.25,
    587.33, 698.46, 880, 698.46,
    659.25, 783.99, 987.77, 783.99,
    587.33, 698.46, 783.99, 659.25
  ];
  const BGM_BASS = [130.81, 146.83, 164.81, 146.83];

  const ensureAudio = () => {
    if (!soundEnabled || !AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  };

  const playTone = (frequency, duration, volume, delay = 0, type = "triangle") => {
    const context = ensureAudio();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  };

  const playClick = () => {
    playTone(430, .075, .026, 0, "sine");
    playTone(620, .055, .012, .018, "triangle");
  };

  const playMatch = () => {
    [659.25, 783.99, 987.77].forEach((note, index) => playTone(note, .2, .045, index * .055, "triangle"));
  };

  const playStart = () => {
    playTone(523.25, .2, .045, 0, "triangle");
    playTone(659.25, .24, .04, .09, "triangle");
  };

  const playFinish = won => {
    const notes = won ? [659.25, 783.99, 987.77, 1318.51] : [392, 329.63, 261.63];
    notes.forEach((note, index) => playTone(note, won ? .32 : .27, .05, index * .085, won ? "triangle" : "sine"));
  };

  const stopBgm = () => {
    clearInterval(bgmTimer);
    bgmTimer = 0;
  };

  const playBgmStep = () => {
    if (!soundEnabled || !playing || paused) return;
    const step = bgmStep % BGM_MELODY.length;
    playTone(BGM_MELODY[step], .3, .014, 0, "triangle");
    if (step % 4 === 0) playTone(BGM_BASS[(step / 4) % BGM_BASS.length], .38, .012, 0, "sine");
    bgmStep += 1;
  };

  const startBgm = () => {
    stopBgm();
    if (!soundEnabled || !playing || paused) return;
    ensureAudio();
    playBgmStep();
    bgmTimer = setInterval(playBgmStep, 390);
  };

  const updateSoundButton = () => {
    const supported = Boolean(AudioContextClass);
    if (!supported) soundEnabled = false;
    els.sound.disabled = !supported;
    els.sound.classList.toggle("muted", !soundEnabled);
    els.sound.setAttribute("aria-pressed", String(soundEnabled));
    els.sound.setAttribute("aria-label", supported ? (soundEnabled ? "关闭游戏声音" : "开启游戏声音") : "当前浏览器不支持游戏声音");
    els.sound.title = supported ? (soundEnabled ? "关闭游戏声音" : "开启游戏声音") : "当前浏览器不支持游戏声音";
    els.sound.querySelector("span").textContent = soundEnabled ? "♫" : "♩";
    els.sound.querySelector("b").textContent = soundEnabled ? "音乐开启" : "已静音";
  };

  const shuffleArray = values => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const formatTime = totalSeconds => {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const loadBest = () => {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || "{}"); }
    catch { return {}; }
  };

  const updateBestBoard = () => {
    const best = loadBest();
    document.getElementById("bestEasy").textContent = best.easy ? formatTime(best.easy) : "—";
    document.getElementById("bestMedium").textContent = best.medium ? formatTime(best.medium) : "—";
    document.getElementById("bestHard").textContent = best.hard ? formatTime(best.hard) : "—";
  };

  const saveBest = elapsed => {
    const best = loadBest();
    const isRecord = !best[levelKey] || elapsed < best[levelKey];
    if (isRecord) {
      best[levelKey] = elapsed;
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
      updateBestBoard();
    }
    return isRecord;
  };

  const showToast = message => {
    clearTimeout(toastId);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastId = setTimeout(() => els.toast.classList.remove("show"), 1800);
  };

  const tileAt = ({ row, col }) => board[row]?.[col] || null;
  const sameCell = (a, b) => a && b && a.row === b.row && a.col === b.col;

  const findPath = (from, to) => {
    const cfg = LEVELS[levelKey];
    const paddedRows = cfg.rows + 2;
    const paddedCols = cfg.cols + 2;
    const start = { row: from.row + 1, col: from.col + 1 };
    const target = { row: to.row + 1, col: to.col + 1 };
    const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const queue = [{ ...start, dir: -1, turns: 0, points: [[start.row, start.col]] }];
    const seen = Array.from({ length: paddedRows }, () =>
      Array.from({ length: paddedCols }, () => [3, 3, 3, 3])
    );
    let cursor = 0;

    const passable = (row, col) => {
      if (row < 0 || col < 0 || row >= paddedRows || col >= paddedCols) return false;
      if (row === target.row && col === target.col) return true;
      if (row === 0 || col === 0 || row === paddedRows - 1 || col === paddedCols - 1) return true;
      return board[row - 1][col - 1] === null;
    };

    while (cursor < queue.length) {
      const current = queue[cursor++];
      for (let dir = 0; dir < directions.length; dir += 1) {
        const turns = current.dir === -1 || current.dir === dir ? current.turns : current.turns + 1;
        if (turns > 2) continue;
        const row = current.row + directions[dir][0];
        const col = current.col + directions[dir][1];
        if (!passable(row, col) || seen[row][col][dir] <= turns) continue;
        seen[row][col][dir] = turns;
        let points;
        if (current.dir === -1) points = [[current.row, current.col], [row, col]];
        else if (current.dir === dir) points = [...current.points.slice(0, -1), [row, col]];
        else points = [...current.points, [row, col]];
        if (row === target.row && col === target.col) return points;
        queue.push({ row, col, dir, turns, points });
      }
    }
    return null;
  };

  const positionsForCode = code => {
    const positions = [];
    board.forEach((row, rowIndex) => row.forEach((tile, colIndex) => {
      if (tile?.code === code) positions.push({ row: rowIndex, col: colIndex });
    }));
    return positions;
  };

  const findAnyPair = () => {
    const codes = [...new Set(board.flat().filter(Boolean).map(tile => tile.code))];
    for (const code of codes) {
      const positions = positionsForCode(code);
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          const path = findPath(positions[i], positions[j]);
          if (path) return { first: positions[i], second: positions[j], path };
        }
      }
    }
    return null;
  };

  const tileElement = position => els.board.querySelector(`[data-row="${position.row}"][data-col="${position.col}"]`);

  const renderBoard = () => {
    const cfg = LEVELS[levelKey];
    els.board.classList.remove("empty");
    els.board.style.setProperty("--cols", cfg.cols);
    els.board.replaceChildren();
    board.forEach((row, rowIndex) => row.forEach((tile, colIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flag-tile";
      button.dataset.row = rowIndex;
      button.dataset.col = colIndex;
      if (!tile) {
        button.classList.add("matched");
        button.disabled = true;
      } else {
        button.setAttribute("aria-label", "国旗牌");
        const flag = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        flag.setAttribute("class", "flag-art");
        flag.setAttribute("viewBox", "0 0 640 480");
        flag.setAttribute("aria-hidden", "true");
        flag.setAttribute("focusable", "false");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `./flags-sprite.svg?v=2#flag-${tile.code}`);
        use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `./flags-sprite.svg?v=2#flag-${tile.code}`);
        flag.append(use);
        button.append(flag);
        button.addEventListener("click", () => chooseTile({ row: rowIndex, col: colIndex }));
      }
      els.board.append(button);
    }));
  };

  const pathPoint = ([paddedRow, paddedCol]) => {
    const cfg = LEVELS[levelKey];
    const boardRect = els.board.getBoundingClientRect();
    const frameRect = els.frame.getBoundingClientRect();
    const sampleRect = els.board.querySelector(".flag-tile")?.getBoundingClientRect();
    const cellWidth = sampleRect?.width || boardRect.width / cfg.cols;
    const cellHeight = sampleRect?.height || cellWidth * .75;
    const gapX = cfg.cols > 1 ? (boardRect.width - cellWidth * cfg.cols) / (cfg.cols - 1) : 0;
    const gapY = cfg.rows > 1 ? (boardRect.height - cellHeight * cfg.rows) / (cfg.rows - 1) : 0;
    const boardLeft = boardRect.left - frameRect.left;
    const boardTop = boardRect.top - frameRect.top;
    const x = paddedCol === 0
      ? boardLeft / 2
      : paddedCol === cfg.cols + 1
        ? boardRect.right - frameRect.left + (frameRect.right - boardRect.right) / 2
        : boardLeft + (paddedCol - 1) * (cellWidth + gapX) + cellWidth / 2;
    const y = paddedRow === 0
      ? boardTop / 2
      : paddedRow === cfg.rows + 1
        ? boardRect.bottom - frameRect.top + (frameRect.bottom - boardRect.bottom) / 2
        : boardTop + (paddedRow - 1) * (cellHeight + gapY) + cellHeight / 2;
    return [x, y];
  };

  const drawPath = points => {
    els.path.setAttribute("viewBox", `0 0 ${els.frame.clientWidth} ${els.frame.clientHeight}`);
    const svgNamespace = "http://www.w3.org/2000/svg";
    const pixelPoints = points.map(pathPoint);
    const route = pixelPoints.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
    const defs = document.createElementNS(svgNamespace, "defs");
    const gradient = document.createElementNS(svgNamespace, "linearGradient");
    gradient.id = "matchPathGradient";
    gradient.setAttribute("x1", "0%");
    gradient.setAttribute("x2", "100%");
    [["0%", "#50d7d1"], ["38%", "#fff3c5"], ["68%", "#d6aa50"], ["100%", "#50d7d1"]].forEach(([offset, color]) => {
      const stop = document.createElementNS(svgNamespace, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      gradient.append(stop);
    });
    defs.append(gradient);

    const makePath = className => {
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("class", className);
      path.setAttribute("d", route);
      return path;
    };
    const glow = makePath("path-glow");
    const ribbon = makePath("path-ribbon");
    const highlight = makePath("path-highlight");
    const nodes = pixelPoints.slice(1, -1).map(([cx, cy]) => {
      const circle = document.createElementNS(svgNamespace, "circle");
      circle.setAttribute("class", "path-node");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", "3.4");
      return circle;
    });
    const runner = document.createElementNS(svgNamespace, "circle");
    runner.setAttribute("class", "path-runner");
    runner.setAttribute("r", "3.5");
    const motion = document.createElementNS(svgNamespace, "animateMotion");
    motion.setAttribute("dur", ".42s");
    motion.setAttribute("path", route);
    motion.setAttribute("repeatCount", "indefinite");
    runner.append(motion);
    els.path.replaceChildren(defs, glow, ribbon, highlight, ...nodes, runner);
    setTimeout(() => els.path.replaceChildren(), 460);
  };

  const burstAt = element => {
    if (!element) return;
    const tileRect = element.getBoundingClientRect();
    const frameRect = els.frame.getBoundingClientRect();
    const left = tileRect.left - frameRect.left + tileRect.width / 2;
    const top = tileRect.top - frameRect.top + tileRect.height / 2;
    for (let index = 0; index < 12; index += 1) {
      const particle = document.createElement("i");
      const angle = (Math.PI * 2 * index) / 12 + (index % 2 ? .12 : -.08);
      const distance = 22 + (index % 4) * 7;
      particle.className = "match-particle";
      particle.style.left = `${left}px`;
      particle.style.top = `${top}px`;
      particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      particle.style.setProperty("--delay", `${(index % 3) * 16}ms`);
      els.effects.append(particle);
      setTimeout(() => particle.remove(), 620);
    }
  };

  const reshuffle = (automatic = false) => {
    if (!playing || locked) return;
    const values = board.flat().filter(Boolean);
    const cells = [];
    board.forEach((row, rowIndex) => row.forEach((tile, colIndex) => {
      if (tile) cells.push({ row: rowIndex, col: colIndex });
    }));
    let attempts = 0;
    do {
      const shuffled = shuffleArray(values);
      cells.forEach((position, index) => { board[position.row][position.col] = shuffled[index]; });
      attempts += 1;
    } while (!findAnyPair() && attempts < 120);
    selected = null;
    renderBoard();
    showToast(automatic ? "没有可连接组合，已自动洗牌" : "棋盘已重新排列");
  };

  const afterMatch = () => {
    remainingPairs -= 1;
    els.pairs.textContent = remainingPairs;
    if (remainingPairs === 0) {
      remainingMs = Math.max(0, deadline - Date.now());
      clearInterval(timerId);
      locked = true;
      const completedRun = runId;
      setTimeout(() => {
        if (!playing || runId !== completedRun) return;
        locked = false;
        finishGame(true, true);
      }, 420);
      return;
    }
    if (!findAnyPair()) reshuffle(true);
  };

  function chooseTile(position) {
    if (!playing || paused || locked || !tileAt(position)) return;
    playClick();
    const element = tileElement(position);
    if (!selected) {
      selected = position;
      element?.classList.add("selected");
      return;
    }
    if (sameCell(selected, position)) {
      element?.classList.remove("selected");
      selected = null;
      return;
    }

    const first = selected;
    const firstTile = tileAt(first);
    const secondTile = tileAt(position);
    const firstElement = tileElement(first);
    const secondElement = tileElement(position);
    const path = firstTile.code === secondTile.code ? findPath(first, position) : null;
    locked = true;

    if (path) {
      playMatch();
      firstElement?.classList.add("clearing");
      secondElement?.classList.add("selected", "clearing");
      burstAt(firstElement);
      burstAt(secondElement);
      drawPath(path);
      els.last.innerHTML = `<span>最近识别</span><strong>${firstTile.name}</strong>`;
      board[first.row][first.col] = null;
      board[position.row][position.col] = null;
      selected = null;
      locked = false;
      setTimeout(() => {
        firstElement?.classList.remove("selected", "clearing");
        secondElement?.classList.remove("selected", "clearing");
        firstElement?.classList.add("matched");
        secondElement?.classList.add("matched");
        if (firstElement) firstElement.disabled = true;
        if (secondElement) secondElement.disabled = true;
      }, 420);
      afterMatch();
    } else {
      firstElement?.classList.add("wrong");
      secondElement?.classList.add("wrong");
      setTimeout(() => {
        firstElement?.classList.remove("selected", "wrong");
        secondElement?.classList.remove("wrong");
        selected = null;
        locked = false;
      }, 300);
    }
  }

  const updateTimer = () => {
    if (!playing || paused) return;
    remainingMs = Math.max(0, deadline - Date.now());
    els.timer.textContent = formatTime(remainingMs / 1000);
    els.timer.classList.toggle("danger", remainingMs <= 15000);
    if (remainingMs <= 0) finishGame(false);
  };

  const setPaused = value => {
    if (!playing || paused === value) return;
    paused = value;
    if (paused) {
      stopBgm();
      remainingMs = Math.max(0, deadline - Date.now());
      els.pause.innerHTML = "<span>▶</span><strong>继续</strong><small>恢复计时</small>";
      els.board.style.filter = "blur(5px) brightness(.52)";
    } else {
      deadline = Date.now() + remainingMs;
      els.pause.innerHTML = "<span>Ⅱ</span><strong>暂停</strong><small>计时停止</small>";
      els.board.style.filter = "";
      startBgm();
    }
  };

  const finishGame = (won, preserveRemaining = false) => {
    if (!playing) return;
    if (!paused && !preserveRemaining) remainingMs = Math.max(0, deadline - Date.now());
    playing = false;
    paused = false;
    clearInterval(timerId);
    stopBgm();
    playFinish(won);
    els.hint.disabled = true;
    els.pause.disabled = true;
    els.shuffle.disabled = true;
    els.start.textContent = "开始游戏";
    els.timer.classList.remove("danger");
    const cfg = LEVELS[levelKey];
    const elapsed = Math.max(1, Math.ceil((cfg.seconds * 1000 - remainingMs) / 1000));
    if (won) {
      const record = saveBest(elapsed);
      els.resultEyebrow.textContent = record ? "NEW PERSONAL BEST" : "CHALLENGE COMPLETE";
      els.resultTitle.textContent = record ? "新的最佳记录！" : "全部完成！";
      els.resultText.textContent = `${cfg.name}难度的 ${cfg.pairs} 对国旗已全部消除。`;
      els.resultTime.textContent = formatTime(elapsed);
    } else {
      els.resultEyebrow.textContent = "TIME IS UP";
      els.resultTitle.textContent = "时间到了";
      els.resultText.textContent = `还剩 ${remainingPairs} 对国旗，再试一次吧。`;
      els.resultTime.textContent = "00:00";
    }
    els.dialog.showModal();
  };

  const startGame = () => {
    const cfg = LEVELS[levelKey];
    runId += 1;
    const selectedFlags = shuffleArray(FLAGS).slice(0, cfg.pairs);
    const deck = shuffleArray(selectedFlags.flatMap(flag => [flag, flag]));
    board = Array.from({ length: cfg.rows }, (_, row) => deck.slice(row * cfg.cols, (row + 1) * cfg.cols));
    selected = null;
    remainingPairs = cfg.pairs;
    hints = 3;
    playing = true;
    paused = false;
    locked = false;
    remainingMs = cfg.seconds * 1000;
    deadline = Date.now() + remainingMs;
    els.pairs.textContent = remainingPairs;
    els.level.textContent = cfg.name;
    els.timer.textContent = formatTime(cfg.seconds);
    els.timer.classList.remove("danger");
    els.hintCount.textContent = `${hints} 次`;
    els.hint.disabled = false;
    els.pause.disabled = false;
    els.shuffle.disabled = false;
    els.start.textContent = "重新开始";
    els.last.innerHTML = "<span>最近识别</span><strong>等待消除</strong>";
    els.board.style.filter = "";
    renderBoard();
    if (!findAnyPair()) reshuffle(true);
    clearInterval(timerId);
    timerId = setInterval(updateTimer, 200);
    playStart();
    startBgm();
  };

  document.querySelectorAll(".difficulty").forEach(button => button.addEventListener("click", () => {
    if (playing && !confirm("切换难度会结束当前游戏，是否继续？")) return;
    clearInterval(timerId);
    stopBgm();
    playing = false;
    paused = false;
    levelKey = button.dataset.level;
    document.querySelectorAll(".difficulty").forEach(item => item.classList.toggle("active", item === button));
    const cfg = LEVELS[levelKey];
    els.timer.textContent = formatTime(cfg.seconds);
    els.pairs.textContent = cfg.pairs;
    els.level.textContent = cfg.name;
    els.start.textContent = "开始游戏";
    els.hint.disabled = true;
    els.pause.disabled = true;
    els.shuffle.disabled = true;
  }));

  els.start.addEventListener("click", () => {
    if (playing && !confirm("重新开始后，本局进度将不会保留。")) return;
    startGame();
  });

  els.hint.addEventListener("click", () => {
    if (!playing || paused || locked || hints <= 0) return;
    const pair = findAnyPair();
    if (!pair) { reshuffle(true); return; }
    hints -= 1;
    els.hintCount.textContent = `${hints} 次`;
    if (hints === 0) els.hint.disabled = true;
    const first = tileElement(pair.first);
    const second = tileElement(pair.second);
    first?.classList.add("hint");
    second?.classList.add("hint");
    setTimeout(() => { first?.classList.remove("hint"); second?.classList.remove("hint"); }, 1400);
  });

  els.pause.addEventListener("click", () => setPaused(!paused));
  els.shuffle.addEventListener("click", () => reshuffle(false));
  els.sound.addEventListener("click", () => {
    if (!AudioContextClass) return;
    soundEnabled = !soundEnabled;
    localStorage.setItem(AUDIO_KEY, soundEnabled ? "on" : "off");
    updateSoundButton();
    if (soundEnabled) {
      playClick();
      startBgm();
    } else {
      stopBgm();
    }
  });
  els.again.addEventListener("click", () => { els.dialog.close(); startGame(); });
  els.closeResult.addEventListener("click", () => els.dialog.close());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing && !paused) {
      setPaused(true);
      showToast("游戏已自动暂停");
    }
  });

  updateBestBoard();
  updateSoundButton();
})();
