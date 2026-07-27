// 系統預設 Profile 代碼（可手動編輯這一份）
// 拆自原 data.js；新增/刪除預設就改這個陣列即可。

// 系統預設 Profile 代碼（內建、不可刪除，永遠顯示於清單最上方）
// 以下這份皆為 niji 7 專用（只在選擇 niji 7 時顯示）。
// 排版：一行一個代碼，要把某個代碼改成 niji 6 時，整行剪下貼到下方 NIJI6 陣列即可。
const DEFAULT_PROFILE_CODES = [
  "5gl4zk5",
  "o54hkwn",
  "63u1jhs",
  "2swp911",
  "jw8kgnl",
  "y9k181p",
  "m3lxzwh",
  "ekzteke",
  "wpxxpyb",
  "hf6inke",
  "bmu2byk",
  "ohyovyd",
  "fpkfmfy",
  "baqkotl",
  "qrvk33o",
  "ec7l5gl",
  "jlf746n",
  "zk31miy",
  "vcv72vk",
  "jcskncz",
  "l68esp6",
  "ppf62kp",
  "8at6v7h",
  "7esl2f8",
  "ek2tnqd",
  "y1wsufi",
  "4iqc2f9",
  "6ow8ajm",
  "2mtd7tn",
  "x518rci",
  "dxvak5s",
  "gdp2r21",
  "ezovfk9",
  "1bbxsrf",
  "l8lusxc",
  "fn6tpog",
  "bbzobez",
  "xdtedvz",
  "63jh7rr",
  "wzvoi25",
  "49vqoiw",
  "dnl5yd1",
  "ctua3hc",
  "4m3w183",
  "5svf2da",
  "keuxdic",
  "iclqdna",
  "bheikqs",
  "2ccncmd",
  "u9hzec7",
  "le5ugi1",
  "1opk2ka",
  "81q9z3q",
  "kao1p38",
  "24ib5sr",
  "xcox1uc"
];

// niji 6 專用預設 Profile 代碼（可用於 niji 6 與 niji 7；取得後貼入此陣列即可）
// 排版：一行一個代碼。要把上方 niji 7 的代碼改成 niji 6，就整行搬到這裡，例如：
//   "5gl4zk5",
const DEFAULT_PROFILE_CODES_NIJI6 = [
    "rft3rt5",
    "gj5hjlq",
    "w2knirk",
    "rg5qzsm",
    "615e51x",
    "1xhhevy",
    "olyycd3",
    "dfbb441",
    "jra11qf",
    "prdtrp5",
    "y4mxttl",
    "2twrvmr",
    "rcmcn68",
    "cxzcehi",
    "9mpkqzb",
    "3dwfhqq",
    "cxbyud6",
];

// 內建預設顯示名稱（代碼 -> 顯示名稱）
// 清單與示範圖說明會顯示這個名稱、下方仍附上 --p 代碼。
// 使用者若在網頁上自行改名（✏️），會覆蓋這裡的預設值。
const DEFAULT_PROFILE_ALIASES = {
  "y4mxttl": "moodboard y4mxttl",
  "9mpkqzb": "moodboard 9mpkqzb",
  "3dwfhqq": "moodboard 3dwfhqq"
};
