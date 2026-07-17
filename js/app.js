/* Niji 提示詞配搭工具 */
(function () {
  const STORAGE_KEY = "niji-selected-words";
  const SLIDE_INTERVAL = 5000; // 自動切換間隔（毫秒）
  const imageFiles = Array.isArray(window.IMAGE_FILES) ? window.IMAGE_FILES : [];

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
      // gender 未標時繼承分類層級的 gender（如「臉部毛髮」整類男性專屬）
      // catSingle/catDetail 記錄分類的單選與細節（髮色）屬性，供 toggleWord 判斷
      wordIndex[w.slug] = { ...w, category: cat.category, hue: cat.hue, catIdx, wIdx, gender: w.gender || cat.gender, catSingle: cat.single, catDetail: cat.detail };
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
    document.documentElement.dataset.gender = selectedGender;
  }
  document.documentElement.dataset.gender = selectedGender;

  // 性別分頁過濾：female→f、male→m，未選性別時全部顯示
  function genderTag() {
    return selectedGender === "female" ? "f" : selectedGender === "male" ? "m" : "";
  }
  function wordVisible(w) {
    const t = genderTag();
    return !w.gender || !t || w.gender === t;
  }
  function catVisible(cat) {
    const t = genderTag();
    if (cat.gender && t && cat.gender !== t) return false;
    return cat.words.some(wordVisible);
  }

  /* ===== 髮色細節（基本色 + 效果 + 第二色） ===== */
  const HAIR_SECOND_KEY = "niji-hair-second";
  let hairSecond = localStorage.getItem(HAIR_SECOND_KEY) || "";
  if (!wordIndex[hairSecond] || !wordIndex[hairSecond].catDetail || wordIndex[hairSecond].effect) hairSecond = "";

  function setHairSecond(slug) {
    hairSecond = slug;
    localStorage.setItem(HAIR_SECOND_KEY, hairSecond);
  }
  function selectedHairBase() {
    return selected.find(s => wordIndex[s].catDetail && !wordIndex[s].effect) || "";
  }
  function selectedHairFx() {
    return selected.find(s => wordIndex[s].catDetail && wordIndex[s].effect) || "";
  }
  // 第二色只有在「效果需要雙色 + 已選基本色」時才有意義，其餘情況自動清掉
  function normalizeHairSecond() {
    const base = selectedHairBase(), fx = selectedHairFx();
    const ok = fx && wordIndex[fx].two && base && hairSecond &&
      hairSecond !== base && wordIndex[hairSecond] && wordVisible(wordIndex[hairSecond]);
    if (!ok && hairSecond) setHairSecond("");
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
        ensureActiveCategoryVisible();
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

    // 目前分類被性別過濾隱藏時，退回該群組第一個可見分類（detail 分類不顯示格子）
    function ensureActiveCategoryVisible() {
      const group = groups.find(g => g.name === activeGroup);
      const visibleCats = group.cats.filter(c => !c.detail && catVisible(c));
      if (!visibleCats.some(c => c.category === activeCategory)) {
        activeCategory = (visibleCats[0] || group.cats[0]).category;
      }
    }

    function renderGroupPanel() {
      const group = groups.find(g => g.name === activeGroup);
      panel.innerHTML = "";

      if (group.name === "角色設定") {
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
            // 切換性別分頁時，把不屬於這個性別的已選詞清掉
            const kept = selected.filter(s => wordVisible(wordIndex[s]));
            const removed = selected.length - kept.length;
            selected = kept;
            saveSelection();
            normalizeHairSecond();
            ensureActiveCategoryVisible();
            renderGroupPanel();
            renderDrawer();
            render();
            if (removed > 0) showToast(`已移除 ${removed} 個不符性別的詞`);
          });
          row.appendChild(b);
        });
        panel.appendChild(row);
      }

      const tiles = document.createElement("div");
      tiles.className = "group-tiles";
      group.cats.filter(c => !c.detail && catVisible(c)).forEach(cat => {
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

  // 髮型結構分類；只有選擇「髮型長度」時會自動彈出髮色視窗
  const HAIR_STRUCT_CATS = ["髮型長度", "髮質捲度", "瀏海", "髮型造型"];
  const HAIR_MODAL_TRIGGER_CATS = ["髮型長度"];
  const HAIR_COLOR_CAT = PROMPT_DATA.find(c => c.detail);

  function buildWordList(words, onPick) {
    const list = document.createElement("div");
    list.className = "word-list";
    words.forEach(w => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = w.zh;
      btn.title = w.en;
      btn.dataset.slug = w.slug;
      btn.addEventListener("click", () => (onPick || toggleWord)(w.slug));
      list.appendChild(btn);
    });
    return list;
  }

  function renderDrawer() {
    const cat = PROMPT_DATA.find(c => c.category === activeCategory);
    optionDrawer.innerHTML = "";
    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = `${cat.icon} ${cat.category}${cat.single ? "（單選）" : ""}`;
    optionDrawer.appendChild(title);

    optionDrawer.appendChild(buildWordList(cat.words.filter(wordVisible)));

    // 已選髮型時，提供重開髮色細節視窗的按鈕
    const hairSelected = selected.some(s => HAIR_STRUCT_CATS.includes(wordIndex[s].category));
    if (HAIR_STRUCT_CATS.includes(cat.category) && hairSelected) {
      const base = selectedHairBase(), fx = selectedHairFx();
      let status = base ? wordIndex[base].zh : "未選色";
      if (fx) status += `＋${wordIndex[fx].zh}`;
      if (hairSecond) status += `→${wordIndex[hairSecond].zh}`;
      const openBtn = document.createElement("button");
      openBtn.className = "hair-color-open";
      openBtn.type = "button";
      openBtn.textContent = `🎨 髮色細節（${status}）`;
      openBtn.addEventListener("click", openHairModal);
      optionDrawer.appendChild(openBtn);
    }
  }

  /* ===== 髮色細節彈出視窗 ===== */
  const modalBackdrop = document.createElement("div");
  modalBackdrop.className = "modal-backdrop";
  modalBackdrop.hidden = true;
  document.body.appendChild(modalBackdrop);
  modalBackdrop.addEventListener("click", e => {
    if (e.target === modalBackdrop) closeHairModal();
  });

  function openHairModal() {
    modalBackdrop.hidden = false;
    buildHairModal();
  }
  function closeHairModal() {
    modalBackdrop.hidden = true;
  }

  // 視窗只在開啟時重建一次；之後點按鈕只做局部更新（選中狀態、第二色區顯示），
  // 避免整窗重繪讓開窗動畫重播、畫面跳動
  let secondSection = null, secondTitle = null, secondHint = null, secondList = null;

  function buildHairModal() {
    modalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = "🎨 髮色細節";
    panel.appendChild(title);

    const styleNames = selected
      .filter(s => HAIR_STRUCT_CATS.includes(wordIndex[s].category))
      .map(s => wordIndex[s].zh);
    const sub = document.createElement("p");
    sub.className = "modal-sub";
    sub.textContent = styleNames.length ? `目前髮型：${styleNames.join("、")}` : "尚未選擇髮型";
    panel.appendChild(sub);

    // 基本色/效果按鈕帶 data-slug，選中狀態由 renderCategoryState 就地更新
    const refresh = slug => { toggleWord(slug); updateHairModal(); };

    const baseTitle = document.createElement("p");
    baseTitle.className = "drawer-title";
    baseTitle.textContent = "🖌️ 基本髮色（單選）";
    panel.appendChild(baseTitle);
    panel.appendChild(buildWordList(HAIR_COLOR_CAT.words.filter(w => !w.effect && wordVisible(w)), refresh));

    const fxTitle = document.createElement("p");
    fxTitle.className = "drawer-title";
    fxTitle.textContent = "✨ 染髮效果（單選，可不選）";
    panel.appendChild(fxTitle);
    panel.appendChild(buildWordList(HAIR_COLOR_CAT.words.filter(w => w.effect && wordVisible(w)), refresh));

    // 第二色區：常駐於視窗 DOM，依所選效果顯示/隱藏
    secondSection = document.createElement("div");
    secondTitle = document.createElement("p");
    secondTitle.className = "drawer-title";
    secondSection.appendChild(secondTitle);
    secondHint = document.createElement("p");
    secondHint.className = "modal-sub";
    secondHint.textContent = "先選基本髮色，才能挑第二色";
    secondSection.appendChild(secondHint);
    secondList = document.createElement("div");
    secondList.className = "word-list";
    HAIR_COLOR_CAT.words.filter(w => !w.effect && wordVisible(w)).forEach(w => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = w.zh;
      btn.title = w.en;
      btn.dataset.second = w.slug;
      btn.addEventListener("click", () => {
        setHairSecond(hairSecond === w.slug ? "" : w.slug);
        render();
        updateHairModal();
      });
      secondList.appendChild(btn);
    });
    secondSection.appendChild(secondList);
    panel.appendChild(secondSection);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeHairModal);
    actions.appendChild(done);
    panel.appendChild(actions);

    modalBackdrop.appendChild(panel);
    renderCategoryState(); // 標記基本色/效果按鈕的選中狀態
    updateHairModal();
  }

  // 局部更新：第二色區的顯示與按鈕狀態（與基本色相同的按鈕停用）
  function updateHairModal() {
    if (modalBackdrop.hidden || !secondSection) return;
    const base = selectedHairBase(), fx = selectedHairFx();
    const fw = fx ? wordIndex[fx] : null;
    const show = !!(fw && fw.two);
    secondSection.hidden = !show;
    if (!show) return;
    secondTitle.textContent = `🎯 第二色（${fw.zh}）`;
    secondHint.hidden = !!base;
    secondList.hidden = !base;
    secondList.querySelectorAll(".word-btn").forEach(btn => {
      btn.disabled = btn.dataset.second === base;
      btn.classList.toggle("active", hairSecond === btn.dataset.second);
    });
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
      if (badge.dataset.group === "角色設定" && selectedGender) n += 1;
      badge.textContent = n;
      badge.classList.toggle("show", n > 0);
    });
    // 只處理有 data-slug 的按鈕（第二色按鈕的選中狀態由視窗自行標記）
    document.querySelectorAll(".word-btn[data-slug]").forEach(btn => {
      btn.classList.toggle("active", selected.includes(btn.dataset.slug));
    });
  }

  /* ===== 選詞 / 取消 ===== */
  function toggleWord(slug) {
    const idx = selected.indexOf(slug);
    const w = wordIndex[slug];
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      if (w.catSingle) {
        // 單選分類：換選時自動移除同分類舊詞
        selected = selected.filter(s => wordIndex[s].category !== w.category);
      } else if (w.catDetail) {
        // 髮色：基本色單選、效果也單選（各自替換）
        selected = selected.filter(s => !(wordIndex[s].category === w.category && !wordIndex[s].effect === !w.effect));
      }
      selected.push(slug);
    }
    saveSelection();
    normalizeHairSecond();
    render();
    // 選中髮型（長度/質地/瀏海/造型）時彈出髮色細節視窗
    if (idx < 0 && HAIR_MODAL_TRIGGER_CATS.includes(w.category)) openHairModal();
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
    renderDrawer(); // 選詞會影響髮色細節區的展開/收起，重繪抽屜
    renderCategoryState();

    // 選中詞 chips（依 niji 7 順序排列、以分類色區分；性別 chip 排在人物詞最前）
    const ordered = sortForPrompt(selected);
    const groupOf = slug => PROMPT_DATA[wordIndex[slug].catIdx].group;
    const bigSlugs = ordered.filter(s => groupOf(s) === "畫面設定");
    const charSlugs = ordered.filter(s => groupOf(s) === "角色設定");
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
    // 第二色 chip（點擊移除）
    if (hairSecond) {
      const w = wordIndex[hairSecond];
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.title = "髮色第二色｜點擊移除";
      chip.style.setProperty("--hue", HAIR_COLOR_CAT.hue);
      chip.innerHTML = `第二色·${w.zh} <span class="x">×</span>`;
      chip.addEventListener("click", () => { setHairSecond(""); render(); });
      chipsEl.appendChild(chip);
    }
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
       1girl with {髮型各分類, ..., and 眼睛}, {氣質}, {表情}, wearing {服裝}, {動作}, {道具}
       （髮型依：長度→質地→瀏海→造型→髮色→髮飾 的順序，逗號串接、最後一項前用 and）
     缺任一部分就跳過；沒選性別時人物詞退回逗號並列。
     背景裝飾詞：逗號並列在最後（參考 niji 7 範例的擺放位置）。
     （注意：此處依分類名稱組句，若在 data.js 改分類名稱需同步修改） */
  // 髮色組字：基本色 + 效果（+ 第二色）依模板合成一句；條件不足時退回逗號並列
  function hairColorParts() {
    const base = selectedHairBase(), fx = selectedHairFx();
    const hue = HAIR_COLOR_CAT.hue;
    const colorName = slug => wordIndex[slug].en.replace(/ hair$/, "");
    if (fx) {
      const fw = wordIndex[fx];
      if (fw.two && fw.tpl && base && hairSecond) {
        return [{ text: fw.tpl.replace("{a}", colorName(base)).replace("{b}", colorName(hairSecond)), hue }];
      }
      if (!fw.two && fw.tpl && base) {
        return [{ text: fw.tpl.replace("{a}", colorName(base)), hue }];
      }
      const parts = [];
      if (base) parts.push({ text: wordIndex[base].en, hue });
      parts.push({ text: fw.en, hue });
      return parts;
    }
    return base ? [{ text: wordIndex[base].en, hue }] : [];
  }

  function buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender) {
    const tokens = []; // { text, hue?, isGender? }
    const word = slug => tokens.push({ text: wordIndex[slug].en, hue: wordIndex[slug].hue });
    const plain = text => tokens.push({ text });
    const byCat = cat => charSlugs.filter(s => wordIndex[s].category === cat);

    bigSlugs.forEach((s, i) => { if (i) plain(", "); word(s); });

    if (!gender) {
      let colorDone = false;
      charSlugs.forEach(s => {
        if (wordIndex[s].catDetail) {
          // 髮色詞改由 hairColorParts 統一組出（含第二色），只插入一次
          if (!colorDone) {
            hairColorParts().forEach(p => { if (tokens.length) plain(", "); tokens.push(p); });
            colorDone = true;
          }
          return;
        }
        if (tokens.length) plain(", ");
        word(s);
      });
    } else {
      if (tokens.length) plain(", ");
      tokens.push({ text: gender.en, isGender: true });

      const HAIR_CATS = ["髮型長度", "髮質捲度", "瀏海", "髮型造型", "髮色", "臉部毛髮", "髮飾"];
      const parts = [];
      HAIR_CATS.forEach(c => {
        if (c === "髮色") parts.push(...hairColorParts());
        else byCat(c).forEach(s => parts.push({ text: wordIndex[s].en, hue: wordIndex[s].hue }));
      });
      byCat("眼睛").forEach(s => parts.push({ text: wordIndex[s].en, hue: wordIndex[s].hue }));
      if (parts.length) {
        plain(" with ");
        parts.forEach((p, i) => {
          if (i) plain(i === parts.length - 1 ? " and " : ", ");
          tokens.push(p);
        });
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

  /* ===== 依檔名中的英文提示詞配對圖片 ===== */
  function normalizeImageText(value) {
    return value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findWordImages(slug) {
    const keyword = normalizeImageText(wordIndex[slug].en);
    return imageFiles.filter(src => {
      const filename = src.split("/").pop().replace(/\.[^.]+$/, "");
      return normalizeImageText(filename).includes(keyword);
    });
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

    const lists = selected.map(slug =>
      findWordImages(slug).map(src => ({
        src, zh: wordIndex[slug].zh, en: wordIndex[slug].en, slug
      }))
    );
    if (token !== rebuildToken) return; // 期間選詞又變了，放棄這次結果

    const uniqueImages = new Map();
    lists.flat().forEach(item => {
      const existing = uniqueImages.get(item.src);
      if (existing) {
        if (!existing.zh.includes(item.zh)) existing.zh += `、${item.zh}`;
        if (!existing.en.includes(item.en)) existing.en += `, ${item.en}`;
      } else {
        uniqueImages.set(item.src, { ...item });
      }
    });
    pool = shuffle([...uniqueImages.values()]);
    slideIdx = 0;

    if (!pool.length) {
      slideshow.hidden = true;
      galleryHint.style.display = "";
      if (!imageFiles.length) {
        galleryHint.innerHTML =
          `尚未建立圖片索引 🖼<br>將圖片放入 <b>images/</b> 後，執行 <b>update-image-index.cmd</b>`;
      } else {
        const keywords = selected.map(s => wordIndex[s].en).join("、");
        galleryHint.innerHTML =
          `找不到檔名包含所選英文提示詞的圖片 🖼<br><b>${keywords}</b>`;
      }
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
    if (!selected.length && !selectedGender && !hairSecond) return;
    selected = [];
    setGender("");
    setHairSecond("");
    saveSelection();
    render();
    showToast("已清空");
  });

  /* ===== 使用說明彈窗 ===== */
  const helpModal = document.getElementById("helpModal");
  document.getElementById("helpToggle").addEventListener("click", () => { helpModal.hidden = false; });
  document.getElementById("helpClose").addEventListener("click", () => { helpModal.hidden = true; });
  helpModal.addEventListener("click", e => {
    if (e.target === helpModal) helpModal.hidden = true;
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
