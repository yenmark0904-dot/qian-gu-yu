# 命器召喚（階段 D）交付說明

## 範圍
- 在既有《千古遇》加入獨立命器池，不混入或改價角色召喚。
- 第 5 關通關開放；舊玩家從既有星級自動判斷，故事解鎖規則不變。
- 沿用 `artifacts.ts` 的 15 件專屬與 12 件通用命器名稱、ID、原技能與圖片欄位。
- 本工作不修改主線／深宮的助陣數量、Boss、關卡、角色技能或語音；其他工作流的戰鬥改版不在這份交付內。

## 經濟設定與定向
唯一設定檔：`src/game/artifact-summon-config.ts`。
- 單抽 150 墨玉；十連 1,350 墨玉。
- 基礎 SSR 3%、SS 12%、S 35%、R 50%；同稀有度內均分。
- 距上次 SS 以上最多 10 抽，距上次 SSR 最多 60 抽。
- 定向 SSR 最多 120 抽、定向 SS 最多 40 抽；只計目前定向稀有度，兩種進度分開保存，切換／取消不清空。
- 自然抽中目前定向目標或定向保證兌現時，僅該稀有度的定向計數歸零。
- 通常將將要同時到期的 SS 定向提前一抽兌現；若切換目標造成恰好同抽到期，保留 SSR 並免費補發定向 SS，不另扣款、不增加付費抽次、不額外推進保底。
- 後續若增加免費召喚券，應呼叫同一交易層並共用保底；這版沒有新增券或付費貨幣。

## 重複命器／精華
依後續最新需求，重複抽中的「新副本」轉成 1 份命器精華（份數集中於設定）。
不移除任何既有庫存，尤其不碰已鎖定或已裝備實體；先前存檔中的複數實體仍保留。
精華目前只累積與展示，尚未開放額外養成／外觀消耗；不影響緣分。

## 原子存檔與重看
`pullArtifact` 在演出開始前，同次保存墨玉、命器實體、精華、全部保底、定向、抽次、花費與紀錄。
演出、略過、關閉及重看只讀結果，不再抽獎或發放。
召喚按鈕在揭曉期間鎖定；儲存空間錯誤時回復記憶體交易、不顯示未保存結果。
沿用 `qiangu-yu`，存檔版本 4→5 為增補欄位；雲端 snapshot 同樣保留命器召喚資料。
保留最近 200 筆結果，畫面顯示最近 100 筆；累計消耗、抽次與保底不隨紀錄裁切歸零，避免突破既有雲端 64 KB 上限。

## 宮門牽緣
- `Opening`／`PalaceGate`／`Performance` 為角色與命器共用。
- 已讀取使用者附的「千古遇・宮門牽緣」HTML，移植其 canvas 微墨滴、非規則暈染、低對比水波及「一墨落，千年逢」。
- 沿用與附件同構的宮門背景（現有 WebP 為同幅圖片壓縮版）；SSR 開門與各稀有度節奏共用。
- 不加入附件的展示稀有度、上傳圖片、重新準備、展示狀態等測試控制。
- 命器只有自己的圖片／共用占位圖，不挪用角色卡面或 CG；缺圖自動回退。
- 精簡與系統降低動態偏好會略過 canvas；canvas 每秒最多 30 幀、像素倍率最多 1.5，離開即清理。

## 命器圖鑑／淬鍊
沿用完整 27 件命器圖鑑。材料頁增加命器精華。
新增「淬鍊預覽」：選擇持有實體、查看目前／下一級通用能力和四種材料現有庫存／來源。
此處明確標示尚未接通，不虛扣材料、不假升級。實際消耗、討伐掉落、精華用途與覺醒仍是後續工作。

## 回復版本
`/workspace/qgy-stage-d-backup-20261107.tar.gz`：修改前的 src、package.json、scripts；沒有提交、推送或合併。
不要將整個備份覆蓋回去而蓋掉平行戰鬥工作的變更；回復本工作時請按文件逐一對照。

## 驗證
- `npm run test:artifact-summon`：抽率、單／十抽、保底、定向、碰撞保證、精華、保護鎖定／裝備、舊存檔、refresh、儲存失敗回復、兩種召喚的 React 標記、canvas 有限座標等。
- `node --experimental-strip-types scripts/artifact-summon-simulate.mts`：三情境各 100,000 抽，報告 `docs/STAGE_D_SUMMON_SIMULATION.json`；逐抽檢查所有期限，未發現超限。
- React DOM-free 渲染審查不是瀏覽器截圖或手機實機操作驗證；不得把它當成完整視覺 QA。
- 全套既有 npm test 存在模板資源缺失／品牌測試期望不符；獨立遊戲套件有兩筆既有曹操「我／孤」原文差異，沒有修改故事去遷就測試。

## 本工作修改／新增檔案
- src/game/artifact-summon-config.ts
- src/game/artifact-summon-state.ts
- src/game/artifact-summon.ts
- src/game/artifact-summon.test.ts
- src/game/summon-ink.ts
- src/game/summon-ink.test.ts
- src/game/artifacts.ts（只移除會在讀檔丟失有效命器的 300 件上限）
- src/game/store.ts（新增召喚交易、定向、版本 5 與增補遷移）
- src/game/cloud-save.ts（增補命器召喚 snapshot 欄位）
- src/game/summon-reveal.ts（共用附件演出註解）
- src/components/game/ArtifactSummon.tsx
- src/components/game/ArtifactRefine.tsx
- src/components/game/SummonInkPrelude.tsx
- src/components/game/SummonStage.tsx
- src/components/game/ArtifactHall.tsx
- src/components/game/Hall.tsx（命器閣入口說明含召喚）
- src/components/game/artifacts.css
- src/components/game/summon.css
- scripts/artifact-summon-save-test.mjs
- scripts/artifact-summon-render-test.mjs
- scripts/artifact-summon-simulate.mts
- package.json（測試指令）
- docs/STAGE_D_MINGQI_SUMMON.md
- docs/STAGE_D_SUMMON_SIMULATION.json
- /workspace/startup.sh（不存在時才建立的本地啟動契約）
