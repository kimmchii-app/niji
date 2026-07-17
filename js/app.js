/* Niji 提示詞配搭工具 */
(function () {
  const STORAGE_KEY = "niji-selected-words";
  const CUSTOM_TEXT_KEY = "niji-custom-prompt";
  const CUSTOM_POSITION_KEY = "niji-custom-position";
  const CUSTOM_WORDS_KEY = "niji-custom-words";
  const PROMPT_OVERRIDES_KEY = "niji-prompt-overrides";
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
  let activeWorkspace = "prompt";
  let renderMainPanel = () => {};
  let currentPrompt = ""; // 複製用的純文字提示詞
  let currentBasePrompt = "";
  let currentPromptTokens = [];
  let customWords = loadCustomWords();
  let activeCustomId = customWords[0]?.id || "";
  let pendingCustomFocusId = "";
  let promptOverrides = loadPromptOverrides();

  const PROFILE_CODES_KEY = "niji-profile-codes";
  const SELECTED_PROFILE_KEY = "niji-selected-profile";
  let profileCodes = loadProfileCodes();
  let selectedProfile = localStorage.getItem(SELECTED_PROFILE_KEY) || "";
  if (!profileCodes.includes(selectedProfile)) selectedProfile = "";

  function normalizeProfileCode(value) {
    return value.replace(/^\s*--p\s+/i, "").replace(/\s+/g, " ").trim();
  }

  function loadProfileCodes() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_CODES_KEY) || "[]");
      return Array.isArray(raw)
        ? [...new Set(raw.filter(code => typeof code === "string").map(normalizeProfileCode).filter(Boolean))]
        : [];
    } catch { return []; }
  }

  function saveProfiles() {
    localStorage.setItem(PROFILE_CODES_KEY, JSON.stringify(profileCodes));
    localStorage.setItem(SELECTED_PROFILE_KEY, selectedProfile);
  }

  function loadLegacyCustomAnchor() {
    const stored = localStorage.getItem(CUSTOM_POSITION_KEY) || "end";
    if (stored === "before" || stored === "start") return "start";
    if (stored === "after" || stored === "end") return "end";
    return /^comma:\d+$/.test(stored) ? stored : "end";
  }

  function createCustomWord(text = "", anchor = "end") {
    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      anchor
    };
  }

  function validCustomAnchor(anchor) {
    return anchor === "start" || anchor === "end" || /^comma:\d+$/.test(anchor);
  }

  function loadCustomWords() {
    try {
      const raw = JSON.parse(localStorage.getItem(CUSTOM_WORDS_KEY) || "null");
      if (Array.isArray(raw)) {
        return raw
          .filter(item => item && typeof item.id === "string" && typeof item.text === "string")
          .map(item => ({
            id: item.id,
            text: item.text.replace(/\s+/g, " ").trim(),
            anchor: validCustomAnchor(item.anchor) ? item.anchor : "end"
          }));
      }
    } catch { /* 改用舊版單一自訂詞資料 */ }

    const legacyText = localStorage.getItem(CUSTOM_TEXT_KEY);
    return [createCustomWord(legacyText || "", loadLegacyCustomAnchor())];
  }

  function loadPromptOverrides() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROMPT_OVERRIDES_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw).filter(([key, value]) =>
        typeof value === "string" && value.trim() &&
        (key === "hair-color" || key === "eye-color" || key.startsWith("word:") || key.startsWith("gender:"))
      ));
    } catch { return {}; }
  }

  function savePromptEditing() {
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(customWords));
    localStorage.setItem(PROMPT_OVERRIDES_KEY, JSON.stringify(promptOverrides));
  }

  function clearOverride(key) {
    if (!key || !(key in promptOverrides)) return;
    delete promptOverrides[key];
    savePromptEditing();
  }

  function clearOverridesForSlug(slug) {
    delete promptOverrides[`word:${slug}`];
    if (wordIndex[slug]?.catDetail) delete promptOverrides["hair-color"];
    if (wordIndex[slug]?.heterochromia) delete promptOverrides["eye-color"];
  }

  // 性別（"" = 不指定，單選）
  const GENDER_KEY = "niji-gender";
  let selectedGender = localStorage.getItem(GENDER_KEY) || "";
  if (!GENDERS.some(g => g.key === selectedGender)) selectedGender = "";

  function setGender(key) {
    if (selectedGender && selectedGender !== key) delete promptOverrides[`gender:${selectedGender}`];
    selectedGender = key;
    localStorage.setItem(GENDER_KEY, selectedGender);
    savePromptEditing();
    document.documentElement.dataset.gender = selectedGender;
  }
  document.documentElement.dataset.gender = selectedGender;

  // 性別分頁過濾：female→f、male→m，未選性別時全部顯示
  function genderTag() {
    return selectedGender === "female" ? "f" : selectedGender === "male" ? "m" : "";
  }
  // 代名詞佔位符 {poss}：依性別自動填入所有格代名詞（未選性別 → 中性 their）
  const POSSESSIVE = { f: "her", m: "his", "": "their" };
  const resolveEn = en => en.replace(/\{poss\}/g, POSSESSIVE[genderTag()]);
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
    if (hairSecond !== slug) delete promptOverrides["hair-color"];
    hairSecond = slug;
    localStorage.setItem(HAIR_SECOND_KEY, hairSecond);
    savePromptEditing();
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

  /* ===== 異色瞳細節（第一眼色 + 第二眼色） ===== */
  const EYE_FIRST_KEY = "niji-eye-first";
  const EYE_SECOND_KEY = "niji-eye-second";
  const EYE_CAT = PROMPT_DATA.find(c => c.category === "眼睛");
  const HETERO_SLUG = "heterochromia";
  const eyeColorWords = EYE_CAT.words.filter(word => word.eyeColor);
  let eyeFirst = localStorage.getItem(EYE_FIRST_KEY) || "";
  let eyeSecond = localStorage.getItem(EYE_SECOND_KEY) || "";

  function validEyeColor(slug) {
    return eyeColorWords.some(word => word.slug === slug && wordVisible(word));
  }
  if (!validEyeColor(eyeFirst)) eyeFirst = "";
  if (!validEyeColor(eyeSecond) || eyeSecond === eyeFirst) eyeSecond = "";
  if (!selected.includes(HETERO_SLUG)) {
    eyeFirst = "";
    eyeSecond = "";
    localStorage.removeItem(EYE_FIRST_KEY);
    localStorage.removeItem(EYE_SECOND_KEY);
  }

  function setEyeFirst(slug) {
    eyeFirst = validEyeColor(slug) ? slug : "";
    if (!eyeFirst || eyeSecond === eyeFirst) eyeSecond = "";
    delete promptOverrides["eye-color"];
    localStorage.setItem(EYE_FIRST_KEY, eyeFirst);
    localStorage.setItem(EYE_SECOND_KEY, eyeSecond);
    savePromptEditing();
  }
  function setEyeSecond(slug) {
    eyeSecond = validEyeColor(slug) && slug !== eyeFirst ? slug : "";
    delete promptOverrides["eye-color"];
    localStorage.setItem(EYE_SECOND_KEY, eyeSecond);
    savePromptEditing();
  }
  function clearEyeColors() {
    eyeFirst = "";
    eyeSecond = "";
    delete promptOverrides["eye-color"];
    localStorage.removeItem(EYE_FIRST_KEY);
    localStorage.removeItem(EYE_SECOND_KEY);
    savePromptEditing();
  }

  /* ===== 可換色衣物 ===== */
  const CLOTHING_COLOR_KEY = "niji-clothing-colors";
  const CLOTHING_CAT = PROMPT_DATA.find(c => c.category === "服裝");
  const ITEM_CAT = PROMPT_DATA.find(c => c.picker === "item");
  let clothingColors = loadClothingColors();
  let activeClothingSlug = "";

  function loadClothingColors() {
    try {
      const raw = JSON.parse(localStorage.getItem(CLOTHING_COLOR_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw).filter(([slug, color]) =>
        selected.includes(slug) && wordIndex[slug]?.colorable && CLOTHING_COLORS.some(item => item.key === color)
      ));
    } catch { return {}; }
  }

  function saveClothingColors() {
    localStorage.setItem(CLOTHING_COLOR_KEY, JSON.stringify(clothingColors));
  }

  function setClothingColor(slug, colorKey) {
    if (!wordIndex[slug]?.colorable) return;
    if (CLOTHING_COLORS.some(color => color.key === colorKey)) clothingColors[slug] = colorKey;
    else delete clothingColors[slug];
    delete promptOverrides[`word:${slug}`];
    saveClothingColors();
    savePromptEditing();
  }

  function clothingColor(slug) {
    return CLOTHING_COLORS.find(color => color.key === clothingColors[slug]);
  }

  function resolvedWordEn(slug) {
    const word = wordIndex[slug];
    const color = word.colorable ? clothingColor(slug) : null;
    return resolveEn(color ? `${color.en} ${word.en}` : word.en);
  }

  /* ===== 提示詞 / Profile 主頁籤 ===== */
  function buildCategories() {
    const tabs = document.createElement("div");
    tabs.className = "group-tabs";
    [
      { key: "prompt", label: "提示詞" },
      { key: "profile", label: "profile" }
    ].forEach(item => {
      const tab = document.createElement("button");
      tab.className = "group-tab";
      tab.type = "button";
      tab.dataset.workspace = item.key;
      tab.innerHTML = `<span>${item.label}</span><span class="gcount" data-workspace="${item.key}"></span>`;
      tab.addEventListener("click", () => {
        activeWorkspace = item.key;
        ensureActiveCategoryVisible();
        renderMainPanel();
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

    function ensureActiveCategoryVisible() {
      const visibleCats = PROMPT_DATA.filter(cat => !cat.detail && catVisible(cat));
      if (!visibleCats.some(cat => cat.category === activeCategory)) {
        activeCategory = visibleCats[0]?.category || PROMPT_DATA[0].category;
      }
    }

    function buildProfilePanel() {
      panel.classList.add("profile-panel");
      const form = document.createElement("form");
      form.className = "profile-add-form";
      const input = document.createElement("input");
      input.className = "profile-code-input";
      input.type = "text";
      input.placeholder = "輸入 Profile 代碼";
      input.setAttribute("aria-label", "Profile 代碼");
      const add = document.createElement("button");
      add.className = "btn btn-copy profile-add-btn";
      add.type = "submit";
      add.textContent = "➕ 新增";
      form.append(input, add);
      form.addEventListener("submit", e => {
        e.preventDefault();
        const code = normalizeProfileCode(input.value);
        if (!code) { showToast("請輸入 Profile 代碼"); return; }
        if (!profileCodes.includes(code)) profileCodes.push(code);
        selectedProfile = code;
        saveProfiles();
        renderMainPanel();
        render();
      });
      panel.appendChild(form);

      const hint = document.createElement("p");
      hint.className = "profile-hint";
      hint.textContent = profileCodes.length
        ? "點選一組代碼套用；再次點擊可取消"
        : "尚未建立代碼，請先在上方新增";
      panel.appendChild(hint);

      const list = document.createElement("div");
      list.className = "profile-code-list";
      profileCodes.forEach(code => {
        const row = document.createElement("div");
        row.className = "profile-code-row";
        const choose = document.createElement("button");
        choose.className = "profile-code-btn";
        choose.type = "button";
        choose.classList.toggle("active", selectedProfile === code);
        choose.textContent = `--p ${code}`;
        choose.addEventListener("click", () => {
          selectedProfile = selectedProfile === code ? "" : code;
          saveProfiles();
          renderMainPanel();
          render();
        });
        const remove = document.createElement("button");
        remove.className = "profile-delete-btn";
        remove.type = "button";
        remove.title = `刪除 ${code}`;
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          profileCodes = profileCodes.filter(item => item !== code);
          if (selectedProfile === code) selectedProfile = "";
          saveProfiles();
          renderMainPanel();
          render();
        });
        row.append(choose, remove);
        list.appendChild(row);
      });
      panel.appendChild(list);
    }

    renderMainPanel = () => {
      panel.innerHTML = "";
      panel.classList.remove("profile-panel");
      if (activeWorkspace === "profile") {
        buildProfilePanel();
        return;
      }

      const row = document.createElement("div");
      row.className = "gender-row";
      GENDERS.forEach(gd => {
        const button = document.createElement("button");
        button.className = "gender-btn";
        button.type = "button";
        button.dataset.gender = gd.key;
        button.textContent = `${gd.icon} ${gd.zh}`;
        button.title = gd.en;
        button.addEventListener("click", () => {
          setGender(selectedGender === gd.key ? "" : gd.key);
          const removedSlugs = selected.filter(slug => !wordVisible(wordIndex[slug]));
          removedSlugs.forEach(slug => {
            clearOverridesForSlug(slug);
            delete clothingColors[slug];
          });
          selected = selected.filter(slug => wordVisible(wordIndex[slug]));
          saveSelection();
          saveClothingColors();
          savePromptEditing();
          normalizeHairSecond();
          ensureActiveCategoryVisible();
          renderMainPanel();
          render();
          if (removedSlugs.length) showToast(`已移除 ${removedSlugs.length} 個不符性別的詞`);
        });
        row.appendChild(button);
      });
      panel.appendChild(row);

      const tiles = document.createElement("div");
      tiles.className = "group-tiles";
      PROMPT_DATA.filter(cat => !cat.detail && catVisible(cat)).forEach(cat => {
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
    };

    renderMainPanel();
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
    if (activeWorkspace === "profile") {
      optionDrawer.hidden = true;
      return;
    }
    optionDrawer.hidden = false;
    const cat = PROMPT_DATA.find(c => c.category === activeCategory);
    optionDrawer.innerHTML = "";
    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = `${cat.icon} ${cat.category}${cat.single ? "（單選）" : ""}`;
    optionDrawer.appendChild(title);

    if (cat.picker === "item") {
      const chosen = selected.find(slug => wordIndex[slug].category === cat.category);
      const openBtn = document.createElement("button");
      openBtn.className = "hair-color-open";
      openBtn.type = "button";
      openBtn.textContent = chosen
        ? `✋ 手持某個物品（${wordIndex[chosen].zh}）`
        : "✋ 手持某個物品";
      openBtn.addEventListener("click", openItemModal);
      optionDrawer.appendChild(openBtn);
    } else {
      optionDrawer.appendChild(buildWordList(cat.words.filter(wordVisible)));
    }

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

    if (cat.category === "眼睛" && selected.includes(HETERO_SLUG)) {
      const first = eyeFirst ? wordIndex[eyeFirst].zh : "未選第一色";
      const second = eyeSecond ? wordIndex[eyeSecond].zh : "未選第二色";
      const openBtn = document.createElement("button");
      openBtn.className = "hair-color-open";
      openBtn.type = "button";
      openBtn.textContent = `👁 異色瞳細節（${first}／${second}）`;
      openBtn.addEventListener("click", openEyeModal);
      optionDrawer.appendChild(openBtn);
    }

    if (cat.category === "服裝") {
      selected.filter(slug => wordIndex[slug].colorable).forEach(slug => {
        const color = clothingColor(slug);
        const openBtn = document.createElement("button");
        openBtn.className = "hair-color-open";
        openBtn.type = "button";
        openBtn.textContent = `🎨 ${wordIndex[slug].zh}顏色（${color?.zh || "未選色"}）`;
        openBtn.addEventListener("click", () => openClothingModal(slug));
        optionDrawer.appendChild(openBtn);
      });
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

  /* ===== 異色瞳細節彈出視窗 ===== */
  const eyeModalBackdrop = document.createElement("div");
  eyeModalBackdrop.className = "modal-backdrop";
  eyeModalBackdrop.hidden = true;
  document.body.appendChild(eyeModalBackdrop);
  eyeModalBackdrop.addEventListener("click", e => {
    if (e.target === eyeModalBackdrop) closeEyeModal();
  });

  function openEyeModal() {
    eyeModalBackdrop.hidden = false;
    buildEyeModal();
  }
  function closeEyeModal() {
    eyeModalBackdrop.hidden = true;
  }

  function buildEyeColorList(slot) {
    const list = document.createElement("div");
    list.className = "word-list";
    eyeColorWords.filter(wordVisible).forEach(word => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = word.zh;
      btn.title = word.en;
      btn.dataset.eyeSlot = slot;
      btn.dataset.eyeColor = word.slug;
      btn.addEventListener("click", () => {
        if (slot === "first") setEyeFirst(eyeFirst === word.slug ? "" : word.slug);
        else setEyeSecond(eyeSecond === word.slug ? "" : word.slug);
        render();
        updateEyeModal();
      });
      list.appendChild(btn);
    });
    return list;
  }

  function buildEyeModal() {
    eyeModalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal eye-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = "👁 異色瞳細節";
    panel.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "modal-sub eye-modal-status";
    panel.appendChild(sub);

    const firstTitle = document.createElement("p");
    firstTitle.className = "drawer-title";
    firstTitle.textContent = "🎨 第一隻眼睛顏色（單選）";
    panel.appendChild(firstTitle);
    panel.appendChild(buildEyeColorList("first"));

    const secondTitle = document.createElement("p");
    secondTitle.className = "drawer-title";
    secondTitle.textContent = "✨ 第二隻眼睛顏色（單選）";
    panel.appendChild(secondTitle);
    panel.appendChild(buildEyeColorList("second"));

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeEyeModal);
    actions.appendChild(done);
    panel.appendChild(actions);

    eyeModalBackdrop.appendChild(panel);
    updateEyeModal();
  }

  function updateEyeModal() {
    if (eyeModalBackdrop.hidden) return;
    const firstName = eyeFirst ? wordIndex[eyeFirst].zh : "尚未選擇";
    const secondName = eyeSecond ? wordIndex[eyeSecond].zh : "尚未選擇";
    const status = eyeModalBackdrop.querySelector(".eye-modal-status");
    if (status) status.textContent = `目前異色瞳：${firstName}／${secondName}`;
    eyeModalBackdrop.querySelectorAll("[data-eye-slot='first']").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.eyeColor === eyeFirst);
    });
    eyeModalBackdrop.querySelectorAll("[data-eye-slot='second']").forEach(btn => {
      btn.disabled = !eyeFirst || btn.dataset.eyeColor === eyeFirst;
      btn.classList.toggle("active", btn.dataset.eyeColor === eyeSecond);
    });
  }

  /* ===== 手持物品清單彈出視窗 ===== */
  const itemModalBackdrop = document.createElement("div");
  itemModalBackdrop.className = "modal-backdrop";
  itemModalBackdrop.hidden = true;
  document.body.appendChild(itemModalBackdrop);
  itemModalBackdrop.addEventListener("click", e => {
    if (e.target === itemModalBackdrop) closeItemModal();
  });

  function openItemModal() {
    itemModalBackdrop.hidden = false;
    itemModalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal item-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = "✋ 手持某個物品";
    panel.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "modal-sub";
    sub.textContent = "選擇一項物品；重選會自動替換";
    panel.appendChild(sub);

    panel.appendChild(buildWordList(ITEM_CAT.words.filter(wordVisible), slug => {
      toggleWord(slug);
      updateItemModal();
    }));

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeItemModal);
    actions.appendChild(done);
    panel.appendChild(actions);
    itemModalBackdrop.appendChild(panel);
    updateItemModal();
  }

  function updateItemModal() {
    if (itemModalBackdrop.hidden) return;
    itemModalBackdrop.querySelectorAll(".word-btn[data-slug]").forEach(btn => {
      btn.classList.toggle("active", selected.includes(btn.dataset.slug));
    });
  }

  function closeItemModal() {
    itemModalBackdrop.hidden = true;
  }

  /* ===== 衣物顏色彈出視窗 ===== */
  const clothingModalBackdrop = document.createElement("div");
  clothingModalBackdrop.className = "modal-backdrop";
  clothingModalBackdrop.hidden = true;
  document.body.appendChild(clothingModalBackdrop);
  clothingModalBackdrop.addEventListener("click", e => {
    if (e.target === clothingModalBackdrop) closeClothingModal();
  });

  function openClothingModal(slug) {
    if (!wordIndex[slug]?.colorable) return;
    activeClothingSlug = slug;
    clothingModalBackdrop.hidden = false;
    clothingModalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal clothing-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = `🎨 ${wordIndex[slug].zh}顏色`;
    panel.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "modal-sub";
    sub.textContent = "選擇一個顏色，工具會自動放在衣物名稱前方";
    panel.appendChild(sub);

    const list = document.createElement("div");
    list.className = "word-list";
    CLOTHING_COLORS.forEach(color => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = color.zh;
      btn.title = `${color.en} ${wordIndex[slug].en}`;
      btn.dataset.clothingColor = color.key;
      btn.addEventListener("click", () => {
        setClothingColor(slug, color.key);
        render();
        updateClothingModal();
      });
      list.appendChild(btn);
    });
    panel.appendChild(list);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeClothingModal);
    actions.appendChild(done);
    panel.appendChild(actions);
    clothingModalBackdrop.appendChild(panel);
    updateClothingModal();
  }

  function updateClothingModal() {
    if (clothingModalBackdrop.hidden) return;
    const activeColor = clothingColors[activeClothingSlug] || "";
    clothingModalBackdrop.querySelectorAll("[data-clothing-color]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.clothingColor === activeColor);
    });
  }

  function closeClothingModal() {
    clothingModalBackdrop.hidden = true;
    activeClothingSlug = "";
  }

  function renderCategoryState() {
    document.querySelectorAll(".group-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.workspace === activeWorkspace);
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
      const n = badge.dataset.workspace === "profile"
        ? Number(!!selectedProfile)
        : selected.length + Number(!!selectedGender);
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
      clearOverridesForSlug(slug);
      selected.splice(idx, 1);
      if (w.heterochromia) clearEyeColors();
      if (w.colorable) {
        delete clothingColors[slug];
        saveClothingColors();
      }
    } else {
      if (w.heterochromia) {
        selected.filter(s => wordIndex[s].eyeColor).forEach(clearOverridesForSlug);
        selected = selected.filter(s => !wordIndex[s].eyeColor);
      } else if (w.eyeColor) {
        selected.filter(s => wordIndex[s].eyeColor || wordIndex[s].heterochromia).forEach(clearOverridesForSlug);
        selected = selected.filter(s => !wordIndex[s].eyeColor && !wordIndex[s].heterochromia);
        clearEyeColors();
      }
      if (w.catSingle) {
        // 單選分類：換選時自動移除同分類舊詞
        selected.filter(s => wordIndex[s].category === w.category).forEach(clearOverridesForSlug);
        selected = selected.filter(s => wordIndex[s].category !== w.category);
      } else if (w.catDetail) {
        // 髮色：基本色單選、效果也單選（各自替換）
        selected
          .filter(s => wordIndex[s].category === w.category && !wordIndex[s].effect === !w.effect)
          .forEach(clearOverridesForSlug);
        selected = selected.filter(s => !(wordIndex[s].category === w.category && !wordIndex[s].effect === !w.effect));
        delete promptOverrides["hair-color"];
      }
      selected.push(slug);
    }
    saveSelection();
    savePromptEditing();
    normalizeHairSecond();
    render();
    // 只有選中髮型長度時自動彈出髮色細節視窗
    if (idx < 0 && HAIR_MODAL_TRIGGER_CATS.includes(w.category)) openHairModal();
    if (idx < 0 && w.heterochromia) openEyeModal();
    if (idx < 0 && w.colorable) openClothingModal(slug);
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

  function tokenIsModified(token) {
    const value = promptOverrides[token.editKey]?.trim();
    return !!value && value !== token.defaultText;
  }

  function updateCurrentPrompt() {
    const segments = [""];
    currentPromptTokens.forEach(token => {
      if (token.text === ", ") segments.push("");
      else segments[segments.length - 1] += token.text;
    });

    const parts = [];
    const addCustoms = anchor => customWords
      .filter(word => resolveCustomAnchor(word, currentPromptTokens) === anchor)
      .forEach(word => {
        const text = word.text.trim();
        if (text) parts.push(text);
      });

    addCustoms("start");
    segments.forEach((segment, index) => {
      if (segment) parts.push(segment);
      if (index < segments.length - 1) addCustoms(`comma:${index + 1}`);
    });
    addCustoms("end");
    const prompt = parts.join(", ");
    currentPrompt = selectedProfile
      ? `${prompt}${prompt ? " " : ""}--p ${selectedProfile}`
      : prompt;
  }

  function resolveCustomAnchor(word, tokens) {
    if (word.anchor === "start" || word.anchor === "end") return word.anchor;
    const commaCount = tokens.filter(t => t.text === ", ").length;
    const index = Number(word.anchor.slice(6));
    return Number.isInteger(index) && index >= 1 && index <= commaCount ? word.anchor : "end";
  }

  function selectEditableText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function keepPastePlainText(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  }

  function startTokenEdit(span, token) {
    if (span.dataset.editing) return;
    span.dataset.editing = "true";
    span.contentEditable = "plaintext-only";
    span.spellcheck = false;
    span.classList.add("editing");
    span.focus();
    selectEditableText(span);

    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save) {
        const value = span.textContent.replace(/\s+/g, " ").trim();
        if (!value || value === token.defaultText) delete promptOverrides[token.editKey];
        else promptOverrides[token.editKey] = value;
        savePromptEditing();
      }
      render();
    };

    span.addEventListener("paste", keepPastePlainText);
    span.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    span.addEventListener("blur", () => finish(true), { once: true });
  }

  function syncCustomSeparators() {
    promptText.querySelectorAll(".custom-auto-separator").forEach(separator => {
      const anchor = separator.dataset.anchor;
      const group = customWords.filter(word => resolveCustomAnchor(word, currentPromptTokens) === anchor);
      const index = Number(separator.dataset.index);
      if (separator.dataset.kind === "before") {
        const currentHasText = !!group[index]?.text.trim();
        const earlierHasText = separator.dataset.baseBefore === "true" ||
          group.slice(0, index).some(word => word.text.trim());
        separator.hidden = !(currentHasText && earlierHasText);
      } else {
        separator.hidden = !group.some(word => word.text.trim());
      }
    });
  }

  function applyCustomAnchor(customId, anchor) {
    const word = customWords.find(item => item.id === customId);
    if (!word) return;
    word.anchor = anchor;
    activeCustomId = customId;
    savePromptEditing();
    render();
  }

  function startCustomDrag(handle, customId, e) {
    if (e.button != null && e.button !== 0) return;
    let dragging = false;
    let activeZone = null;
    let lastX = e.clientX, lastY = e.clientY;

    const findZone = () => {
      const zone = document.elementFromPoint(lastX, lastY)?.closest(".custom-drop-zone");
      if (activeZone !== zone) {
        activeZone?.classList.remove("drop-active");
        activeZone = zone;
        activeZone?.classList.add("drop-active");
      }
    };
    const timer = setTimeout(() => {
      dragging = true;
      activeCustomId = customId;
      promptText.classList.add("custom-dragging");
      handle.closest(".pw-custom-wrap")?.classList.add("dragging");
      findZone();
    }, 260);
    const move = ev => {
      lastX = ev.clientX; lastY = ev.clientY;
      if (dragging) { ev.preventDefault(); findZone(); }
    };
    const finish = ev => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      promptText.classList.remove("custom-dragging");
      handle.closest(".pw-custom-wrap")?.classList.remove("dragging");
      activeZone?.classList.remove("drop-active");
      if (dragging && activeZone) applyCustomAnchor(customId, activeZone.dataset.anchor);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  function buildCustomPromptBox(word) {
    const wrap = document.createElement("span");
    wrap.className = "pw-custom-wrap";
    wrap.title = "按住拖曳把手，可移到任意逗號後方";

    const handle = document.createElement("span");
    handle.className = "custom-drag-handle";
    handle.textContent = "⠿";
    handle.title = "按住拖曳自訂提示詞";
    handle.setAttribute("aria-label", "拖曳自訂提示詞");
    handle.addEventListener("pointerdown", e => {
      e.preventDefault();
      startCustomDrag(handle, word.id, e);
    });
    wrap.appendChild(handle);

    const span = document.createElement("span");
    span.className = "pw-custom";
    span.contentEditable = "plaintext-only";
    span.spellcheck = false;
    span.dataset.placeholder = "輸入自訂提示詞…";
    span.setAttribute("role", "textbox");
    span.setAttribute("aria-label", "自訂提示詞");
    span.dataset.customId = word.id;
    span.textContent = word.text;
    span.addEventListener("focus", () => {
      activeCustomId = word.id;
    });
    span.addEventListener("paste", keepPastePlainText);
    span.addEventListener("input", () => {
      word.text = span.textContent.replace(/\s+/g, " ").trimStart();
      savePromptEditing();
      syncCustomSeparators();
      updateCustomChip(word);
      emptyHint.style.display = (selected.length || selectedGender || hasCustomText() || selectedProfile) ? "none" : "";
      updateCurrentPrompt();
    });
    span.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); span.blur(); }
    });
    span.addEventListener("blur", () => {
      word.text = span.textContent.replace(/\s+/g, " ").trim();
      span.textContent = word.text;
      savePromptEditing();
      updateCustomChip(word);
      syncCustomSeparators();
      updateCurrentPrompt();
    });
    wrap.appendChild(span);
    wrap.addEventListener("pointerdown", e => {
      if (e.target !== handle) startCustomDrag(handle, word.id, e);
    });
    return wrap;
  }

  function buildDropZone(anchor, label) {
    const zone = document.createElement("span");
    zone.className = "custom-drop-zone";
    zone.dataset.anchor = anchor;
    zone.title = label;
    zone.setAttribute("aria-hidden", "true");
    return zone;
  }

  function buildAutoSeparator(anchor, kind, index = 0, baseBefore = false) {
    const separator = document.createElement("span");
    separator.className = "custom-auto-separator";
    separator.textContent = ", ";
    separator.dataset.anchor = anchor;
    separator.dataset.kind = kind;
    separator.dataset.index = String(index);
    separator.dataset.baseBefore = String(baseBefore);
    return separator;
  }

  function hasCustomText() {
    return customWords.some(word => word.text.trim());
  }

  function updateCustomChip(word) {
    const chip = chipsEl.querySelector(`.chip-custom[data-custom-id="${word.id}"]`);
    if (!word.text.trim()) {
      chip?.remove();
      return;
    }
    if (chip) {
      chip.querySelector(".custom-chip-label").textContent = word.text.trim();
      chip.title = `${word.text.trim()}｜點擊移除`;
      return;
    }
    appendCustomChip(word);
  }

  function appendCustomChip(word) {
    if (!word.text.trim()) return;
    const chip = document.createElement("button");
    chip.className = "chip chip-custom";
    chip.type = "button";
    chip.dataset.customId = word.id;
    chip.title = `${word.text.trim()}｜點擊移除`;

    const label = document.createElement("span");
    label.className = "custom-chip-label";
    label.textContent = word.text.trim();
    chip.appendChild(label);

    const remove = document.createElement("span");
    remove.className = "x";
    remove.textContent = "×";
    chip.append(" ", remove);
    chip.addEventListener("click", () => removeCustomWord(word.id));
    chipsEl.appendChild(chip);
  }

  function focusCustomWord(customId) {
    requestAnimationFrame(() => {
      const input = promptText.querySelector(`.pw-custom[data-custom-id="${customId}"]`);
      if (!input) return;
      input.focus();
      selectEditableText(input);
      pendingCustomFocusId = "";
    });
  }

  function addCustomWord() {
    const empty = customWords.find(word => !word.text.trim());
    const word = empty || createCustomWord("", "end");
    if (!empty) customWords.push(word);
    activeCustomId = word.id;
    pendingCustomFocusId = word.id;
    savePromptEditing();
    render();
  }

  function removeCustomWord(customId) {
    customWords = customWords.filter(word => word.id !== customId);
    if (activeCustomId === customId) activeCustomId = customWords.at(-1)?.id || "";
    savePromptEditing();
    render();
    showToast("已移除自訂詞");
  }

  function appendCustomGroup(anchor, baseBefore, baseAfter) {
    const group = customWords.filter(word => resolveCustomAnchor(word, currentPromptTokens) === anchor);
    group.forEach((word, index) => {
      promptText.appendChild(buildAutoSeparator(anchor, "before", index, baseBefore));
      promptText.appendChild(buildCustomPromptBox(word));
    });
    if (baseAfter && group.length) promptText.appendChild(buildAutoSeparator(anchor, "after"));
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
    const tokens = buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender);
    const modifiedSlugs = new Set();
    let genderModified = false;
    tokens.filter(tokenIsModified).forEach(token => {
      (token.sourceSlugs || []).forEach(slug => modifiedSlugs.add(slug));
      if (token.sourceGender) genderModified = true;
    });

    chipsEl.querySelectorAll(".chip").forEach(c => c.remove());
    emptyHint.style.display = (selected.length || gender || hasCustomText() || selectedProfile) ? "none" : "";

    const addWordChip = slug => {
      const w = wordIndex[slug];
      const editMark = modifiedSlugs.has(slug) ? '<span class="edit-mark" aria-label="已修改">✏️</span>' : "";
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      const color = clothingColor(slug);
      const label = color ? `${color.zh}${w.zh}` : w.zh;
      chip.title = `${w.category}｜點擊移除`;
      chip.style.setProperty("--hue", w.hue);
      chip.innerHTML = `${editMark}${label} <span class="x">×</span>`;
      chip.addEventListener("click", () => toggleWord(slug));
      chipsEl.appendChild(chip);
    };
    bigSlugs.forEach(addWordChip);
    if (gender) {
      const chip = document.createElement("button");
      chip.className = "chip chip-gender";
      chip.type = "button";
      chip.title = "性別｜點擊移除";
      chip.innerHTML = `${genderModified ? '<span class="edit-mark" aria-label="已修改">✏️</span>' : ""}${gender.icon} ${gender.zh} <span class="x">×</span>`;
      chip.addEventListener("click", () => { setGender(""); render(); });
      chipsEl.appendChild(chip);
    }
    charSlugs.forEach(addWordChip);
    if (selected.includes(HETERO_SLUG)) {
      [eyeFirst, eyeSecond].forEach((slug, index) => {
        if (!slug) return;
        const w = wordIndex[slug];
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        chip.title = `異色瞳第 ${index + 1} 色｜點擊移除`;
        chip.style.setProperty("--hue", EYE_CAT.hue);
        chip.innerHTML = `${modifiedSlugs.has(slug) ? '<span class="edit-mark" aria-label="已修改">✏️</span>' : ""}眼睛${index + 1}·${w.zh} <span class="x">×</span>`;
        chip.addEventListener("click", () => {
          if (index === 0) setEyeFirst("");
          else setEyeSecond("");
          render();
        });
        chipsEl.appendChild(chip);
      });
    }
    // 第二色 chip（點擊移除）
    if (hairSecond) {
      const w = wordIndex[hairSecond];
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.title = "髮色第二色｜點擊移除";
      chip.style.setProperty("--hue", HAIR_COLOR_CAT.hue);
      chip.innerHTML = `${modifiedSlugs.has(hairSecond) ? '<span class="edit-mark" aria-label="已修改">✏️</span>' : ""}第二色·${w.zh} <span class="x">×</span>`;
      chip.addEventListener("click", () => { setHairSecond(""); render(); });
      chipsEl.appendChild(chip);
    }
    tailSlugs.forEach(addWordChip);
    customWords.forEach(appendCustomChip);
    if (selectedProfile) {
      const chip = document.createElement("button");
      chip.className = "chip chip-profile";
      chip.type = "button";
      chip.title = "Profile｜點擊取消套用";
      const label = document.createElement("span");
      label.textContent = `profile · ${selectedProfile}`;
      const remove = document.createElement("span");
      remove.className = "x";
      remove.textContent = "×";
      chip.append(label, " ", remove);
      chip.addEventListener("click", () => {
        selectedProfile = "";
        saveProfiles();
        renderMainPanel();
        render();
      });
      chipsEl.appendChild(chip);
    }

    // 提示詞字串（複製用純文字 + 預覽用分色顯示）
    currentPromptTokens = tokens;
    currentBasePrompt = tokens.map(t => t.text).join("");
    updateCurrentPrompt();
    promptText.innerHTML = "";
    const appendToken = t => {
      if (t.hue != null || t.isGender) {
        const span = document.createElement("span");
        span.className = t.isGender ? "pw pw-gender" : "pw";
        if (t.hue != null) span.style.setProperty("--hue", t.hue);
        span.textContent = t.text;
        span.title = "點擊修改這個提示詞";
        span.tabIndex = 0;
        span.addEventListener("click", () => startTokenEdit(span, t));
        span.addEventListener("keydown", e => {
          if ((e.key === "Enter" || e.key === " ") && !span.dataset.editing) {
            e.preventDefault();
            startTokenEdit(span, t);
          }
        });
        promptText.appendChild(span);
      } else {
        promptText.appendChild(document.createTextNode(t.text));
      }
    };

    promptText.appendChild(buildDropZone("start", "移到提示詞最前方"));
    appendCustomGroup("start", false, !!tokens.length);

    let commaIndex = 0;
    tokens.forEach((token, index) => {
      appendToken(token);
      if (token.text !== ", ") return;
      commaIndex += 1;
      const commaAnchor = `comma:${commaIndex}`;
      promptText.appendChild(buildDropZone(commaAnchor, `移到第 ${commaIndex} 個逗號後方`));
      appendCustomGroup(commaAnchor, false, index < tokens.length - 1);
    });

    appendCustomGroup("end", !!tokens.length, false);
    promptText.appendChild(buildDropZone("end", "移到提示詞最後方"));
    if (selectedProfile) {
      if (tokens.length || hasCustomText()) promptText.appendChild(document.createTextNode(" "));
      const profile = document.createElement("span");
      profile.className = "pw-profile";
      profile.textContent = `--p ${selectedProfile}`;
      profile.title = "已套用的 Profile 代碼";
      promptText.appendChild(profile);
    }

    syncCustomSeparators();
    if (pendingCustomFocusId) focusCustomWord(pendingCustomFocusId);

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
  function editableToken(defaultText, editKey, props = {}) {
    const override = promptOverrides[editKey]?.trim();
    return { ...props, defaultText, editKey, text: override || defaultText };
  }

  // 髮色組字：基本色 + 效果（+ 第二色）依模板合成一句；條件不足時退回逗號並列
  function hairColorParts() {
    const base = selectedHairBase(), fx = selectedHairFx();
    const hue = HAIR_COLOR_CAT.hue;
    const colorName = slug => wordIndex[slug].en.replace(/ hair$/, "");
    if (fx) {
      const fw = wordIndex[fx];
      if (fw.two && fw.tpl && base && hairSecond) {
        const text = fw.tpl.replace("{a}", colorName(base)).replace("{b}", colorName(hairSecond));
        return [editableToken(text, "hair-color", { hue, sourceSlugs: [base, fx, hairSecond] })];
      }
      if (!fw.two && fw.tpl && base) {
        const text = fw.tpl.replace("{a}", colorName(base));
        return [editableToken(text, "hair-color", { hue, sourceSlugs: [base, fx] })];
      }
      const parts = [];
      if (base) parts.push(editableToken(resolveEn(wordIndex[base].en), `word:${base}`, { hue, sourceSlugs: [base] }));
      parts.push(editableToken(resolveEn(fw.en), `word:${fx}`, { hue, sourceSlugs: [fx] }));
      return parts;
    }
    return base ? [editableToken(resolveEn(wordIndex[base].en), `word:${base}`, { hue, sourceSlugs: [base] })] : [];
  }

  function heterochromiaPart() {
    const sourceSlugs = [HETERO_SLUG];
    let text = wordIndex[HETERO_SLUG].en;
    if (eyeFirst) {
      text += `, one eye ${wordIndex[eyeFirst].eyeColor}`;
      sourceSlugs.push(eyeFirst);
    }
    if (eyeFirst && eyeSecond) {
      text += `, one eye ${wordIndex[eyeSecond].eyeColor}`;
      sourceSlugs.push(eyeSecond);
    }
    return editableToken(text, "eye-color", {
      hue: EYE_CAT.hue,
      sourceSlugs
    });
  }

  function buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender) {
    const tokens = []; // { text, hue?, isGender? }
    const word = slug => tokens.push(slug === HETERO_SLUG
      ? heterochromiaPart()
      : editableToken(resolvedWordEn(slug), `word:${slug}`, {
        hue: wordIndex[slug].hue,
        sourceSlugs: [slug]
      }));
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
      tokens.push(editableToken(gender.en, `gender:${gender.key}`, { isGender: true, sourceGender: gender.key }));

      const HAIR_CATS = ["髮型長度", "髮質捲度", "瀏海", "髮型造型", "髮色", "臉部毛髮", "髮飾"];
      const parts = [];
      HAIR_CATS.forEach(c => {
        if (c === "髮色") parts.push(...hairColorParts());
        else byCat(c).forEach(s => parts.push({ text: resolveEn(wordIndex[s].en), hue: wordIndex[s].hue }));
      });
      byCat("眼睛").forEach(s => {
        if (s === HETERO_SLUG) parts.push(heterochromiaPart());
        else parts.push(editableToken(resolveEn(wordIndex[s].en), `word:${s}`, {
          hue: wordIndex[s].hue,
          sourceSlugs: [s]
        }));
      });
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
    const keyword = normalizeImageText(resolveEn(wordIndex[slug].en));
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
        src, zh: wordIndex[slug].zh, en: resolveEn(wordIndex[slug].en), slug
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
  document.getElementById("addCustomBtn").addEventListener("click", addCustomWord);

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
    if (!selected.length && !selectedGender && !hairSecond && !customWords.length && !selectedProfile && !Object.keys(promptOverrides).length) return;
    selected = [];
    promptOverrides = {};
    customWords = [];
    activeCustomId = "";
    clothingColors = {};
    saveClothingColors();
    selectedProfile = "";
    saveProfiles();
    clearEyeColors();
    setGender("");
    setHairSecond("");
    saveSelection();
    savePromptEditing();
    renderMainPanel();
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
