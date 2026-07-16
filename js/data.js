// Niji 提示詞詞庫
// 依 niji 7 的寫作順序排列：先「圖片大方向」（風格→構圖→氛圍→光影→場景），
// 再「人物小方向」（性別→髮型→眼睛→表情→服裝→動作）。
// 提示詞輸出會依此順序自動排序，與點選順序無關。
// 每個分類：group = 所屬大類、hue = 代表色相(0-360，用於選中詞的顏色區分)
// 每個詞：zh = 顯示名稱、en = 實際提示詞、slug = 對應 images/<slug>/ 資料夾名稱

// 性別（人物描述的開頭詞，單選）
const GENDERS = [
  { zh: "女性", en: "1girl", key: "female", icon: "👩" },
  { zh: "男性", en: "1boy", key: "male", icon: "👨" }
];

const PROMPT_DATA = [
  /* ========== 圖片大方向 ========== */
  {
    category: "畫風",
    group: "圖片大方向",
    icon: "🎨",
    hue: 265,
    words: [
      { zh: "賽璐璐動畫", en: "cel shading anime style", slug: "cel-shading" },
      { zh: "厚塗", en: "impasto painting style", slug: "impasto" },
      { zh: "水彩", en: "watercolor style", slug: "watercolor" },
      { zh: "吉卜力風", en: "ghibli inspired style", slug: "ghibli" },
      { zh: "90年代復古動畫", en: "90s retro anime style", slug: "retro-90s" },
      { zh: "扁平插畫", en: "flat illustration", slug: "flat-illust" },
      { zh: "像素風", en: "pixel art style", slug: "pixel-art" },
      { zh: "黑白漫畫", en: "black and white manga style", slug: "manga-bw" },
      { zh: "半寫實", en: "semi-realistic style", slug: "semi-realistic" },
      { zh: "奇幻油畫", en: "exquisite fantasy oil painting", slug: "fantasy-oil-painting" },
      { zh: "半寫實人像照", en: "half-realistic lady photo", slug: "half-realistic-photo" }
    ]
  },
  {
    category: "構圖視角",
    group: "圖片大方向",
    icon: "📷",
    hue: 210,
    words: [
      { zh: "特寫", en: "close-up shot", slug: "close-up" },
      { zh: "全身", en: "full body shot", slug: "full-body" },
      { zh: "仰視", en: "low angle view", slug: "low-angle" },
      { zh: "俯視", en: "high angle view", slug: "high-angle" },
      { zh: "側面", en: "side profile", slug: "side-profile" },
      { zh: "動態構圖", en: "dynamic composition", slug: "dynamic-comp" },
      { zh: "廣角景深", en: "wide angle depth of field", slug: "wide-angle" },
      { zh: "半身", en: "half body shot", slug: "half-body" },
      { zh: "正面", en: "front face", slug: "front-face" }
    ]
  },
  {
    category: "色調氛圍",
    group: "圖片大方向",
    icon: "🌈",
    hue: 320,
    words: [
      { zh: "粉彩色系", en: "pastel color palette", slug: "pastel" },
      { zh: "高飽和", en: "vibrant saturated colors", slug: "vibrant" },
      { zh: "低飽和霧感", en: "muted desaturated tones", slug: "muted" },
      { zh: "暖色調", en: "warm color tones", slug: "warm-tone" },
      { zh: "冷色調", en: "cool color tones", slug: "cool-tone" },
      { zh: "夢幻朦朧", en: "dreamy hazy atmosphere", slug: "dreamy" },
      { zh: "黑暗奇幻", en: "dark fantasy mood", slug: "dark-fantasy" },
      { zh: "魔幻夢境", en: "magical and dreamy atmosphere", slug: "magical-dreamy" },
      { zh: "柔和色調", en: "soft tones", slug: "soft-tones" },
      { zh: "恬靜溫柔", en: "gentle and tranquil mood", slug: "tranquil-mood" },
      { zh: "靜謐神聖", en: "quiet and sacred feeling", slug: "sacred-feeling" }
    ]
  },
  {
    category: "光影",
    group: "圖片大方向",
    icon: "💡",
    hue: 45,
    words: [
      { zh: "逆光", en: "backlighting", slug: "backlight" },
      { zh: "黃金時刻", en: "golden hour lighting", slug: "golden-hour" },
      { zh: "霓虹光", en: "neon lighting", slug: "neon-light" },
      { zh: "柔和漫射光", en: "soft diffused light", slug: "soft-light" },
      { zh: "月光", en: "moonlight", slug: "moonlight" },
      { zh: "電影感打光", en: "cinematic lighting", slug: "cinematic-light" },
      { zh: "光斑透葉", en: "dappled sunlight", slug: "dappled-light" },
      { zh: "細膩光線", en: "delicate lighting", slug: "delicate-lighting" }
    ]
  },
  {
    category: "場景",
    group: "圖片大方向",
    icon: "🏞",
    hue: 145,
    words: [
      { zh: "櫻花街道", en: "cherry blossom street", slug: "sakura-street" },
      { zh: "夜晚都市", en: "night city", slug: "night-city" },
      { zh: "海邊夕陽", en: "seaside sunset", slug: "seaside-sunset" },
      { zh: "森林深處", en: "deep forest", slug: "deep-forest" },
      { zh: "教室", en: "classroom", slug: "classroom" },
      { zh: "雨中街景", en: "rainy street", slug: "rainy-street" },
      { zh: "星空草原", en: "starry sky meadow", slug: "starry-meadow" },
      { zh: "廢墟遺跡", en: "ancient ruins", slug: "ruins" }
    ]
  },
  /* ========== 人物小方向 ========== */
  {
    category: "髮型髮色",
    group: "人物小方向",
    icon: "💇",
    hue: 20,
    words: [
      { zh: "黑色長髮", en: "long black hair", slug: "long-black-hair" },
      { zh: "銀色長髮", en: "long silver hair", slug: "long-silver-hair" },
      { zh: "粉色雙馬尾", en: "pink twintails", slug: "pink-twintails" },
      { zh: "黑色短髮", en: "short black hair", slug: "short-black-hair" },
      { zh: "金色波浪捲", en: "wavy blonde hair", slug: "wavy-blonde" },
      { zh: "藍色鮑伯頭", en: "blue bob cut", slug: "blue-bob" },
      { zh: "白色編髮", en: "white braided hair", slug: "white-braid" },
      { zh: "漸層挑染", en: "gradient highlighted hair", slug: "gradient-hair" },
      { zh: "黑長髮藍髮尾", en: "black long hair with blue tips", slug: "black-hair-blue-tips" }
    ]
  },
  {
    category: "眼睛",
    group: "人物小方向",
    icon: "👁",
    hue: 235,
    words: [
      { zh: "藍色眼睛", en: "blue eyes", slug: "blue-eyes" },
      { zh: "紅色眼睛", en: "red eyes", slug: "red-eyes" },
      { zh: "金色眼睛", en: "golden eyes", slug: "golden-eyes" },
      { zh: "綠色眼睛", en: "green eyes", slug: "green-eyes" },
      { zh: "紫色眼睛", en: "purple eyes", slug: "purple-eyes" },
      { zh: "異色瞳", en: "heterochromia eyes", slug: "heterochromia" },
      { zh: "星光眼", en: "sparkling eyes", slug: "sparkling-eyes" },
      { zh: "藍色星空眼", en: "blue starry eyes", slug: "blue-starry-eyes" }
    ]
  },
  {
    category: "氣質特質",
    group: "人物小方向",
    icon: "✨",
    hue: 300,
    words: [
      { zh: "成熟優雅", en: "mature and graceful aura", slug: "mature-graceful" },
      { zh: "五官勻稱", en: "evenly balanced facial features", slug: "balanced-features" },
      { zh: "細緻曲線", en: "delicate curves", slug: "delicate-curves" }
    ]
  },
  {
    category: "表情",
    group: "人物小方向",
    icon: "😊",
    hue: 0,
    words: [
      { zh: "溫柔微笑", en: "gentle smile", slug: "gentle-smile" },
      { zh: "開朗大笑", en: "cheerful laugh", slug: "cheerful-laugh" },
      { zh: "害羞臉紅", en: "shy blushing", slug: "shy-blush" },
      { zh: "冷酷眼神", en: "cold stare", slug: "cold-stare" },
      { zh: "驚訝", en: "surprised expression", slug: "surprised" },
      { zh: "含淚", en: "teary eyes", slug: "teary-eyes" },
      { zh: "俏皮眨眼", en: "playful wink", slug: "playful-wink" },
      { zh: "睡意惺忪", en: "sleepy expression on her face", slug: "sleepy-expression" },
      { zh: "溫柔凝視", en: "soft and gentle gaze", slug: "gentle-gaze" }
    ]
  },
  {
    category: "服裝",
    group: "人物小方向",
    icon: "👗",
    hue: 180,
    words: [
      { zh: "水手服", en: "sailor school uniform", slug: "sailor-uniform" },
      { zh: "哥德蘿莉", en: "gothic lolita dress", slug: "gothic-lolita" },
      { zh: "和服", en: "traditional kimono", slug: "kimono" },
      { zh: "旗袍", en: "cheongsam dress", slug: "cheongsam" },
      { zh: "騎士鎧甲", en: "knight armor", slug: "knight-armor" },
      { zh: "魔法師長袍", en: "wizard robe", slug: "wizard-robe" },
      { zh: "休閒連帽衫", en: "casual hoodie", slug: "hoodie" },
      { zh: "禮服", en: "elegant evening gown", slug: "evening-gown" },
      { zh: "公主服", en: "princess dress", slug: "princess-dress" },
      { zh: "蕾絲白睡衣", en: "puffy pure white pajama with sleeves and edges decorated with lace", slug: "white-lace-pajama" }
    ]
  },
  {
    category: "動作姿勢",
    group: "人物小方向",
    icon: "🕺",
    hue: 95,
    words: [
      { zh: "回眸", en: "looking back over shoulder", slug: "looking-back" },
      { zh: "奔跑", en: "running pose", slug: "running" },
      { zh: "坐姿", en: "sitting pose", slug: "sitting" },
      { zh: "躺臥", en: "lying down", slug: "lying-down" },
      { zh: "伸手向前", en: "reaching out hand", slug: "reaching-out" },
      { zh: "持劍戰鬥", en: "sword fighting stance", slug: "sword-stance" },
      { zh: "跳躍", en: "jumping mid-air", slug: "jumping" },
      { zh: "坐在窗台", en: "sitting by the window", slug: "sitting-window" },
      { zh: "手捧魔法書", en: "holding a magic book in her hands", slug: "holding-book" }
    ]
  },
  {
    category: "隨身道具",
    group: "人物小方向",
    icon: "🔮",
    hue: 120,
    words: [
      { zh: "日月飾球", en: "a sun and a moon decorative orb surrounding by her side, orbs emitting a soft orange glow", slug: "sun-moon-orbs" },
      { zh: "魔法古書", en: "the book cover made of brown leather with four golden corners is opened and resting in her hands", slug: "magic-book" }
    ]
  },
  /* ========== 背景裝飾（輸出時排在最後） ========== */
  {
    category: "裝飾元素",
    group: "背景裝飾",
    icon: "🏛",
    hue: 30,
    words: [
      { zh: "巴洛克裝飾", en: "ornate elegance of Baroque decoration", slug: "baroque-decor" },
      { zh: "金色巴洛克邊框", en: "golden Baroque ornament border", slug: "baroque-border" },
      { zh: "星空石雕", en: "mystique of starry stone carvings", slug: "starry-stone-carving" },
      { zh: "天空石雕背景", en: "a sky stone-carved background", slug: "sky-stone-background" }
    ]
  }
];

