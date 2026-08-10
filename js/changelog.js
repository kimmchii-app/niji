// 更新紀錄（點 header 的 📝 按鈕會顯示）
// 新的一筆請「加在最上面」，畫面就是照這個陣列順序由上往下排。
//
// 一筆的格式：
//   {
//     date: "2026-08-08",        // 必填，也是「有新更新」紅點的判斷依據，每筆不可重複
//     title: "這次做了什麼",      // 可留空
//     items: [
//       { type: "新增", text: "……" },   // type 可用：新增 / 修正 / 調整 / 移除（也可不寫 type，直接放字串）
//       "沒有標籤的一行說明"
//     ]
//   }
const CHANGELOG = [
  {
    date: "2026-08-10",
    title: "新增 profile 代碼與示範圖",
    items: [
      { type: "新增", text: "標題列多了 📝 更新紀錄按鈕，有沒看過的新內容時會亮紅點" },
      { type: "新增", text: "profile 清單加入代碼 34pk9rm（niji 7）" },
      { type: "新增", text: "補上 gdp2r21、lsepn76 的 niji 7 示範圖" },
      { type: "新增", text: "hf6inke、l68esp6、ppf62kp、8at6v7h、7esl2f8、y1wsufi、4iqc2f9 補上 niji 6 專用示範圖，切到 niji 6 模式也看得到參考圖了" },
      { type: "修正", text: "wpxxpyb 的示範圖之前放錯位置讀不到，現在選這個代碼就會顯示" },
      { type: "移除", text: "清掉根目錄沒在使用的測試圖檔" }
    ]
  }
];
