// 內建 Profile 組合（可手動編輯這一份）
// 「組合」分頁會列出這裡的每一筆，點一下就整組套用（會取代目前已選的 profile 代碼）。
//
// 一筆的格式：
//   {
//     name: "組合名稱",        // 必填，顯示在清單上
//     desc: "一句話說明",      // 可留空，顯示為第二行小字
//     codes: ["代碼1", "代碼2"] // 必填，至少一個
//   }
//
// 規則：
// - codes 裡的代碼「必須」是 js/profile-defaults.js 裡有的，否則清單會標成失效、無法套用。
// - 不用寫 niji 版本，程式會從成員代碼自動判斷：
//   成員全部來自 DEFAULT_PROFILE_CODES_NIJI6 → 這組在 niji 6 與 niji 7 模式都看得到；
//   只要有一個是 niji 7 專用代碼 → 這組在 niji 6 模式會自動隱藏。
// - 想讓組合在 niji 6 模式也有預覽圖，記得 profile-images/ 要有對應的 <代碼>-n6.png。
// - 順序 = 清單由上往下的顯示順序。
const PROFILE_COMBOS = [
  {
    name: "範例組合一",
    desc: "先把這幾筆改成你自己的搭配",
    codes: ["5gl4zk5", "o54hkwn", "63u1jhs"]
  },
  {
    name: "範例組合二",
    desc: "名稱、說明、代碼都可以自由改",
    codes: ["2swp911", "bmu2byk", "baqkotl"]
  },
  {
    name: "niji 6 範例",
    desc: "成員全是 niji 6 代碼，切到 niji 6 模式也看得到",
    codes: ["hf6inke", "l68esp6", "ppf62kp"]
  }
];
