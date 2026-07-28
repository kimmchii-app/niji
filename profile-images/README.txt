Profile 示範圖資料夾
====================

把每個 profile 代碼的示範圖放這裡。
檔名 = 代碼 + niji 版本後綴，副檔名限 png：

  profile-images/<代碼>-n7.png   ← niji 7 的示範圖
  profile-images/<代碼>-n6.png   ← niji 6 的示範圖

版本後綴跟著「網頁上目前選的 niji 模式」走（未選 niji 版本時預設當作 n7）。
例如選了 niji 6，就會去找 <代碼>-n6.png；未選或選 niji 7，就找 <代碼>-n7.png。

單張：
  profile-images/5gl4zk5-n7.png

多張（一個代碼多張，例如一男一女）：用連續編號
  profile-images/o54hkwn-n7.png       ← 第 1 張
  profile-images/o54hkwn-n7(1).png    ← 第 2 張
  profile-images/o54hkwn-n7(2).png    ← 第 3 張
  ...

規則：
- 檔名 = 純代碼 + -n6 / -n7（不要帶 --p / --profile），限 png。
- 多張要「連續」編號：base → (1) → (2)…；中間缺號會停在缺口之前。
- 顯示順序 = 編號順序（base、(1)、(2)…），你可用它控制男女先後。
- 相容 Windows 複製產生的空格版：o54hkwn-n7 (1).png 也讀得到。
- 同一個代碼可分別放 -n6 與 -n7 兩套圖，切換 niji 模式時各自顯示。
- 在網頁選取某個 profile 後，這些圖會出現在右側「參考圖輪播」，可用上一張/下一張切換。
- 不用跑任何腳本，放檔即讀（找不到就自動略過，不會報錯）。
