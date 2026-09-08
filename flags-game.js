(() => {
  "use strict";

  const LEVELS = {
    easy: { name: "简单", rows: 4, cols: 6, pairs: 12, seconds: 120 },
    medium: { name: "中等", rows: 6, cols: 8, pairs: 24, seconds: 240 },
    hard: { name: "困难", rows: 8, cols: 10, pairs: 40, seconds: 360 }
  };

  const FLAGS = [
    ["cn","中国"],["jp","日本"],["kr","韩国"],["kp","朝鲜"],["mn","蒙古国"],["ru","俄罗斯"],["kz","哈萨克斯坦"],["uz","乌兹别克斯坦"],["kg","吉尔吉斯斯坦"],["tj","塔吉克斯坦"],["tm","土库曼斯坦"],["af","阿富汗"],["pk","巴基斯坦"],["in","印度"],["np","尼泊尔"],["bt","不丹"],["bd","孟加拉国"],["lk","斯里兰卡"],["mv","马尔代夫"],["mm","缅甸"],["th","泰国"],["la","老挝"],["kh","柬埔寨"],["vn","越南"],["my","马来西亚"],["sg","新加坡"],["id","印度尼西亚"],["ph","菲律宾"],["bn","文莱"],["tl","东帝汶"],["ir","伊朗"],["iq","伊拉克"],["sy","叙利亚"],["lb","黎巴嫩"],["il","以色列"],["jo","约旦"],["sa","沙特阿拉伯"],["ye","也门"],["om","阿曼"],["ae","阿联酋"],["qa","卡塔尔"],["bh","巴林"],["kw","科威特"],["tr","土耳其"],["ge","格鲁吉亚"],["am","亚美尼亚"],["az","阿塞拜疆"],
    ["gb","英国"],["ie","爱尔兰"],["fr","法国"],["de","德国"],["it","意大利"],["es","西班牙"],["pt","葡萄牙"],["nl","荷兰"],["be","比利时"],["lu","卢森堡"],["ch","瑞士"],["at","奥地利"],["pl","波兰"],["cz","捷克"],["sk","斯洛伐克"],["hu","匈牙利"],["si","斯洛文尼亚"],["hr","克罗地亚"],["ba","波黑"],["rs","塞尔维亚"],["me","黑山"],["al","阿尔巴尼亚"],["mk","北马其顿"],["gr","希腊"],["bg","保加利亚"],["ro","罗马尼亚"],["md","摩尔多瓦"],["ua","乌克兰"],["by","白俄罗斯"],["lt","立陶宛"],["lv","拉脱维亚"],["ee","爱沙尼亚"],["fi","芬兰"],["se","瑞典"],["no","挪威"],["dk","丹麦"],["is","冰岛"],["cy","塞浦路斯"],["mt","马耳他"],
    ["eg","埃及"],["ly","利比亚"],["tn","突尼斯"],["dz","阿尔及利亚"],["ma","摩洛哥"],["sd","苏丹"],["et","埃塞俄比亚"],["er","厄立特里亚"],["dj","吉布提"],["so","索马里"],["ke","肯尼亚"],["ug","乌干达"],["rw","卢旺达"],["bi","布隆迪"],["tz","坦桑尼亚"],["cd","刚果（金）"],["cg","刚果（布）"],["ga","加蓬"],["cm","喀麦隆"],["ng","尼日利亚"],["gh","加纳"],["ci","科特迪瓦"],["sn","塞内加尔"],["ml","马里"],["ne","尼日尔"],["td","乍得"],["cf","中非共和国"],["gq","赤道几内亚"],["ao","安哥拉"],["zm","赞比亚"],["zw","津巴布韦"],["mw","马拉维"],["mz","莫桑比克"],["na","纳米比亚"],["bw","博茨瓦纳"],["za","南非"],["ls","莱索托"],["sz","埃斯瓦蒂尼"],["mg","马达加斯加"],["mu","毛里求斯"],["sc","塞舌尔"],["cv","佛得角"],
    ["ca","加拿大"],["us","美国"],["mx","墨西哥"],["gt","危地马拉"],["bz","伯利兹"],["hn","洪都拉斯"],["sv","萨尔瓦多"],["ni","尼加拉瓜"],["cr","哥斯达黎加"],["pa","巴拿马"],["cu","古巴"],["jm","牙买加"],["ht","海地"],["do","多米尼加"],["bs","巴哈马"],["bb","巴巴多斯"],["tt","特立尼达和多巴哥"],["gd","格林纳达"],["lc","圣卢西亚"],["vc","圣文森特和格林纳丁斯"],["ag","安提瓜和巴布达"],["dm","多米尼克"],["kn","圣基茨和尼维斯"],["co","哥伦比亚"],["ve","委内瑞拉"],["gy","圭亚那"],["sr","苏里南"],["ec","厄瓜多尔"],["pe","秘鲁"],["bo","玻利维亚"],["br","巴西"],["py","巴拉圭"],["uy","乌拉圭"],["ar","阿根廷"],["cl","智利"],
    ["au","澳大利亚"],["nz","新西兰"],["pg","巴布亚新几内亚"],["fj","斐济"],["sb","所罗门群岛"],["vu","瓦努阿图"],["ws","萨摩亚"],["to","汤加"],["ki","基里巴斯"],["fm","密克罗尼西亚联邦"],["mh","马绍尔群岛"],["pw","帕劳"],["nr","瑙鲁"],["tv","图瓦卢"]
  ].map(([code, name]) => ({ code, name }));

  const flagEmoji = code => String.fromCodePoint(...code.toUpperCase().split("").map(letter => 127397 + letter.charCodeAt(0)));

  const BEST_KEY = "travel_in_time_flag_link_best_v1";
  const els = {
    board: document.getElementById("gameBoard"), frame: document.getElementById("boardFrame"),
    path: document.getElementById("pathLayer"), timer: document.getElementById("timer"),
    pairs: document.getElementById("pairCount"), level: document.getElementById("levelName"),
    start: document.getElementById("startBtn"), hint: document.getElementById("hintBtn"),
    hintCount: document.getElementById("hintCount"), pause: document.getElementById("pauseBtn"),
    shuffle: document.getElementById("shuffleBtn"), last: document.getElementById("lastMatch"),
    toast: document.getElementById("gameToast"), dialog: document.getElementById("resultDialog"),
    resultEyebrow: document.getElementById("resultEyebrow"), resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"), resultTime: document.getElementById("resultTime"),
    again: document.getElementById("againBtn"), closeResult: document.getElementById("closeResultBtn")
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
        const flag = document.createElement("span");
        flag.className = "flag-art";
        flag.textContent = flagEmoji(tile.code);
        flag.setAttribute("aria-hidden", "true");
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
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", points.map(point => pathPoint(point).join(",")).join(" "));
    els.path.replaceChildren(polyline);
    setTimeout(() => els.path.replaceChildren(), 260);
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
      finishGame(true);
      return;
    }
    if (!findAnyPair()) reshuffle(true);
  };

  function chooseTile(position) {
    if (!playing || paused || locked || !tileAt(position)) return;
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
      firstElement?.classList.add("matched");
      secondElement?.classList.add("selected", "matched");
      drawPath(path);
      els.last.innerHTML = `<span>最近识别</span><strong>${firstTile.name}</strong>`;
      setTimeout(() => {
        board[first.row][first.col] = null;
        board[position.row][position.col] = null;
        selected = null;
        locked = false;
        renderBoard();
        afterMatch();
      }, 230);
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
      remainingMs = Math.max(0, deadline - Date.now());
      els.pause.innerHTML = "<span>▶</span><strong>继续</strong><small>恢复计时</small>";
      els.board.style.filter = "blur(5px) brightness(.52)";
    } else {
      deadline = Date.now() + remainingMs;
      els.pause.innerHTML = "<span>Ⅱ</span><strong>暂停</strong><small>计时停止</small>";
      els.board.style.filter = "";
    }
  };

  const finishGame = won => {
    if (!playing) return;
    if (!paused) remainingMs = Math.max(0, deadline - Date.now());
    playing = false;
    paused = false;
    clearInterval(timerId);
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
  };

  document.querySelectorAll(".difficulty").forEach(button => button.addEventListener("click", () => {
    if (playing && !confirm("切换难度会结束当前游戏，是否继续？")) return;
    clearInterval(timerId);
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
  els.again.addEventListener("click", () => { els.dialog.close(); startGame(); });
  els.closeResult.addEventListener("click", () => els.dialog.close());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing && !paused) {
      setPaused(true);
      showToast("游戏已自动暂停");
    }
  });

  updateBestBoard();
})();
