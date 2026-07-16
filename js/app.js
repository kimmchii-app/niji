/* Niji 提示詞配搭工具 */
(function () {
  const STORAGE_KEY = "niji-selected-words";
  const MAX_IMAGES_PER_WORD = 12; // 每個詞最多嘗試載入的圖片張數
  const IMAGE_EXTS = ["jpg", "png", "webp"];
  const SLIDE_INTERVAL = 5000; // 自動切換間隔（毫秒）

  const chipsEl = document.getElementById("selectedChips");
  const emptyHint = document.getElementById("emptyHint");
  const promptText = document.getElementById("promptText");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const catGrid = document.getElementById("catGrid");
  const optionDrawer = document.getElementById("optionDrawer");
  const galleryHint = document.getElementById("galleryHint");
  const slideshow = document.getElementById("slideshow");
  const slideImg = document.getElementById("slideImg");
  const slideCaption = document.getElementById("slideCaption");
  const slideCounter = document.getElementById("slideCounter");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const toast = document.getElementById("toast");

  // slug -> word 物件的索引（含分類順序 catIdx 與代表色 hue）
  const wordIndex = {};
  PROMPT_DATA.forEach((cat, catIdx) =>
    cat.words.forEach((w, wIdx) => {
      wordIndex[w.slug] = { ...w, category: cat.category, hue: cat.hue, catIdx, wIdx };
    })
  );

  // 依 niji 7 寫作順序（大方向→小方向）排序，同分類內依詞庫順序
  function sortForPrompt(slugs) {
    return [...slugs].sort((a, b) =>
      (wordIndex[a].catIdx - wordIndex[b].catIdx) || (wordIndex[a].wIdx - wordIndex[b].wIdx)
    );
  }

  // 已選詞（依點選順序）
  let selected = loadSelection();
  let activeCategory = PROMPT_DATA[0].category;
  let activeGroup = PROMPT_DATA[0].group;
  let currentPrompt = ""; // 複製用的純文字提示詞

  // 性別（"" = 不指定，單選）
  const GENDER_KEY = "niji-gender";
  let selectedGender = localStorage.getItem(GENDER_KEY) || "";
  if (!GENDERS.some(g => g.key === selectedGender)) selectedGender = "";

  function setGender(key) {
    selectedGender = key;
    localStorage.setItem(GENDER_KEY, selectedGender);
  }

  /* ===== 大方向頁籤 + 分類圖示 + 下方選項區 ===== */
  function buildCategories() {
    const groups = [];
    PROMPT_DATA.forEach(cat => {
      let g = groups.find(x => x.name === cat.group);
      if (!g) { g = { name: cat.group, cats: [] }; groups.push(g); }
      g.cats.push(cat);
    });

    const tabs = document.createElement("div");
    tabs.className = "group-tabs";
    groups.forEach(g => {
      const tab = document.createElement("button");
      tab.className = "group-tab";
      tab.type = "button";
      tab.dataset.group = g.name;
      tab.innerHTML = `<span>${g.name}</span><span class="gcount" data-group="${g.name}"></span>`;
      tab.addEventListener("click", () => {
        activeGroup = g.name;
        if (!g.cats.some(cat => cat.category === activeCategory)) activeCategory = g.cats[0].category;
        renderGroupPanel();
        renderDrawer();
        renderCategoryState();
      });
      tabs.appendChild(tab);
    });
    catGrid.appendChild(tabs);

    const panel = document.createElement("div");
    panel.className = "group-panel";
    panel.id = "groupPanel";
    catGrid.appendChild(panel);

    function renderGroupPanel() {
      const group = groups.find(g => g.name === activeGroup);
      panel.innerHTML = "";

      if (group.name === "人物小方向") {
        const row = document.createElement("div");
        row.className = "gender-row";
        GENDERS.forEach(gd => {
          const b = document.createElement("button");
          b.className = "gender-btn";
          b.type = "button";
          b.dataset.gender = gd.key;
          b.textContent = `${gd.icon} ${gd.zh}`;
          b.title = gd.en;
          b.addEventListener("click", () => {
            setGender(selectedGender === gd.key ? "" : gd.key);
            render();
          });
          row.appendChild(b);
        });
        panel.appendChild(row);
      }

      const tiles = document.createElement("div");
      tiles.className = "group-tiles";
      group.cats.forEach(cat => {
        const tile = document.createElement("button");
        tile.className = "cat-tile";
        tile.type = "button";
        tile.dataset.cat = cat.category;
        tile.style.setProperty("--hue", cat.hue);
        tile.innerHTML = `<span class="cat-icon">${cat.icon}</span>
          <span class="cat-name"><span class="dot"></span>${cat.category}</span>
          <span class="count" data-cat="${cat.category}"></span>`;
        tile.addEventListener("click", () => {
          activeCategory = cat.category;
          renderDrawer();
          renderCategoryState();
        });
        tiles.appendChild(tile);
      });
      panel.appendChild(tiles);
      enableDragScroll(tiles);
    }

    renderGroupPanel();
    renderDrawer();
  }

  function renderDrawer() {
    const cat = PROMPT_DATA.find(c => c.category === activeCategory);
    optionDrawer.innerHTML = "";
    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = `${cat.icon} ${cat.category}`;
    optionDrawer.appendChild(title);

    const list = document.createElement("div");
    list.className = "word-list";
    cat.words.forEach(w => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = w.zh;
      btn.title = w.en;
      btn.dataset.slug = w.slug;
      btn.addEventListener("click", () => toggleWord(w.slug));
      list.appendChild(btn);
    });
    optionDrawer.appendChild(list);
  }

  function renderCategoryState() {
    document.querySelectorAll(".group-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.group === activeGroup);
    });
    document.querySelectorAll(".cat-tile").forEach(tile => {
      tile.classList.toggle("active", tile.dataset.cat === activeCategory);
    });
    document.querySelectorAll(".gender-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.gender === selectedGender);
    });
    document.querySelectorAll(".count").forEach(badge => {
      const n = selected.filter(s => wordIndex[s].category === badge.dataset.cat).length;
      badge.textContent = n;
      badge.classList.toggle("show", n > 0);
    });
    // 頁籤上的已選數量
    document.querySelectorAll(".gcount").forEach(badge => {
      let n = selected.filter(s => PROMPT_DATA[wordIndex[s].catIdx].group === badge.dataset.group).length;
      if (badge.dataset.group === "人物小方向" && selectedGender) n += 1;
      badge.textContent = n;
      badge.classList.toggle("show", n > 0);
    });
    document.querySelectorAll(".word-btn").forEach(btn => {
      btn.classList.toggle("active", selected.includes(btn.dataset.slug));
    });
  }

  /* ===== 選詞 / 取消 ===== */
  function toggleWord(slug) {
    const idx = selected.indexOf(slug);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push(slug);
    saveSelection();
    render();
  }

  function loadSelection() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return raw.filter(s => wordIndex[s]);
    } catch { return []; }
  }
  function saveSelection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }

  /* ===== 畫面更新 ===== */
  function render() {
    renderCategoryState();

    // 選中詞 chips（依 niji 7 順序排列、以分類色區分；性別 chip 排在人物詞最前）
    const ordered = sortForPrompt(selected);
    const groupOf = slug => PROMPT_DATA[wordIndex[slug].catIdx].group;
    const bigSlugs = ordered.filter(s => groupOf(s) === "圖片大方向");
    const charSlugs = ordered.filter(s => groupOf(s) === "人物小方向");
    const tailSlugs = ordered.filter(s => groupOf(s) === "背景裝飾");
    const gender = GENDERS.find(g => g.key === selectedGender);

    chipsEl.querySelectorAll(".chip").forEach(c => c.remove());
    emptyHint.style.display = (selected.length || gender) ? "none" : "";

    const addWordChip = slug => {
      const w = wordIndex[slug];
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.title = `${w.category}｜點擊移除`;
      chip.style.setProperty("--hue", w.hue);
      chip.innerHTML = `${w.zh} <span class="x">×</span>`;
      chip.addEventListener("click", () => toggleWord(slug));
      chipsEl.appendChild(chip);
    };
    bigSlugs.forEach(addWordChip);
    if (gender) {
      const chip = document.createElement("button");
      chip.className = "chip chip-gender";
      chip.type = "button";
      chip.title = "性別｜點擊移除";
      chip.innerHTML = `${gender.icon} ${gender.zh} <span class="x">×</span>`;
      chip.addEventListener("click", () => { setGender(""); render(); });
      chipsEl.appendChild(chip);
    }
    charSlugs.forEach(addWordChip);
    tailSlugs.forEach(addWordChip);

    // 提示詞字串（複製用純文字 + 預覽用分色顯示）
    const tokens = buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender);
    currentPrompt = tokens.map(t => t.text).join("");
    promptText.innerHTML = "";
    tokens.forEach(t => {
      if (t.hue != null || t.isGender) {
        const span = document.createElement("span");
        span.className = t.isGender ? "pw pw-gender" : "pw";
        if (t.hue != null) span.style.setProperty("--hue", t.hue);
        span.textContent = t.text;
        promptText.appendChild(span);
      } else {
        promptText.appendChild(document.createTextNode(t.text));
      }
    });

    rebuildSlideshow();
  }

  /* ===== 提示詞組字 =====
     大方向詞：逗號並列在最前。
     人物段（有選性別時）組成自然語句：
       1girl with {髮型 and 眼睛}, {氣質}, {表情}, wearing {服裝}, {動作}, {道具}
     缺任一部分就跳過；沒選性別時人物詞退回逗號並列。
     背景裝飾詞：逗號並列在最後（參考 niji 7 範例的擺放位置）。
     （注意：此處依分類名稱組句，若在 data.js 改分類名稱需同步修改） */
  function buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender) {
    const tokens = []; // { text, hue?, isGender? }
    const word = slug => tokens.push({ text: wordIndex[slug].en, hue: wordIndex[slug].hue });
    const plain = text => tokens.push({ text });
    const byCat = cat => charSlugs.filter(s => wordIndex[s].category === cat);

    bigSlugs.forEach((s, i) => { if (i) plain(", "); word(s); });

    if (!gender) {
      charSlugs.forEach(s => { if (tokens.length) plain(", "); word(s); });
    } else {
      if (tokens.length) plain(", ");
      tokens.push({ text: gender.en, isGender: true });

      const hairEyes = [...byCat("髮型髮色"), ...byCat("眼睛")];
      if (hairEyes.length) {
        plain(" with ");
        hairEyes.forEach((s, i) => { if (i) plain(" and "); word(s); });
      }
      byCat("氣質特質").forEach(s => { plain(", "); word(s); });
      byCat("表情").forEach(s => { plain(", "); word(s); });
      const clothes = byCat("服裝");
      if (clothes.length) {
        plain(", wearing ");
        clothes.forEach((s, i) => { if (i) plain(" and "); word(s); });
      }
      byCat("動作姿勢").forEach(s => { plain(", "); word(s); });
      byCat("隨身道具").forEach(s => { plain(", "); word(s); });
    }

    tailSlugs.forEach(s => { if (tokens.length) plain(", "); word(s); });
    return tokens;
  }

  /* ===== 選中詞區：單列橫向拖曳滑動 ===== */
  function enableDragScroll(el) {
    let isDown = false, startX = 0, startLeft = 0, moved = false;
    el.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse") return; // 觸控用原生滑動即可
      isDown = true; moved = false;
      startX = e.clientX; startLeft = el.scrollLeft;
    });
    el.addEventListener("pointermove", e => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      if (moved) el.scrollLeft = startLeft - dx;
    });
    ["pointerup", "pointerleave"].forEach(ev =>
      el.addEventListener(ev, () => {
        isDown = false;
        // 只抑制拖曳放開瞬間產生的那一次 click，之後的正常點擊不受影響
        if (moved) setTimeout(() => { moved = false; }, 0);
      })
    );
    // 拖曳後放開時不要誤觸發 chip 的移除
    el.addEventListener("click", e => {
      if (moved) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
  enableDragScroll(chipsEl);

  /* ===== 圖片探測（每個詞掃一次並快取）===== */
  const imageCache = {}; // slug -> Promise<string[]>

  function probeWordImages(slug) {
    if (imageCache[slug]) return imageCache[slug];
    imageCache[slug] = new Promise(resolve => {
      const found = [];
      probe(1);
      function probe(n) {
        if (n > MAX_IMAGES_PER_WORD) { resolve(found); return; }
        tryExts(0);
        function tryExts(extIdx) {
          if (extIdx >= IMAGE_EXTS.length) { resolve(found); return; } // 編號中斷即停止
          const src = `images/${slug}/${n}.${IMAGE_EXTS[extIdx]}`;
          const img = new Image();
          img.onload = () => { found.push(src); probe(n + 1); };
          img.onerror = () => tryExts(extIdx + 1);
          img.src = src;
        }
      }
    });
    return imageCache[slug];
  }

  /* ===== 隨機輪播 ===== */
  let pool = [];        // [{ src, zh, en }]
  let slideIdx = 0;
  let slideTimer = null;
  let rebuildToken = 0;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function rebuildSlideshow() {
    const token = ++rebuildToken;
    stopTimer();

    if (!selected.length) {
      pool = [];
      slideshow.hidden = true;
      galleryHint.style.display = "";
      galleryHint.innerHTML = "選詞後，這裡會隨機輪播對應的參考圖片";
      return;
    }

    const lists = await Promise.all(selected.map(slug =>
      probeWordImages(slug).then(srcs => srcs.map(src => ({
        src, zh: wordIndex[slug].zh, en: wordIndex[slug].en, slug
      })))
    ));
    if (token !== rebuildToken) return; // 期間選詞又變了，放棄這次結果

    pool = shuffle(lists.flat());
    slideIdx = 0;

    if (!pool.length) {
      slideshow.hidden = true;
      galleryHint.style.display = "";
      const dirs = selected.map(s => `images/${s}/`).join("、");
      galleryHint.innerHTML =
        `選中的詞還沒有參考圖 🖼<br>把圖片放入 <b>${dirs}</b><br>（檔名 1.jpg、2.jpg… 依序編號）`;
      return;
    }

    galleryHint.style.display = "none";
    slideshow.hidden = false;
    showSlide(0);
    startTimer();
  }

  function showSlide(i) {
    slideIdx = (i + pool.length) % pool.length;
    const item = pool[slideIdx];
    slideImg.src = item.src;
    slideImg.alt = item.zh;
    slideCaption.textContent = `${item.zh}（${item.en}）`;
    slideCounter.textContent = `${slideIdx + 1} / ${pool.length}`;
  }

  // 圖片載入失敗（被移除或改名）時，從輪播池剔除並跳下一張
  slideImg.addEventListener("error", () => {
    if (!pool.length || slideshow.hidden) return;
    pool.splice(slideIdx, 1);
    if (!pool.length) {
      stopTimer();
      slideshow.hidden = true;
      galleryHint.style.display = "";
      return;
    }
    showSlide(slideIdx);
  });

  function startTimer() {
    stopTimer();
    if (pool.length > 1) {
      slideTimer = setInterval(() => showSlide(slideIdx + 1), SLIDE_INTERVAL);
    }
  }
  function stopTimer() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
  }

  prevBtn.addEventListener("click", () => { showSlide(slideIdx - 1); startTimer(); });
  nextBtn.addEventListener("click", () => { showSlide(slideIdx + 1); startTimer(); });

  // 頁面切到背景時暫停，回來時繼續
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else if (!slideshow.hidden) startTimer();
  });

  /* ===== 複製 / 清空 ===== */
  copyBtn.addEventListener("click", async () => {
    const text = currentPrompt.trim();
    if (!text) { showToast("還沒有選擇任何提示詞"); return; }
    try {
      await navigator.clipboard.writeText(text);
      showToast("已複製提示詞 ✓");
    } catch {
      // 舊瀏覽器 / 非 https 的備援
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("已複製提示詞 ✓");
    }
  });

  clearBtn.addEventListener("click", () => {
    if (!selected.length && !selectedGender) return;
    selected = [];
    setGender("");
    saveSelection();
    render();
    showToast("已清空");
  });

  /* ===== 深淺色主題切換 ===== */
  const THEME_KEY = "niji-theme";
  const themeToggle = document.getElementById("themeToggle");

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  // 預設跟隨系統，若曾手動切換則以記錄為準
  applyTheme(
    localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );

  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  /* ===== 啟動 ===== */
  buildCategories();
  render();
})();
