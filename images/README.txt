參考圖片放置方式
================

1. 在 images 資料夾內，依「詞的英文代號 (slug)」建立子資料夾
2. 圖片檔名用數字命名：1.jpg、2.jpg、3.jpg ...（支援 jpg / png / webp）
3. 編號請連續，網頁會從 1 開始依序載入，遇到缺號就停止
4. 每個詞最多顯示 12 張

範例：
  images/sakura-street/1.jpg   ← 「櫻花街道」的第 1 張參考圖
  images/sakura-street/2.png
  images/gentle-smile/1.webp   ← 「溫柔微笑」的第 1 張參考圖

每個詞對應的資料夾名稱（slug）可以在 js/data.js 裡查到，
也可以在網頁上選詞後，看圖片區占位卡顯示的路徑提示。

新增自訂提示詞：直接編輯 js/data.js，照現有格式加入即可。
