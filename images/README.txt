圖片使用方式
============

1. 將圖片放入 images 資料夾或其任意子資料夾。
2. 圖片檔名使用完整英文提示詞，例如：
   cel shading anime style, long black hair, sailor school uniform, jumping mid-air.jpg
3. 雙擊專案目錄內的 update-image-index.cmd，產生前端可搜尋的圖片索引。
4. 網頁會將已選詞的英文提示詞與檔名比對；只要檔名包含該提示詞就會顯示。
5. 一張圖片可同時包含多個提示詞，不需要複製到不同資料夾。

支援格式：jpg、jpeg、png、webp、gif、avif。

每次新增、移除或重新命名圖片後，請重新執行 update-image-index.cmd。

GitHub Pages：push 到 main 或 master 後，GitHub Actions 會自動重新建立索引並部署，
不需要先在本機執行 update-image-index.cmd。本機預覽時才需要執行它。
