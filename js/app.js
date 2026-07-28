/* Niji 提示詞配搭工具 */
(function () {
  const STORAGE_KEY = "niji-selected-words";
  const CUSTOM_TEXT_KEY = "niji-custom-prompt";
  const CUSTOM_POSITION_KEY = "niji-custom-position";
  const CUSTOM_WORDS_KEY = "niji-custom-words";
  const WORD_LIBRARY_KEY = "niji-word-library";       // 自填詞記憶庫詞條
  const LIBRARY_CATS_KEY = "niji-word-library-cats";  // 記憶庫自訂分類
  const PERSONA_LIBRARY_KEY = "niji-persona-library"; // 人設庫（角色設定的存檔）
  const PROMPT_OVERRIDES_KEY = "niji-prompt-overrides";
  const WORD_ORDER_KEY = "niji-word-order"; // 畫面設定/背景裝飾預設詞的手動排序
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

  const groupOfSlug = slug => PROMPT_DATA[wordIndex[slug].catIdx].group;
  // 可手動拖曳排序的群組（純逗號並列，不影響人物自然語句）
  const REORDER_GROUPS = ["畫面設定", "背景裝飾"];

  function loadWordOrder() {
    try {
      const raw = JSON.parse(localStorage.getItem(WORD_ORDER_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(s => typeof s === "string" && wordIndex[s]) : [];
    } catch { return []; }
  }
  function saveWordOrder() {
    localStorage.setItem(WORD_ORDER_KEY, JSON.stringify(manualWordOrder));
  }
  // 依「手動排序優先，其次 niji 預設順序」排一個群組內的已選詞
  function sortGroupSlugs(slugs) {
    return [...slugs].sort((a, b) => {
      const ia = manualWordOrder.indexOf(a);
      const ib = manualWordOrder.indexOf(b);
      const ra = ia < 0 ? Infinity : ia;
      const rb = ib < 0 ? Infinity : ib;
      if (ra !== rb) return ra - rb;
      return (wordIndex[a].catIdx - wordIndex[b].catIdx) || (wordIndex[a].wIdx - wordIndex[b].wIdx);
    });
  }
  // 把某群組的預設詞移到新位置（targetIndex = 插入到群組第幾個之前）
  function reorderPresetWord(slug, group, targetIndex) {
    const source = group === "畫面設定" ? currentBigSlugs : currentTailSlugs;
    const list = [...source];
    const from = list.indexOf(slug);
    if (from < 0) return;
    list.splice(from, 1);
    let ins = from < targetIndex ? targetIndex - 1 : targetIndex;
    ins = Math.max(0, Math.min(ins, list.length));
    list.splice(ins, 0, slug);
    // 重寫手動排序：移除本群組舊有 slug，再依新順序寫入
    const groupSet = new Set(source);
    manualWordOrder = manualWordOrder.filter(s => !groupSet.has(s));
    manualWordOrder.push(...list);
    saveWordOrder();
    render();
  }

  // 已選詞（依點選順序）
  let selected = loadSelection();
  let activeCategory = PROMPT_DATA[0].category;
  let activeWorkspace = "prompt";
  let renderMainPanel = () => {};
  let currentPrompt = ""; // 複製用的純文字提示詞
  let currentBasePrompt = "";
  let currentPromptTokens = [];
  let manualWordOrder = loadWordOrder();
  let currentBigSlugs = [];  // 目前畫面設定群組的顯示順序（拖曳排序用）
  let currentTailSlugs = []; // 目前背景裝飾群組的顯示順序
  let customWords = loadCustomWords();
  let activeCustomId = customWords[0]?.id || "";
  let pendingCustomFocusId = "";
  let promptOverrides = loadPromptOverrides();
  // 自填詞記憶庫（持久化，獨立於工作區的 customWords）
  let wordLibrary = loadWordLibrary();
  let libraryCats = loadLibraryCats();
  let librarySearchQuery = ""; // modal 內搜尋字串（僅記憶體）
  let libraryActiveCat = "all"; // "all" | "fav" | "" (未分類) | 分類id

  const PROFILE_CODES_KEY = "niji-profile-codes";
  const SELECTED_PROFILE_KEY = "niji-selected-profile";
  const SELECTED_PROFILES_KEY = "niji-selected-profiles";
  const FAVORITE_PROFILES_KEY = "niji-favorite-profiles";
  const PINNED_PROFILES_KEY = "niji-pinned-profiles";
  const PROFILE_ALIASES_KEY = "niji-profile-aliases";
  const PROFILE_VERSIONS_KEY = "niji-profile-versions";
  const NIJI_VERSION_KEY = "niji-version";
  const DEFAULTS_NIJI7 = Array.isArray(typeof DEFAULT_PROFILE_CODES !== "undefined" ? DEFAULT_PROFILE_CODES : null)
    ? DEFAULT_PROFILE_CODES : [];
  const DEFAULTS_NIJI6 = Array.isArray(typeof DEFAULT_PROFILE_CODES_NIJI6 !== "undefined" ? DEFAULT_PROFILE_CODES_NIJI6 : null)
    ? DEFAULT_PROFILE_CODES_NIJI6 : [];
  const DEFAULTS = [...DEFAULTS_NIJI7, ...DEFAULTS_NIJI6];
  const isDefaultCode = c => DEFAULTS.includes(c);
  let profileCodes = loadProfileCodes();
  const isKnownCode = c => isDefaultCode(c) || profileCodes.includes(c);
  let selectedProfiles = loadSelectedProfiles();
  let selectedNiji = loadNiji(); // "" | "6" | "7"
  let profileVersions = loadVersionMap(); // { code: "6" | "7" }（僅自訂代碼；預設代碼由清單歸屬決定）
  // 代碼的 niji 版本：預設代碼看歸屬清單；自訂代碼查 profileVersions，未知一律視為 "7"（既有代碼皆 niji7）
  const codeNijiVersion = code => {
    if (DEFAULTS_NIJI6.includes(code)) return "6";
    if (DEFAULTS_NIJI7.includes(code)) return "7";
    return profileVersions[code] === "6" ? "6" : "7";
  };
  // 在目前選擇的 niji 模式下，此代碼是否可用（niji 6 只能用 niji6 代碼；niji 7 或未選皆可用）
  const codeUsableNow = code => selectedNiji !== "6" || codeNijiVersion(code) === "6";
  let favoriteProfiles = loadArrayKey(FAVORITE_PROFILES_KEY);
  let pinnedProfiles = loadArrayKey(PINNED_PROFILES_KEY);
  let profileAliases = loadAliasMap(); // { code: 自訂顯示名稱 }
  // 內建預設顯示名稱（來自 profile-defaults.js）；使用者自訂別名優先，其次才用預設
  const DEFAULT_ALIASES = (typeof DEFAULT_PROFILE_ALIASES === "object" && DEFAULT_PROFILE_ALIASES) ? DEFAULT_PROFILE_ALIASES : {};
  const aliasOf = code => profileAliases[code] || DEFAULT_ALIASES[code] || "";
  // Profile 篩選/搜尋（僅存於記憶體，不持久化）
  let profileSearchOpen = false;
  let profileSearchQuery = "";
  let profileFavFilter = false;
  const PROFILE_LIST_VISIBLE = 5; // 清單最多顯示幾列，其餘捲動

  function normalizeProfileCode(value) {
    return value.replace(/^\s*--(?:profile|p)\s+/i, "").replace(/\s+/g, " ").trim();
  }

  // 移除字串中任何位置的 --profile / --p 旗標，再以空白拆成多組乾淨代碼
  function parseProfileInput(value) {
    return String(value)
      .replace(/--(?:profile|p)\b/gi, " ")
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function loadArrayKey(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw.filter(c => typeof c === "string") : [];
    } catch { return []; }
  }

  function loadAliasMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_ALIASES_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const map = {};
      Object.keys(raw).forEach(code => {
        if (typeof raw[code] === "string" && raw[code].trim()) map[code] = raw[code];
      });
      return map;
    } catch { return {}; }
  }

  function loadProfileCodes() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_CODES_KEY) || "[]");
      return Array.isArray(raw)
        ? [...new Set(raw.filter(code => typeof code === "string").flatMap(parseProfileInput))]
            .filter(code => !isDefaultCode(code))
        : [];
    } catch { return []; }
  }

  function loadSelectedProfiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(SELECTED_PROFILES_KEY) || "null");
      if (Array.isArray(raw)) return raw.filter(isKnownCode);
    } catch { /* fall through to legacy migration */ }
    const legacy = localStorage.getItem(SELECTED_PROFILE_KEY) || "";
    return isKnownCode(legacy) ? [legacy] : [];
  }

  function loadVersionMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_VERSIONS_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const map = {};
      Object.keys(raw).forEach(code => {
        if (raw[code] === "6" || raw[code] === "7") map[code] = raw[code];
      });
      return map;
    } catch { return {}; }
  }

  function loadNiji() {
    const v = localStorage.getItem(NIJI_VERSION_KEY) || "";
    return v === "6" || v === "7" ? v : "";
  }

  function saveNiji() {
    localStorage.setItem(NIJI_VERSION_KEY, selectedNiji);
  }

  function saveProfiles() {
    localStorage.setItem(PROFILE_CODES_KEY, JSON.stringify(profileCodes));
    localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify(selectedProfiles));
    localStorage.setItem(FAVORITE_PROFILES_KEY, JSON.stringify(favoriteProfiles));
    localStorage.setItem(PINNED_PROFILES_KEY, JSON.stringify(pinnedProfiles));
    localStorage.setItem(PROFILE_ALIASES_KEY, JSON.stringify(profileAliases));
    localStorage.setItem(PROFILE_VERSIONS_KEY, JSON.stringify(profileVersions));
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
          }))
          .filter(item => item.text); // 丟掉空白詞，避免載入時殘留空輸入框
      }
    } catch { /* 改用舊版單一自訂詞資料 */ }

    // 只有真的有舊版自訂文字才 migrate；否則從 0 個開始（靠 ➕ 新增）
    const legacyText = (localStorage.getItem(CUSTOM_TEXT_KEY) || "").replace(/\s+/g, " ").trim();
    return legacyText ? [createCustomWord(legacyText, loadLegacyCustomAnchor())] : [];
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

  function loadWordLibrary() {
    try {
      const raw = JSON.parse(localStorage.getItem(WORD_LIBRARY_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(item => item && typeof item.id === "string" && typeof item.text === "string")
        .map(item => ({
          id: item.id,
          text: item.text.replace(/\s+/g, " ").trim(),
          alias: typeof item.alias === "string" ? item.alias : "",
          cat: typeof item.cat === "string" ? item.cat : "",
          fav: !!item.fav,
          pin: !!item.pin,
          ts: typeof item.ts === "number" ? item.ts : 0
        }))
        .filter(item => item.text);
    } catch { return []; }
  }

  function loadLibraryCats() {
    try {
      const raw = JSON.parse(localStorage.getItem(LIBRARY_CATS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(cat => cat && typeof cat.id === "string" && typeof cat.name === "string" && cat.name.trim())
        .map(cat => ({ id: cat.id, name: cat.name.trim() }));
    } catch { return []; }
  }

  function saveLibrary() {
    localStorage.setItem(WORD_LIBRARY_KEY, JSON.stringify(wordLibrary));
    localStorage.setItem(LIBRARY_CATS_KEY, JSON.stringify(libraryCats));
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
  // 沒有第一色時第二色無意義，一併清掉，避免出現「眼睛2」孤兒膠囊
  if (!validEyeColor(eyeSecond) || !eyeFirst || eyeSecond === eyeFirst) eyeSecond = "";
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
  const ANIMAL_EARS_CAT = PROMPT_DATA.find(c => c.picker === "animalEars");
  let clothingColors = loadClothingColors();
  let activeClothingSlug = "";
  let openClothingSub = "top"; // 服裝抽屜手風琴：目前展開的小組 key（"" = 全收合）

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

  /* ===== 人設庫（只存指定的外觀分類） ===== */
  // 人設只納入這些分類（＋性別另外處理）：髮型各類、髮色、眼睛、動物耳朵。
  // 其餘（臉部五官、氣質特質、表情、動作姿勢、隨身道具、服裝、配件）不存、套用時保留。
  const PERSONA_CATS = [
    "髮型長度", "髮質捲度", "瀏海", "髮型造型", "髮飾", "臉部毛髮",
    "髮色", "眼睛", "動物耳朵"
  ];
  function isCharSlug(slug) {
    const w = wordIndex[slug];
    return !!w && PERSONA_CATS.includes(w.category);
  }

  function loadPersonaLibrary() {
    try {
      const raw = JSON.parse(localStorage.getItem(PERSONA_LIBRARY_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      const validColorBase = s => s && wordIndex[s] && wordIndex[s].catDetail && !wordIndex[s].effect;
      const validEye = s => eyeColorWords.some(w => w.slug === s);
      return raw
        .filter(p => p && typeof p.id === "string" && typeof p.name === "string")
        .map(p => {
          const slugs = Array.isArray(p.slugs) ? p.slugs.filter(isCharSlug) : [];
          const clothingColors = {};
          if (p.clothingColors && typeof p.clothingColors === "object") {
            Object.entries(p.clothingColors).forEach(([slug, color]) => {
              if (slugs.includes(slug) && wordIndex[slug]?.colorable && CLOTHING_COLORS.some(c => c.key === color)) clothingColors[slug] = color;
            });
          }
          const overrides = {};
          if (p.overrides && typeof p.overrides === "object") {
            Object.entries(p.overrides).forEach(([key, val]) => {
              if (typeof val === "string" && val.trim() &&
                (key === "hair-color" || key === "eye-color" || key.startsWith("gender:") ||
                  (key.startsWith("word:") && slugs.includes(key.slice(5))))) overrides[key] = val;
            });
          }
          const hasHetero = slugs.includes(HETERO_SLUG);
          return {
            id: p.id,
            name: p.name.trim() || "未命名人設",
            gender: GENDERS.some(g => g.key === p.gender) ? p.gender : "",
            slugs,
            hairSecond: validColorBase(p.hairSecond) ? p.hairSecond : "",
            eyeFirst: hasHetero && validEye(p.eyeFirst) ? p.eyeFirst : "",
            eyeSecond: hasHetero && validEye(p.eyeSecond) ? p.eyeSecond : "",
            clothingColors,
            overrides,
            ts: typeof p.ts === "number" ? p.ts : 0
          };
        });
    } catch { return []; }
  }

  function savePersonaLibrary() {
    localStorage.setItem(PERSONA_LIBRARY_KEY, JSON.stringify(personaLibrary));
  }

  // 擷取目前的角色設定為一筆人設（性別＋角色群組詞＋髮色/異色瞳/衣物顏色＋相關覆寫）
  function captureCurrentPersona(name) {
    const slugs = selected.filter(isCharSlug);
    if (!slugs.length && !selectedGender) { showToast("目前沒有角色設定可存"); return null; }
    const cc = {};
    slugs.forEach(s => { if (wordIndex[s].colorable && clothingColors[s]) cc[s] = clothingColors[s]; });
    const ov = {};
    Object.entries(promptOverrides).forEach(([key, val]) => {
      if (key === "hair-color" || key === "eye-color" ||
        (selectedGender && key === `gender:${selectedGender}`) ||
        (key.startsWith("word:") && slugs.includes(key.slice(5)))) ov[key] = val;
    });
    const persona = {
      id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || "").trim() || `人設 ${personaLibrary.length + 1}`,
      gender: selectedGender,
      slugs,
      hairSecond, // 直接存目前第二色，load/normalize 會驗證
      eyeFirst: selected.includes(HETERO_SLUG) ? eyeFirst : "",
      eyeSecond: selected.includes(HETERO_SLUG) ? eyeSecond : "",
      clothingColors: cc,
      overrides: ov,
      ts: Date.now()
    };
    personaLibrary.push(persona);
    savePersonaLibrary();
    return persona;
  }

  // 套用人設：只換角色（清掉目前角色群組詞＋性別＋角色細節），保留畫面/背景/自訂詞/profile/niji
  function applyPersona(persona) {
    const removed = selected.filter(isCharSlug);
    removed.forEach(s => { clearOverridesForSlug(s); delete clothingColors[s]; });
    selected = selected.filter(s => !isCharSlug(s));
    clearEyeColors();
    setHairSecond("");
    setGender("");

    setGender(persona.gender);
    persona.slugs.forEach(s => { if (wordIndex[s] && !selected.includes(s)) selected.push(s); });
    Object.entries(persona.clothingColors).forEach(([s, c]) => {
      if (selected.includes(s) && wordIndex[s]?.colorable) clothingColors[s] = c;
    });
    const hasHetero = selected.includes(HETERO_SLUG);
    hairSecond = persona.hairSecond || "";
    localStorage.setItem(HAIR_SECOND_KEY, hairSecond);
    eyeFirst = hasHetero ? (persona.eyeFirst || "") : "";
    eyeSecond = hasHetero ? (persona.eyeSecond || "") : "";
    localStorage.setItem(EYE_FIRST_KEY, eyeFirst);
    localStorage.setItem(EYE_SECOND_KEY, eyeSecond);
    Object.assign(promptOverrides, persona.overrides); // 在 setGender 之後併入，避免被清掉

    saveSelection();
    saveClothingColors();
    savePromptEditing();
    normalizeHairSecond();
    renderMainPanel();
    render();
    showToast(`已套用「${persona.name}」`);
  }

  let personaLibrary = loadPersonaLibrary();

  /* ===== 提示詞 / Profile 主頁籤 ===== */
  function buildCategories() {
    const tabs = document.createElement("div");
    tabs.className = "group-tabs";
    [
      { key: "prompt", label: "提示詞" },
      { key: "profile", label: "profile" },
      { key: "persona", label: "人設庫" }
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
      // 新增代碼的 niji 版本（預設跟隨目前選的 niji 模式，未選則預設 7）
      let addVersion = selectedNiji || "7";
      const verToggle = document.createElement("div");
      verToggle.className = "profile-add-version";
      verToggle.setAttribute("role", "group");
      verToggle.setAttribute("aria-label", "新增代碼的 niji 版本");
      ["6", "7"].forEach(ver => {
        const vbtn = document.createElement("button");
        vbtn.className = "profile-add-version-btn";
        vbtn.type = "button";
        vbtn.textContent = `n${ver}`;
        vbtn.title = `新增為 niji ${ver} 代碼`;
        vbtn.classList.toggle("active", addVersion === ver);
        vbtn.addEventListener("click", () => {
          addVersion = ver;
          verToggle.querySelectorAll(".profile-add-version-btn").forEach(b =>
            b.classList.toggle("active", b === vbtn));
        });
        verToggle.appendChild(vbtn);
      });
      const add = document.createElement("button");
      add.className = "btn btn-copy profile-add-btn";
      add.type = "submit";
      add.textContent = "➕ 新增";
      form.append(input, verToggle, add);
      form.addEventListener("submit", e => {
        e.preventDefault();
        const codes = parseProfileInput(input.value);
        if (!codes.length) { showToast("請輸入 Profile 代碼"); return; }
        codes.forEach(code => {
          if (!isDefaultCode(code)) {
            if (!profileCodes.includes(code)) profileCodes.push(code);
            profileVersions[code] = addVersion; // 記住此自訂代碼的版本
          }
          // 只在目前 niji 模式下可用時才自動套用，避免 niji7 代碼混進 niji6 模式
          if (codeUsableNow(code) && !selectedProfiles.includes(code)) selectedProfiles.push(code);
        });
        saveProfiles();
        renderMainPanel();
        render();
      });
      panel.appendChild(form);

      // Niji 版本切換：--niji 6 / --niji 7（互斥，再點一次取消）
      const nijiGroup = document.createElement("div");
      nijiGroup.className = "niji-toggle-group";
      ["6", "7"].forEach(ver => {
        const btn = document.createElement("button");
        btn.className = "niji-btn";
        btn.type = "button";
        btn.textContent = `niji ${ver}`;
        btn.title = `套用 --niji ${ver}`;
        btn.classList.toggle("active", selectedNiji === ver);
        btn.addEventListener("click", () => {
          selectedNiji = selectedNiji === ver ? "" : ver;
          saveNiji();
          // niji 6 模式無法使用 niji7 專用 profile → 自動解除已選的 niji7 代碼
          if (selectedNiji === "6") {
            selectedProfiles = selectedProfiles.filter(c => codeNijiVersion(c) === "6");
            saveProfiles();
          }
          renderMainPanel();
          render();
        });
        nijiGroup.appendChild(btn);
      });
      panel.appendChild(nijiGroup);

      const toolbar = document.createElement("div");
      toolbar.className = "profile-toolbar";
      const hint = document.createElement("p");
      hint.className = "profile-hint";
      hint.textContent = "可複選代碼套用；★ 收藏、📌 置頂；預設代碼不可刪除";
      const searchToggle = document.createElement("button");
      searchToggle.className = "profile-search-toggle";
      searchToggle.type = "button";
      searchToggle.classList.toggle("active", profileSearchOpen);
      searchToggle.textContent = "🔍";
      searchToggle.title = "篩選 / 搜尋 Profile";
      searchToggle.setAttribute("aria-label", "篩選或搜尋 Profile");
      searchToggle.addEventListener("click", () => {
        profileSearchOpen = !profileSearchOpen;
        renderMainPanel();
      });
      toolbar.append(hint, searchToggle);
      panel.appendChild(toolbar);

      const searchPanel = document.createElement("div");
      searchPanel.className = "profile-search-panel";
      searchPanel.hidden = !profileSearchOpen;
      const searchInput = document.createElement("input");
      searchInput.className = "profile-search-input";
      searchInput.type = "text";
      searchInput.placeholder = "模糊搜尋 Profile 名稱";
      searchInput.setAttribute("aria-label", "搜尋 Profile 名稱");
      searchInput.value = profileSearchQuery;
      searchInput.addEventListener("input", () => {
        profileSearchQuery = searchInput.value;
        applyProfileFilter();
      });
      const favFilter = document.createElement("button");
      favFilter.className = "profile-fav-filter";
      favFilter.type = "button";
      favFilter.classList.toggle("active", profileFavFilter);
      favFilter.textContent = "★ 只看收藏";
      favFilter.title = "只顯示已收藏的 Profile";
      favFilter.addEventListener("click", () => {
        profileFavFilter = !profileFavFilter;
        favFilter.classList.toggle("active", profileFavFilter);
        applyProfileFilter();
      });
      searchPanel.append(searchInput, favFilter);
      panel.appendChild(searchPanel);
      if (profileSearchOpen) setTimeout(() => searchInput.focus(), 0);

      // 📌 置頂的代碼浮到所屬區段頂端，段內維持原順序
      const sortSection = codes => {
        const pinned = codes.filter(c => pinnedProfiles.includes(c));
        const rest = codes.filter(c => !pinnedProfiles.includes(c));
        return [...pinned, ...rest];
      };

      const toggleMembership = (arr, code) => {
        const i = arr.indexOf(code);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(code);
      };

      // 點 ✏️ 就地改名：把選取鈕換成輸入框，Enter/失焦儲存、Esc 取消
      const startRename = (row, choose, code) => {
        const input = document.createElement("input");
        input.className = "profile-rename-input";
        input.type = "text";
        input.value = aliasOf(code);
        input.placeholder = code;
        input.setAttribute("aria-label", `重新命名 ${code}`);
        let done = false;
        const finish = save => {
          if (done) return;
          done = true;
          if (save) {
            const v = input.value.trim();
            if (v) profileAliases[code] = v;
            else delete profileAliases[code];
            saveProfiles();
          }
          renderMainPanel();
        };
        input.addEventListener("keydown", e => {
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
        input.addEventListener("blur", () => finish(true));
        row.replaceChild(input, choose);
        input.focus();
        input.select();
      };

      const buildCodeRow = (code, isDefault) => {
        const alias = aliasOf(code);
        const row = document.createElement("div");
        row.className = "profile-code-row";
        row.classList.toggle("is-default", isDefault);
        row.dataset.code = code;
        row.dataset.alias = alias.toLowerCase();
        row.dataset.fav = favoriteProfiles.includes(code) ? "true" : "false";

        const choose = document.createElement("button");
        choose.className = "profile-code-btn";
        choose.type = "button";
        choose.classList.toggle("active", selectedProfiles.includes(code));
        if (alias) {
          choose.classList.add("has-alias");
          const nameSpan = document.createElement("span");
          nameSpan.className = "profile-code-name";
          nameSpan.textContent = alias;
          const codeSpan = document.createElement("span");
          codeSpan.className = "profile-code-sub";
          codeSpan.textContent = `--p ${code}`;
          choose.append(nameSpan, codeSpan);
          choose.title = `--p ${code}`;
        } else {
          choose.textContent = `--p ${code}`;
        }
        choose.addEventListener("click", () => {
          toggleMembership(selectedProfiles, code);
          saveProfiles();
          renderMainPanel();
          render();
        });

        const rename = document.createElement("button");
        rename.className = "profile-rename-btn";
        rename.type = "button";
        rename.textContent = "✏️";
        rename.title = `重新命名 ${code}`;
        rename.setAttribute("aria-label", `重新命名 ${code}`);
        rename.addEventListener("click", () => startRename(row, choose, code));

        const fav = document.createElement("button");
        fav.className = "profile-fav-btn";
        fav.type = "button";
        const isFav = favoriteProfiles.includes(code);
        fav.classList.toggle("active", isFav);
        fav.textContent = isFav ? "★" : "☆";
        fav.title = isFav ? `取消收藏 ${code}` : `收藏 ${code}`;
        fav.addEventListener("click", () => {
          toggleMembership(favoriteProfiles, code);
          saveProfiles();
          renderMainPanel();
        });

        const pin = document.createElement("button");
        pin.className = "profile-pin-btn";
        pin.type = "button";
        const isPinned = pinnedProfiles.includes(code);
        pin.classList.toggle("active", isPinned);
        pin.textContent = "📌";
        pin.title = isPinned ? `取消置頂 ${code}` : `置頂 ${code}`;
        pin.addEventListener("click", () => {
          toggleMembership(pinnedProfiles, code);
          saveProfiles();
          renderMainPanel();
        });

        row.append(choose, rename, fav, pin);

        if (!isDefault) {
          const remove = document.createElement("button");
          remove.className = "profile-delete-btn";
          remove.type = "button";
          remove.title = `刪除 ${code}`;
          remove.textContent = "×";
          remove.addEventListener("click", () => {
            profileCodes = profileCodes.filter(item => item !== code);
            selectedProfiles = selectedProfiles.filter(item => item !== code);
            favoriteProfiles = favoriteProfiles.filter(item => item !== code);
            pinnedProfiles = pinnedProfiles.filter(item => item !== code);
            delete profileAliases[code];
            delete profileVersions[code];
            saveProfiles();
            renderMainPanel();
            render();
          });
          row.appendChild(remove);
        }
        return row;
      };

      const list = document.createElement("div");
      list.className = "profile-code-list";
      sortSection(DEFAULTS).forEach(code => list.appendChild(buildCodeRow(code, true)));
      sortSection(profileCodes).forEach(code => list.appendChild(buildCodeRow(code, false)));
      panel.appendChild(list);

      const emptyMsg = document.createElement("p");
      emptyMsg.className = "profile-empty-msg";
      emptyMsg.textContent = "沒有符合條件的 Profile";
      emptyMsg.hidden = true;
      panel.appendChild(emptyMsg);

      // 依搜尋字串與「只看收藏」切換各列顯示（不重建 DOM，保留輸入焦點）
      function applyProfileFilter() {
        const q = profileSearchQuery.trim().toLowerCase();
        const visibleRows = [];
        list.querySelectorAll(".profile-code-row").forEach(row => {
          const matchFav = !profileFavFilter || row.dataset.fav === "true";
          const matchText = !q || row.dataset.code.toLowerCase().includes(q) || (row.dataset.alias && row.dataset.alias.includes(q));
          // niji 6 模式只顯示 niji6 代碼；niji 7 或未選則全顯示
          const matchNiji = codeUsableNow(row.dataset.code);
          const visible = matchFav && matchText && matchNiji;
          row.style.display = visible ? "" : "none";
          if (visible) visibleRows.push(row);
        });
        emptyMsg.hidden = visibleRows.length > 0;
        limitListHeight(visibleRows);
      }

      // 只顯示前 PROFILE_LIST_VISIBLE 列，其餘可捲動
      function limitListHeight(visibleRows) {
        list.style.maxHeight = "";
        list.style.overflowY = "";
        list.style.paddingRight = "";
        if (visibleRows.length <= PROFILE_LIST_VISIBLE) return;
        const gap = parseFloat(getComputedStyle(list).rowGap) || 6;
        let h = 0;
        for (let i = 0; i < PROFILE_LIST_VISIBLE; i += 1) h += visibleRows[i].offsetHeight;
        h += gap * (PROFILE_LIST_VISIBLE - 1);
        list.style.maxHeight = `${Math.ceil(h) + 4}px`;
        list.style.overflowY = "auto";
        list.style.paddingRight = "4px";
      }

      applyProfileFilter();
    }

    function buildPersonaPanel() {
      panel.classList.add("persona-panel");

      const form = document.createElement("form");
      form.className = "persona-add-form";
      const input = document.createElement("input");
      input.className = "persona-name-input";
      input.type = "text";
      input.placeholder = "人設名稱（可留空自動命名）";
      input.setAttribute("aria-label", "人設名稱");
      const add = document.createElement("button");
      add.className = "btn btn-copy persona-add-btn";
      add.type = "submit";
      add.textContent = "➕ 儲存目前角色";
      form.append(input, add);
      form.addEventListener("submit", e => {
        e.preventDefault();
        const p = captureCurrentPersona(input.value);
        if (!p) return;
        input.value = "";
        renderMainPanel();
        renderCategoryState();
        showToast(`已儲存「${p.name}」`);
      });
      panel.appendChild(form);

      const hint = document.createElement("p");
      hint.className = "persona-hint";
      hint.textContent = "存下性別、髮型、髮色、眼睛/異色瞳、動物耳朵；套用時只換這些，表情/動作/服裝/場景等都會保留";
      panel.appendChild(hint);

      const list = document.createElement("div");
      list.className = "persona-list";
      panel.appendChild(list);

      const empty = document.createElement("p");
      empty.className = "persona-empty-msg";
      empty.textContent = "還沒有人設，先選好角色再按上面「儲存目前角色」✨";
      empty.hidden = personaLibrary.length > 0;
      panel.appendChild(empty);

      const startPersonaRename = (row, mainBtn, persona) => {
        const rn = document.createElement("input");
        rn.className = "persona-rename-input";
        rn.type = "text";
        rn.value = persona.name;
        rn.setAttribute("aria-label", "重新命名人設");
        let done = false;
        const finish = save => {
          if (done) return;
          done = true;
          if (save) { const v = rn.value.trim(); if (v) persona.name = v; savePersonaLibrary(); }
          renderMainPanel();
          renderCategoryState();
        };
        rn.addEventListener("keydown", ev => {
          if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
          else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
        });
        rn.addEventListener("blur", () => finish(true));
        row.replaceChild(rn, mainBtn);
        rn.focus();
        rn.select();
      };

      [...personaLibrary].sort((a, b) => b.ts - a.ts).forEach(persona => {
        const row = document.createElement("div");
        row.className = "persona-row";

        const main = document.createElement("button");
        main.className = "persona-item-btn";
        main.type = "button";
        main.title = "點擊套用（只換角色，保留場景）";
        const nameSpan = document.createElement("span");
        nameSpan.className = "persona-item-name";
        nameSpan.textContent = persona.name;
        const g = GENDERS.find(x => x.key === persona.gender);
        const subSpan = document.createElement("span");
        subSpan.className = "persona-item-sub";
        subSpan.textContent = `${g ? g.icon + " " : ""}${persona.slugs.length} 個角色詞`;
        main.append(nameSpan, subSpan);
        main.addEventListener("click", () => applyPersona(persona));

        const rename = document.createElement("button");
        rename.className = "persona-rename-btn";
        rename.type = "button";
        rename.textContent = "✏️";
        rename.title = "重新命名";
        rename.setAttribute("aria-label", `重新命名 ${persona.name}`);
        rename.addEventListener("click", () => startPersonaRename(row, main, persona));

        const del = document.createElement("button");
        del.className = "persona-delete-btn";
        del.type = "button";
        del.textContent = "×";
        del.title = "刪除人設";
        del.setAttribute("aria-label", `刪除 ${persona.name}`);
        del.addEventListener("click", () => {
          personaLibrary = personaLibrary.filter(p => p.id !== persona.id);
          savePersonaLibrary();
          renderMainPanel();
          renderCategoryState();
        });

        row.append(main, rename, del);
        list.appendChild(row);
      });
    }

    renderMainPanel = () => {
      // 重建前記住 profile 清單的捲動位置，避免選/取消時跳回最上面
      const prevList = panel.querySelector(".profile-code-list");
      const prevScroll = prevList ? prevList.scrollTop : 0;
      panel.innerHTML = "";
      panel.classList.remove("profile-panel", "persona-panel");
      if (activeWorkspace === "profile") {
        buildProfilePanel();
        const newList = panel.querySelector(".profile-code-list");
        if (newList) newList.scrollTop = prevScroll;
        return;
      }
      if (activeWorkspace === "persona") {
        buildPersonaPanel();
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
    if (activeWorkspace === "profile" || activeWorkspace === "persona") {
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
    } else if (cat.picker === "animalEars") {
      const chosen = selected.find(slug => wordIndex[slug].category === cat.category);
      const color = chosen ? clothingColor(chosen) : null;
      const openBtn = document.createElement("button");
      openBtn.className = "hair-color-open";
      openBtn.type = "button";
      openBtn.textContent = chosen
        ? `🐱 動物耳朵（${color ? color.zh : ""}${wordIndex[chosen].zh}）`
        : "🐱 選擇動物耳朵";
      openBtn.addEventListener("click", openAnimalEarsModal);
      optionDrawer.appendChild(openBtn);
    } else if (cat.subgroups) {
      buildSubgroupAccordion(cat);
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

    // 目前分類中已選的 colorable 詞：底部提供重開顏色視窗的按鈕（服裝、配件的領帶皆適用）
    // 動物耳朵的顏色改由自己的彈窗處理，故此處排除
    selected.filter(slug => wordIndex[slug].colorable && wordIndex[slug].category === cat.category && cat.category !== "動物耳朵").forEach(slug => {
      const color = clothingColor(slug);
      const openBtn = document.createElement("button");
      openBtn.className = "hair-color-open";
      openBtn.type = "button";
      openBtn.textContent = `🎨 ${wordIndex[slug].zh}顏色（${color?.zh || "未選色"}）`;
      openBtn.addEventListener("click", () => openClothingModal(slug));
      optionDrawer.appendChild(openBtn);
    });
  }

  // 有 subgroups 的分類（服裝）：抽屜內以手風琴收合小組呈現，一次只展開一組
  function buildSubgroupAccordion(cat) {
    cat.subgroups.forEach(sg => {
      const words = cat.words.filter(w => w.sub === sg.key && wordVisible(w));
      if (!words.length) return; // 依性別過濾後該組無詞 → 整組隱藏
      const collapsed = openClothingSub !== sg.key;
      const count = selected.filter(s =>
        wordIndex[s].category === cat.category && wordIndex[s].sub === sg.key).length;

      const groupEl = document.createElement("div");
      groupEl.className = "cat-group sub-group" + (collapsed ? " collapsed" : "");

      const header = document.createElement("button");
      header.className = "group-header";
      header.type = "button";
      header.innerHTML =
        `<span class="sub-icon">${sg.icon}</span><span class="sub-name">${sg.zh}</span>` +
        `<span class="sub-count${count ? " show" : ""}">${count}</span>` +
        `<span class="arrow">▾</span>`;
      // 手風琴：點收合中的組 → 展開它（其餘自動收合）；點展開中的組 → 收合
      header.addEventListener("click", () => {
        openClothingSub = collapsed ? sg.key : "";
        renderDrawer();
        renderCategoryState();
      });
      groupEl.appendChild(header);

      const bodyWrap = document.createElement("div");
      bodyWrap.className = "group-body-wrap";
      const body = document.createElement("div");
      body.className = "group-body";
      body.appendChild(buildWordList(words));
      bodyWrap.appendChild(body);
      groupEl.appendChild(bodyWrap);

      optionDrawer.appendChild(groupEl);
    });
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

  /* ===== 動物耳朵彈出視窗（種類 + 耳朵顏色） ===== */
  const animalEarsModalBackdrop = document.createElement("div");
  animalEarsModalBackdrop.className = "modal-backdrop";
  animalEarsModalBackdrop.hidden = true;
  document.body.appendChild(animalEarsModalBackdrop);
  animalEarsModalBackdrop.addEventListener("click", e => {
    if (e.target === animalEarsModalBackdrop) closeAnimalEarsModal();
  });

  // 目前選中的動物耳朵種類（單選）
  function currentAnimalEar() {
    return selected.find(s => wordIndex[s].category === "動物耳朵") || "";
  }

  function openAnimalEarsModal() {
    animalEarsModalBackdrop.hidden = false;
    animalEarsModalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal animal-ears-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = "🐱 動物耳朵";
    panel.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "modal-sub";
    sub.textContent = "選擇動物種類與耳朵顏色；種類重選會自動替換";
    panel.appendChild(sub);

    const kindTitle = document.createElement("p");
    kindTitle.className = "drawer-title";
    kindTitle.textContent = "🐾 種類（單選）";
    panel.appendChild(kindTitle);
    panel.appendChild(buildWordList(ANIMAL_EARS_CAT.words.filter(wordVisible), slug => {
      toggleWord(slug);
      updateAnimalEarsModal();
    }));

    const colorTitle = document.createElement("p");
    colorTitle.className = "drawer-title";
    colorTitle.textContent = "🎨 耳朵顏色（單選，可不選）";
    panel.appendChild(colorTitle);
    const colorHint = document.createElement("p");
    colorHint.className = "modal-sub animal-ears-color-hint";
    colorHint.textContent = "先選種類，才能挑顏色";
    panel.appendChild(colorHint);
    const colorList = document.createElement("div");
    colorList.className = "word-list animal-ears-color-list";
    CLOTHING_COLORS.forEach(color => {
      const btn = document.createElement("button");
      btn.className = "word-btn";
      btn.type = "button";
      btn.textContent = color.zh;
      btn.dataset.earColor = color.key;
      btn.addEventListener("click", () => {
        const chosen = currentAnimalEar();
        if (!chosen) return;
        // 再點同色 = 取消上色
        setClothingColor(chosen, clothingColors[chosen] === color.key ? "" : color.key);
        render();
        updateAnimalEarsModal();
      });
      colorList.appendChild(btn);
    });
    panel.appendChild(colorList);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeAnimalEarsModal);
    actions.appendChild(done);
    panel.appendChild(actions);

    animalEarsModalBackdrop.appendChild(panel);
    updateAnimalEarsModal();
  }

  function updateAnimalEarsModal() {
    if (animalEarsModalBackdrop.hidden) return;
    const chosen = currentAnimalEar();
    animalEarsModalBackdrop.querySelectorAll(".word-btn[data-slug]").forEach(btn => {
      btn.classList.toggle("active", selected.includes(btn.dataset.slug));
    });
    const hint = animalEarsModalBackdrop.querySelector(".animal-ears-color-hint");
    const colorList = animalEarsModalBackdrop.querySelector(".animal-ears-color-list");
    if (hint) hint.hidden = !!chosen;
    if (colorList) colorList.hidden = !chosen;
    const cur = chosen ? clothingColors[chosen] || "" : "";
    animalEarsModalBackdrop.querySelectorAll("[data-ear-color]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.earColor === cur);
    });
  }

  function closeAnimalEarsModal() {
    animalEarsModalBackdrop.hidden = true;
  }

  /* ===== 自填詞記憶庫 ===== */
  const libraryModalBackdrop = document.createElement("div");
  libraryModalBackdrop.className = "modal-backdrop";
  libraryModalBackdrop.hidden = true;
  document.body.appendChild(libraryModalBackdrop);
  libraryModalBackdrop.addEventListener("click", e => {
    if (e.target === libraryModalBackdrop) closeLibraryModal();
  });

  function createLibraryItem(text) {
    return {
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text, alias: "", cat: "", fav: false, pin: false, ts: Date.now()
    };
  }

  // 自填詞離開輸入框時呼叫：以文字去重（不分大小寫），沒收錄過才新增
  function recordToLibrary(rawText) {
    const text = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const existing = wordLibrary.find(item => item.text.toLowerCase() === text.toLowerCase());
    if (existing) { existing.ts = Date.now(); saveLibrary(); return; }
    wordLibrary.push(createLibraryItem(text));
    saveLibrary();
  }

  // 從記憶庫把詞加回工作區（比照 addCustomWord）
  function insertLibraryWord(item) {
    const word = createCustomWord(item.text, "end");
    customWords.push(word);
    activeCustomId = word.id;
    savePromptEditing();
    render();
    showToast("已加入自訂詞");
  }

  function openLibraryModal() {
    libraryModalBackdrop.hidden = false;
    buildLibraryModal();
  }

  function closeLibraryModal() {
    libraryModalBackdrop.hidden = true;
  }

  // 建立 modal 外殼（含持久的搜尋輸入框）；分類列與清單由 renderLibraryList 填入
  function buildLibraryModal() {
    libraryModalBackdrop.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "hair-modal library-modal";

    const title = document.createElement("p");
    title.className = "drawer-title";
    title.textContent = "📚 自填詞記憶庫";
    panel.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "modal-sub";
    sub.textContent = "點詞即可加回工作區；輸入過的自填詞會自動收錄";
    panel.appendChild(sub);

    const searchRow = document.createElement("div");
    searchRow.className = "library-search-row";
    const searchInput = document.createElement("input");
    searchInput.className = "library-search-input";
    searchInput.type = "text";
    searchInput.placeholder = "搜尋文字或別名";
    searchInput.setAttribute("aria-label", "搜尋記憶庫");
    searchInput.value = librarySearchQuery;
    searchInput.addEventListener("input", () => {
      librarySearchQuery = searchInput.value;
      renderLibraryList();
    });
    searchRow.appendChild(searchInput);
    panel.appendChild(searchRow);

    const catBar = document.createElement("div");
    catBar.className = "library-cat-bar";
    panel.appendChild(catBar);

    const list = document.createElement("div");
    list.className = "library-list";
    panel.appendChild(list);

    const emptyMsg = document.createElement("p");
    emptyMsg.className = "library-empty-msg";
    emptyMsg.textContent = "還沒有自填詞，先在上方輸入自訂詞就會自動收錄 ✨";
    emptyMsg.hidden = true;
    panel.appendChild(emptyMsg);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const done = document.createElement("button");
    done.className = "btn btn-copy";
    done.type = "button";
    done.textContent = "完成 ✓";
    done.addEventListener("click", closeLibraryModal);
    actions.appendChild(done);
    panel.appendChild(actions);

    libraryModalBackdrop.appendChild(panel);
    renderLibraryList();
  }

  // 只重繪分類列與清單（保留搜尋輸入框焦點）
  function renderLibraryList() {
    const catBar = libraryModalBackdrop.querySelector(".library-cat-bar");
    const list = libraryModalBackdrop.querySelector(".library-list");
    const emptyMsg = libraryModalBackdrop.querySelector(".library-empty-msg");
    if (!catBar || !list) return;

    // 分類列：全部 / ★收藏 / 各自訂分類 / 未分類 / ＋新增分類
    catBar.innerHTML = "";
    const makeChip = (key, label) => {
      const chip = document.createElement("button");
      chip.className = "library-cat-chip";
      chip.type = "button";
      chip.textContent = label;
      chip.classList.toggle("active", libraryActiveCat === key);
      chip.addEventListener("click", () => { libraryActiveCat = key; renderLibraryList(); });
      return chip;
    };
    catBar.appendChild(makeChip("all", "全部"));
    catBar.appendChild(makeChip("fav", "★收藏"));
    libraryCats.forEach(cat => {
      const wrap = document.createElement("span");
      wrap.className = "library-cat-chip-wrap";
      wrap.classList.toggle("active", libraryActiveCat === cat.id);
      const chip = makeChip(cat.id, cat.name);
      chip.classList.add("library-cat-chip-label");
      const edit = document.createElement("button");
      edit.className = "library-cat-edit";
      edit.type = "button";
      edit.textContent = "✎";
      edit.title = `重新命名分類「${cat.name}」`;
      edit.addEventListener("click", e => { e.stopPropagation(); startCatRename(wrap, chip, cat); });
      const del = document.createElement("button");
      del.className = "library-cat-del";
      del.type = "button";
      del.textContent = "✕";
      del.title = `刪除分類「${cat.name}」（詞條移回未分類）`;
      del.addEventListener("click", e => {
        e.stopPropagation();
        wordLibrary.forEach(item => { if (item.cat === cat.id) item.cat = ""; });
        libraryCats = libraryCats.filter(c => c.id !== cat.id);
        if (libraryActiveCat === cat.id) libraryActiveCat = "all";
        saveLibrary();
        renderLibraryList();
      });
      wrap.append(chip, edit, del);
      catBar.appendChild(wrap);
    });
    catBar.appendChild(makeChip("", "未分類"));
    const addCat = document.createElement("button");
    addCat.className = "library-cat-chip library-cat-add";
    addCat.type = "button";
    addCat.textContent = "＋ 新增分類";
    addCat.addEventListener("click", () => startAddCategory(addCat));
    catBar.appendChild(addCat);

    // 清單：依分類 + 搜尋過濾，置頂浮頂、其餘依時間新→舊
    const q = librarySearchQuery.trim().toLowerCase();
    const items = wordLibrary
      .filter(item => {
        const matchText = !q || item.text.toLowerCase().includes(q) || (item.alias && item.alias.toLowerCase().includes(q));
        let matchCat;
        if (libraryActiveCat === "all") matchCat = true;
        else if (libraryActiveCat === "fav") matchCat = item.fav;
        else matchCat = item.cat === libraryActiveCat;
        return matchText && matchCat;
      })
      .sort((a, b) => (Number(b.pin) - Number(a.pin)) || (b.ts - a.ts));

    list.innerHTML = "";
    emptyMsg.hidden = items.length > 0;
    items.forEach(item => list.appendChild(buildLibraryRow(item)));
  }

  function buildLibraryRow(item) {
    const row = document.createElement("div");
    row.className = "library-item-row";

    const main = document.createElement("button");
    main.className = "library-item-btn";
    main.type = "button";
    main.title = "點擊加回工作區";
    if (item.alias) {
      main.classList.add("has-alias");
      const nameSpan = document.createElement("span");
      nameSpan.className = "library-item-name";
      nameSpan.textContent = item.alias;
      const subSpan = document.createElement("span");
      subSpan.className = "library-item-sub";
      subSpan.textContent = item.text;
      main.append(nameSpan, subSpan);
    } else {
      main.textContent = item.text;
    }
    main.addEventListener("click", () => insertLibraryWord(item));

    const fav = document.createElement("button");
    fav.className = "library-fav-btn";
    fav.type = "button";
    fav.classList.toggle("active", item.fav);
    fav.textContent = item.fav ? "★" : "☆";
    fav.title = item.fav ? "取消收藏" : "收藏";
    fav.addEventListener("click", () => { item.fav = !item.fav; saveLibrary(); renderLibraryList(); });

    const pin = document.createElement("button");
    pin.className = "library-pin-btn";
    pin.type = "button";
    pin.classList.toggle("active", item.pin);
    pin.textContent = "📌";
    pin.title = item.pin ? "取消置頂" : "置頂";
    pin.addEventListener("click", () => { item.pin = !item.pin; saveLibrary(); renderLibraryList(); });

    const rename = document.createElement("button");
    rename.className = "library-rename-btn";
    rename.type = "button";
    rename.textContent = "✏️";
    rename.title = "設定別名";
    rename.addEventListener("click", () => startItemRename(row, main, item));

    const move = document.createElement("select");
    move.className = "library-move-select";
    move.title = "移動到分類";
    move.setAttribute("aria-label", "移動到分類");
    const optUncat = document.createElement("option");
    optUncat.value = "";
    optUncat.textContent = "未分類";
    move.appendChild(optUncat);
    libraryCats.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      move.appendChild(opt);
    });
    move.value = item.cat || "";
    move.addEventListener("change", () => { item.cat = move.value; saveLibrary(); renderLibraryList(); });

    const del = document.createElement("button");
    del.className = "library-delete-btn";
    del.type = "button";
    del.textContent = "×";
    del.title = "從記憶庫刪除";
    del.addEventListener("click", () => {
      wordLibrary = wordLibrary.filter(i => i.id !== item.id);
      saveLibrary();
      renderLibraryList();
    });

    row.append(main, fav, pin, rename, move, del);
    return row;
  }

  // 就地改別名（把主按鈕換成輸入框，Enter/失焦存、Esc 取消）
  function startItemRename(row, mainBtn, item) {
    const input = document.createElement("input");
    input.className = "library-rename-input";
    input.type = "text";
    input.value = item.alias || "";
    input.placeholder = item.text;
    input.setAttribute("aria-label", "設定別名");
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save) { item.alias = input.value.trim(); saveLibrary(); }
      renderLibraryList();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    row.replaceChild(input, mainBtn);
    input.focus();
    input.select();
  }

  function startCatRename(wrap, chip, cat) {
    const input = document.createElement("input");
    input.className = "library-rename-input";
    input.type = "text";
    input.value = cat.name;
    input.setAttribute("aria-label", "重新命名分類");
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save) { const v = input.value.trim(); if (v) { cat.name = v; saveLibrary(); } }
      renderLibraryList();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", e => e.stopPropagation());
    wrap.replaceChild(input, chip);
    input.focus();
    input.select();
  }

  function startAddCategory(addChip) {
    const input = document.createElement("input");
    input.className = "library-rename-input library-cat-add-input";
    input.type = "text";
    input.placeholder = "分類名稱";
    input.setAttribute("aria-label", "新增分類名稱");
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save) {
        const v = input.value.trim();
        if (v) {
          const cat = { id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: v };
          libraryCats.push(cat);
          saveLibrary();
        }
      }
      renderLibraryList();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    addChip.replaceWith(input);
    input.focus();
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
        ? selectedProfiles.length
        : badge.dataset.workspace === "persona"
          ? personaLibrary.length
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
    if (idx < 0 && w.colorable && w.category !== "動物耳朵") openClothingModal(slug);
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
    const nijiTail = selectedNiji ? `--niji ${selectedNiji}` : "";
    const profileTail = selectedProfiles.length ? `--profile ${selectedProfiles.join(" ")}` : "";
    currentPrompt = [prompt, nijiTail, profileTail].filter(Boolean).join(" ");
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
      emptyHint.style.display = (selected.length || selectedGender || hasCustomText() || selectedProfiles.length || selectedNiji) ? "none" : "";
      updateCurrentPrompt();
    });
    span.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); span.blur(); }
    });
    span.addEventListener("blur", () => {
      word.text = span.textContent.replace(/\s+/g, " ").trim();
      span.textContent = word.text;
      savePromptEditing();
      recordToLibrary(word.text); // 自填詞離開輸入框即自動收錄進記憶庫
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

  // 預設詞排序：群組內的插入點（拖曳時才顯示）
  function buildWordDropZone(group, index) {
    const zone = document.createElement("span");
    zone.className = "word-drop-zone";
    zone.dataset.wgroup = group;
    zone.dataset.windex = String(index);
    zone.setAttribute("aria-hidden", "true");
    return zone;
  }

  // 按住 ⠿ 把手拖曳預設詞：只在同群組內的插入點放開才生效
  function startWordDrag(handle, slug, group, e) {
    if (e.button != null && e.button !== 0) return;
    let dragging = false;
    let activeZone = null;
    let lastX = e.clientX, lastY = e.clientY;
    const findZone = () => {
      const hit = document.elementFromPoint(lastX, lastY)?.closest(".word-drop-zone");
      const zone = hit && hit.dataset.wgroup === group ? hit : null;
      if (activeZone !== zone) {
        activeZone?.classList.remove("drop-active");
        activeZone = zone;
        activeZone?.classList.add("drop-active");
      }
    };
    const timer = setTimeout(() => {
      dragging = true;
      promptText.classList.add("word-dragging");
      promptText.querySelectorAll(`.word-drop-zone[data-wgroup="${group}"]`)
        .forEach(z => z.classList.add("zone-live"));
      handle.closest(".pw-reorder-wrap")?.classList.add("dragging");
      findZone();
    }, 220);
    const move = ev => {
      lastX = ev.clientX; lastY = ev.clientY;
      if (dragging) { ev.preventDefault(); findZone(); }
    };
    const finish = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      promptText.classList.remove("word-dragging");
      promptText.querySelectorAll(".word-drop-zone.zone-live").forEach(z => z.classList.remove("zone-live"));
      handle.closest(".pw-reorder-wrap")?.classList.remove("dragging");
      const target = activeZone;
      activeZone?.classList.remove("drop-active");
      if (dragging && target) reorderPresetWord(slug, group, Number(target.dataset.windex));
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  /* ===== 畫面更新 ===== */
  function render() {
    renderDrawer(); // 選詞會影響髮色細節區的展開/收起，重繪抽屜
    renderCategoryState();

    // 選中詞 chips（畫面設定/背景裝飾依手動排序、人物段依 niji 7 順序；性別 chip 排在人物詞最前）
    const groupOf = groupOfSlug;
    const bigSlugs = sortGroupSlugs(selected.filter(s => groupOf(s) === "畫面設定"));
    const charSlugs = sortForPrompt(selected.filter(s => groupOf(s) === "角色設定"));
    const tailSlugs = sortGroupSlugs(selected.filter(s => groupOf(s) === "背景裝飾"));
    currentBigSlugs = bigSlugs;
    currentTailSlugs = tailSlugs;
    const gender = GENDERS.find(g => g.key === selectedGender);
    const tokens = buildPromptTokens(bigSlugs, charSlugs, tailSlugs, gender);
    const modifiedSlugs = new Set();
    let genderModified = false;
    tokens.filter(tokenIsModified).forEach(token => {
      (token.sourceSlugs || []).forEach(slug => modifiedSlugs.add(slug));
      if (token.sourceGender) genderModified = true;
    });

    chipsEl.querySelectorAll(".chip").forEach(c => c.remove());
    emptyHint.style.display = (selected.length || gender || hasCustomText() || selectedProfiles.length || selectedNiji) ? "none" : "";

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
    if (selectedNiji) {
      const chip = document.createElement("button");
      chip.className = "chip chip-niji";
      chip.type = "button";
      chip.title = "Niji 版本｜點擊取消套用";
      const label = document.createElement("span");
      label.textContent = `niji ${selectedNiji}`;
      const remove = document.createElement("span");
      remove.className = "x";
      remove.textContent = "×";
      chip.append(label, " ", remove);
      chip.addEventListener("click", () => {
        selectedNiji = "";
        saveNiji();
        renderMainPanel();
        render();
      });
      chipsEl.appendChild(chip);
    }
    selectedProfiles.forEach(code => {
      const chip = document.createElement("button");
      chip.className = "chip chip-profile";
      chip.type = "button";
      chip.title = "Profile｜點擊取消套用";
      const label = document.createElement("span");
      label.textContent = `profile · ${code}`;
      const remove = document.createElement("span");
      remove.className = "x";
      remove.textContent = "×";
      chip.append(label, " ", remove);
      chip.addEventListener("click", () => {
        selectedProfiles = selectedProfiles.filter(item => item !== code);
        saveProfiles();
        renderMainPanel();
        render();
      });
      chipsEl.appendChild(chip);
    });

    // 提示詞字串（複製用純文字 + 預覽用分色顯示）
    currentPromptTokens = tokens;
    currentBasePrompt = tokens.map(t => t.text).join("");
    updateCurrentPrompt();
    promptText.innerHTML = "";
    // 此 token 是否為可拖曳排序的預設詞：回傳 { group, idx, len } 或 null
    const reorderInfo = t => {
      if (!t.sourceSlugs || t.sourceSlugs.length !== 1) return null;
      const slug = t.sourceSlugs[0];
      if (!wordIndex[slug] || !REORDER_GROUPS.includes(groupOf(slug))) return null;
      const list = groupOf(slug) === "畫面設定" ? bigSlugs : tailSlugs;
      const idx = list.indexOf(slug);
      return idx >= 0 && list.length >= 2 ? { slug, group: groupOf(slug), idx, len: list.length } : null;
    };

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
        const ri = reorderInfo(t);
        if (ri) {
          if (ri.idx === 0) promptText.appendChild(buildWordDropZone(ri.group, 0));
          const wrap = document.createElement("span");
          wrap.className = "pw-reorder-wrap";
          const handle = document.createElement("span");
          handle.className = "word-drag-handle";
          handle.textContent = "⠿";
          handle.title = "按住拖曳，調整這個詞的位置";
          handle.setAttribute("aria-label", "拖曳排序");
          handle.addEventListener("pointerdown", e => {
            e.preventDefault();
            e.stopPropagation();
            startWordDrag(handle, ri.slug, ri.group, e);
          });
          wrap.append(handle, span);
          promptText.appendChild(wrap);
          promptText.appendChild(buildWordDropZone(ri.group, ri.idx + 1));
        } else {
          promptText.appendChild(span);
        }
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
    let tailHasContent = tokens.length || hasCustomText();
    if (selectedNiji) {
      if (tailHasContent) promptText.appendChild(document.createTextNode(" "));
      const niji = document.createElement("span");
      niji.className = "pw-niji";
      niji.textContent = `--niji ${selectedNiji}`;
      niji.title = "已套用的 Niji 版本";
      promptText.appendChild(niji);
      tailHasContent = true;
    }
    if (selectedProfiles.length) {
      if (tailHasContent) promptText.appendChild(document.createTextNode(" "));
      const profile = document.createElement("span");
      profile.className = "pw-profile";
      profile.textContent = `--profile ${selectedProfiles.join(" ")}`;
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
     （注意：此處依分類名稱組句，若在 prompts.js 改分類名稱需同步修改） */
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
        else byCat(c).forEach(s => parts.push(editableToken(resolveEn(wordIndex[s].en), `word:${s}`, {
          hue: wordIndex[s].hue,
          sourceSlugs: [s]
        })));
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
      byCat("動物耳朵").forEach(s => { plain(", "); word(s); });
      byCat("臉部五官").forEach(s => { plain(", "); word(s); });
      byCat("氣質特質").forEach(s => { plain(", "); word(s); });
      byCat("表情").forEach(s => { plain(", "); word(s); });
      const clothes = byCat("服裝");
      if (clothes.length) {
        plain(", wearing ");
        clothes.forEach((s, i) => { if (i) plain(" and "); word(s); });
      }
      byCat("配件").forEach(s => { plain(", "); word(s); });
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

  function probeImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  // profile 示範圖：一個代碼可多張（base、(1)、(2)…連續、遇缺即停），依編號順序回傳
  // 檔名帶 niji 版本後綴：{code}-n{版本}.png，版本依目前選的 niji 模式（未選預設 n7）
  async function probeProfileImages(codes) {
    const MAX = 30;
    const ver = selectedNiji || "7";
    const out = [];
    for (const code of codes) {
      const zh = aliasOf(code) || code;
      const stem = `profile-images/${code}-n${ver}`;
      for (let i = 0; i <= MAX; i++) {
        const candidates = i === 0
          ? [`${stem}.png`]
          : [`${stem}(${i}).png`, `${stem} (${i}).png`];
        let found = null;
        for (const src of candidates) {
          if (await probeImage(src)) { found = src; break; }
        }
        if (!found) break; // 該編號兩種寫法都沒有 → 遇缺即停
        out.push({ src: found, zh: out.filter(o => o.en === `--profile ${code}`).length ? `${zh} ${i + 1}` : zh, en: `--profile ${code}` });
      }
    }
    return out;
  }

  /* ===== Profile 示範圖輪播 ===== */
  let pool = [];        // [{ src, zh, en }]
  let slideIdx = 0;
  let slideTimer = null;
  let rebuildToken = 0;

  async function rebuildSlideshow() {
    const token = ++rebuildToken;
    stopTimer();
    const keepSrc = pool[slideIdx] ? pool[slideIdx].src : null; // 記住目前這張，重建後盡量停在同一張

    if (!selectedProfiles.length) {
      pool = [];
      slideshow.hidden = true;
      galleryHint.style.display = "";
      galleryHint.innerHTML = "選擇 profile 代碼後，這裡會輪播對應的示範圖";
      return;
    }

    // 依所選 profile 代碼、照編號順序輪播其示範圖
    const profileImgs = await probeProfileImages(selectedProfiles);
    if (token !== rebuildToken) return; // 探測期間又變了，放棄
    pool = profileImgs;
    const keepIdx = keepSrc ? pool.findIndex(item => item.src === keepSrc) : -1;
    slideIdx = keepIdx >= 0 ? keepIdx : 0; // 目前這張還在就停在原處，否則回到第一張

    if (!pool.length) {
      slideshow.hidden = true;
      galleryHint.style.display = "";
      const ver = selectedNiji || "7";
      galleryHint.innerHTML =
        `找不到這些 profile 的示範圖 🖼<br>把 <b>&lt;代碼&gt;-n${ver}.png</b> 放進 <b>profile-images/</b>`;
      return;
    }

    galleryHint.style.display = "none";
    slideshow.hidden = false;
    showSlide(slideIdx);
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
  document.getElementById("libraryBtn").addEventListener("click", openLibraryModal);

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
    if (!selected.length && !selectedGender && !hairSecond && !customWords.length && !selectedProfiles.length && !selectedNiji && !Object.keys(promptOverrides).length) return;
    selected = [];
    promptOverrides = {};
    manualWordOrder = [];
    saveWordOrder();
    customWords = [];
    activeCustomId = "";
    clothingColors = {};
    saveClothingColors();
    selectedProfiles = [];
    saveProfiles();
    selectedNiji = "";
    saveNiji();
    clearEyeColors();
    setGender("");
    setHairSecond("");
    saveSelection();
    savePromptEditing();
    renderMainPanel();
    render();
    showToast("已清空");
  });

  /* ===== 使用說明彈窗（頁籤介紹版） ===== */
  const helpModal = document.getElementById("helpModal");
  const helpTabs = helpModal.querySelectorAll(".help-tab");
  const setHelpTab = key => {
    helpTabs.forEach(t => t.classList.toggle("active", t.dataset.helpTab === key));
    helpModal.querySelectorAll(".help-panel").forEach(p => { p.hidden = p.dataset.helpPanel !== key; });
  };
  helpTabs.forEach(t => t.addEventListener("click", () => setHelpTab(t.dataset.helpTab)));
  document.getElementById("helpToggle").addEventListener("click", () => { helpModal.hidden = false; setHelpTab("start"); });
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
