# 《千古遇》V1.2 朝夕相伴・角色陪伴系統

## 1. 已完成的功能

- 在原 `Hall.tsx` 首頁接入通用陪伴主視覺，不另建網站。65 位角色均可選擇；未持有鎖定、可查看，持有者免費無限更換，不修改收藏或墨玉。
- 首次已有角色顯示內嵌引導；無角色顯示友善空狀態與召喚入口。沒有自動發卡或自動替玩家選角。
- 選擇頁提供姓名搜尋、實際朝代、SSR/SS/S/R、持有狀態篩選、當前角色、返回首頁。使用 65 張原圖縮製的 WebP 縮圖（總計約 300 KiB）、lazy loading、content-visibility，不載入全員大圖。
- 首頁保留角色姓名、朝代、稀有度、稱號；點圖／鍵盤啟動對話，有輕微 CSS 回應與文字淡入，支援 reduced-motion。操作與對話皆在圖外，不蓋臉。
- 依裝置本地小時區分 05–10 晨／11–16 晝／17–20 暮／21–04 夜，初次顯示當期問候；每 30 秒及切回頁面更新，不要求位置權限。
- 正常點擊輪巡不重複；900ms 內第三次點擊觸發該角色專屬反應，2.5 秒冷卻，避免連點永遠卡同句。
- 緣分仍讀取原 `bondLevel(copies)`：0–2 初識／3–5 熟稔／6 情深。高階新增兩句，不影響原升階與獎勵；零階也有完整日常。
- 台詞採不涉及主線結局／告白的日常小事；高緣分也不假定已是戀人，無需越過主線進度。未改寫「待你撰寫」，不揭露月的身份。
- 陪伴旁的角色圖鑑與「書信」直達所選角色。非五位 SSR 同樣開啟該角色的空書信列表，明示尚未收錄，不偽造書信或獎勵。
- 舊 SSR 輪播不再一律標「本期天命」。實際抽卡邏輯沒有角色加成，召喚區如實寫「五位 SSR 同機率・無限定加成」，保留原機率／保底。
- 已依追加指示保留故事章節頁的純山水水墨場景，不放人物卡面或肖像；首頁陪伴圖不受影響。
- 單抽／十連、保底、機率、每日領取、故事與闖關、千年書信、設定音效、底部導覽、心聲、深宮皆保留。

## 2. 修改的檔案

新增：
- `src/components/game/Companion.tsx`：共用圖像降級、首頁互動、選角頁。
- `src/game/companion.ts`：合法持有校驗、時段、緣分語氣、輪巡與連點純函式。
- `src/game/companion-lines.ts`：65 人獨立台詞。
- `src/game/companion-art.ts`：獨立 companionImage 設定，不覆蓋既有角色圖片欄位。
- `src/game/companion.test.ts`：8 項全角色／時段／台詞／相容性測試。
- `scripts/companion-save-test.mjs`：隔離記憶體儲存，實測 Zustand 讀檔、重載、免費切換、書信帳本與 React SSR。
- `public/companion/thumbs/*.webp`：65 張原圖縮圖，沒有生成新臉。
- `docs/UI_V12_COMPANION.md`（本報告）。

修改：
- `src/components/game/Hall.tsx`、`GameApp.tsx`、`Letters.tsx`：接入陪伴、圖鑑、書信 filter。
- `src/game/store.ts`、`cloud-save.ts`：相容欄位／合法校驗／匯入匯出 schema。
- `src/styles.css`：陪伴手機樣式；故事純場景樣式。
- `src/components/game/StoryJourney.tsx`：依追加指示，章節頁改純山水場景。
- `package.json`：把 companion 測試加入原測試指令。

修改前備份：`/workspace/bak/qgy-new-pre-companion.tgz`。
和備份逐位元比較，下列核心檔案完全未改：角色資料、stories-extra、main-story、logic、bond、levels、match3、letters、rankup-lines、story-voice、wu/qi/tang-vn-script、shengong（陪伴修改未動上述檔案；後續父代理並行變更另計）。65 人及 5/10/20/30 稀有度、50 關／150 星、15 封書信、SSR 升階 1–5、eleven_v4／zh 語音設定保持原樣。未部署、未連線變更雲端、未重置真實玩家存檔。

## 3. 65 位台詞完成與圖片盤點

每人 **11 句**：初見、晨、晝、暮、夜、關心、調侃、溫柔、連點、熟稔、情深，共 **715 句**，全表無完全重複句。正常零階 8 句輪巡，另有連點反應；3 階增熟稔、6 階增情深。秦帝採原文「朕」；沒有女主對秦帝的錯誤稱呼或改動秦卷八《朕亦懼》。李白偏瀟灑詩趣、周泰寡言務實、甘寧爽朗鈴舟、陶淵明田園自嘲等；內容不是名稱替換。

圖片配置分離於台詞與存檔；順序：立繪 → 本人卡面 → 本人頭像 → 墨影佔位。載入錯誤亦逐級回退；將來只改該角色 companionImage.sprite 即可補圖。保持比例 object-fit:contain；不借用其他人物。

**已有立繪 1／只有卡面 64／只有頭像 0／無圖片 0**。所有實際配置檔案及縮圖存在；僅頭像和無圖片分支另以隔離 React SSR 資料測試。

|角色 ID|姓名|稀有度|朝代|台詞|資源狀態|優先圖片|
|---|---|---|---|---:|---|---|
|qin|秦始皇|SSR|秦|11|已有立繪|`/cg/prologue/qin.png`|
|zhouyu|周瑜|SSR|三國|11|只有卡面|`/portraits/zhouyu.jpg`|
|lanling|蘭陵王|SSR|北齊|11|只有卡面|`/portraits/lanling.jpg`|
|libai|李白|SSR|唐|11|只有卡面|`/portraits/libai.jpg`|
|liuche|劉徹|SSR|漢|11|只有卡面|`/portraits/liuche.jpg`|
|sima|司馬相如|SS|西漢|11|只有卡面|`/portraits/sima.jpg`|
|zhuge|諸葛亮|SS|蜀漢|11|只有卡面|`/portraits/zhuge.jpg`|
|huo|霍去病|SS|西漢|11|只有卡面|`/portraits/huo.jpg`|
|caocao|曹操|SS|漢末|11|只有卡面|`/portraits/caocao.jpg`|
|lishimin|李世民|SS|唐|11|只有卡面|`/portraits/lishimin.jpg`|
|nalan|納蘭性德|SS|清|11|只有卡面|`/portraits/nalan.jpg`|
|panan|潘安|SS|西晉|11|只有卡面|`/portraits/panan.jpg`|
|songyu|宋玉|SS|戰國|11|只有卡面|`/portraits/songyu.jpg`|
|luyou|陸游|SS|南宋|11|只有卡面|`/portraits/luyou.jpg`|
|sushi|蘇軾|S|北宋|11|只有卡面|`/portraits/sushi.jpg`|
|zhaoyun|趙雲|SS|蜀漢|11|只有卡面|`/portraits/zhaoyun.jpg`|
|hanxin|韓信|S|西漢|11|只有卡面|`/portraits/hanxin.jpg`|
|dufu|杜甫|S|唐|11|只有卡面|`/portraits/dufu.jpg`|
|yuefei|岳飛|S|南宋|11|只有卡面|`/portraits/yuefei.jpg`|
|wangwei|王維|S|唐|11|只有卡面|`/portraits/wangwei.jpg`|
|xinqiji|辛棄疾|S|南宋|11|只有卡面|`/portraits/xinqiji.jpg`|
|baijuyi|白居易|R|唐|11|只有卡面|`/portraits/baijuyi.jpg`|
|tao|陶淵明|R|東晉|11|只有卡面|`/portraits/tao.jpg`|
|dumu|杜牧|R|唐|11|只有卡面|`/portraits/dumu.jpg`|
|meng|孟浩然|R|唐|11|只有卡面|`/portraits/meng.jpg`|
|wangchangling|王昌齡|R|唐|11|只有卡面|`/portraits/wangchangling.jpg`|
|machao|馬超|R|三國|11|只有卡面|`/portraits/machao.jpg`|
|zhoutai|周泰|R|三國|11|只有卡面|`/portraits/zhoutai.jpg`|
|luxun|陸遜|R|三國|11|只有卡面|`/portraits/luxun.jpg`|
|jiangwei|姜維|R|蜀漢|11|只有卡面|`/portraits/jiangwei.jpg`|
|shaonianchanggong|少年長恭|R|北齊|11|只有卡面|`/portraits/shaonianchanggong.jpg`|
|xielingyun|謝靈運|R|南朝|11|只有卡面|`/portraits/xielingyun.jpg`|
|luobinwang|駱賓王|R|唐|11|只有卡面|`/portraits/luobinwang.jpg`|
|chenziang|陳子昂|R|唐|11|只有卡面|`/portraits/chenziang.jpg`|
|censhen|岑參|R|唐|11|只有卡面|`/portraits/censhen.jpg`|
|weiyingwu|韋應物|R|唐|11|只有卡面|`/portraits/weiyingwu.jpg`|
|wangbo|王勃|R|唐|11|只有卡面|`/portraits/wangbo.jpg`|
|hezhizhang|賀知章|R|唐|11|只有卡面|`/portraits/hezhizhang.jpg`|
|wangzhihuan|王之渙|R|唐|11|只有卡面|`/portraits/wangzhihuan.jpg`|
|gaoshi|高適|R|唐|11|只有卡面|`/portraits/gaoshi.jpg`|
|liuyuxi|劉禹錫|R|唐|11|只有卡面|`/portraits/liuyuxi.jpg`|
|yuanzhen|元稹|R|唐|11|只有卡面|`/portraits/yuanzhen.jpg`|
|liuzongyuan|柳宗元|R|唐|11|只有卡面|`/portraits/liuzongyuan.jpg`|
|lihe|李賀|R|唐|11|只有卡面|`/portraits/lihe.jpg`|
|zhangruoxu|張若虛|R|唐|11|只有卡面|`/portraits/zhangruoxu.jpg`|
|cuihao|崔顥|R|唐|11|只有卡面|`/portraits/cuihao.jpg`|
|qinguan|秦觀|R|北宋|11|只有卡面|`/portraits/qinguan.jpg`|
|huangtingjian|黃庭堅|R|北宋|11|只有卡面|`/portraits/huangtingjian.jpg`|
|yanjiandao|晏幾道|R|北宋|11|只有卡面|`/portraits/yanjiandao.jpg`|
|ganning|甘寧|R|三國|11|只有卡面|`/portraits/ganning.jpg`|
|taishici|太史慈|R|東漢|11|只有卡面|`/portraits/taishici.jpg`|
|xiangyu|項羽|S|秦末|11|只有卡面|`/portraits/xiangyu.jpg`|
|lvbu|呂布|S|東漢|11|只有卡面|`/portraits/lvbu.jpg`|
|weiqing|衛青|S|西漢|11|只有卡面|`/portraits/weiqing.jpg`|
|quyuan|屈原|S|戰國|11|只有卡面|`/portraits/quyuan.jpg`|
|liyu|李煜|S|南唐|11|只有卡面|`/portraits/liyu.jpg`|
|liuxiu|劉秀|S|東漢|11|只有卡面|`/portraits/liuxiu.jpg`|
|sunce|孫策|S|東漢|11|只有卡面|`/portraits/sunce.jpg`|
|caozhi|曹植|S|三國|11|只有卡面|`/portraits/caozhi.jpg`|
|wentingyun|溫庭筠|S|唐|11|只有卡面|`/portraits/wentingyun.jpg`|
|zhaozhen|趙禎|S|北宋|11|只有卡面|`/portraits/zhaozhen.jpg`|
|lishangyin|李商隱|S|唐|11|只有卡面|`/portraits/lishangyin.jpg`|
|wanganshi|王安石|S|北宋|11|只有卡面|`/portraits/wanganshi.jpg`|
|ouyangxiu|歐陽修|S|北宋|11|只有卡面|`/portraits/ouyangxiu.jpg`|
|liuyong|柳永|S|北宋|11|只有卡面|`/portraits/liuyong.jpg`|

## 4. 存檔相容與回歸結果

- 新增 `companionId: string | null`、`companionGuideDone: boolean`，沿用原 qiangu-yu v4 persist merge；舊檔安全預設 null/false，不改存檔 key、不清資料。
- 全量 snapshot 匯入匯出納入這兩欄；舊 snapshot 無欄位時不會憑空設角，回到空席，可重新選擇。舊精簡 applyCloud 保留本地選角但重新校驗持有；若不再持有則清空。
- 隔離測試已通過：v0/v3/v4 舊檔載入；SSR/R 免費反覆切換；未持有／不存在／非有限持有數拒絕；重載保留選角與完成引導；無效／失去持有時清空。
- 書信隔離實測：讀取 → 回覆 +20 → 重載 → 再回覆 +0，原 choice／completed 帳本保留；舊 snapshot 不能重領。
- `npm run typecheck`：陪伴整合完成時通過。最後再次檢查時，並行新增的 `Match3.tsx` 第 1 行引入不存在的 `./Raid`，造成 TS2307；此非陪伴修改，需父代理完成該模組後重跑。
- `npm run build:dev`：陪伴整合完成時通過；當時只有現有第三方 bundle 警告。最後再次 build 同樣受並行新增的 `./Raid` 缺檔影響而失敗。沒有執行帶 db:migrate 的 build，也沒有部署。
- 針對陪伴、書信、升階、角色池、每日、三消、五朝主線、cloud、頭像、助陣的測試 **68/68 通過**。
- 全部 game 測試 **219 項，216 通過，3 項原有失敗**：SS/S/R 物語原稿一致性、情話其二原稿一致性、行書字型缺字。已從修改前備份抽出原檔重跑對應 21 項，同樣只有這 3 項失敗；未為消除舊失敗擅改故事或情話。
- React SSR 已實際渲染全 65 人圖片、僅頭像、無圖墨影、無收藏空狀態、首次引導、R 角色首頁，全部通過。這不是瀏覽器畫面測試。
- 測試命令：`node --experimental-strip-types --test src/game/companion.test.ts`、`node scripts/companion-save-test.mjs`、`node --experimental-strip-types --test src/game/*.test.ts`。
- 完整 game 結果：`/workspace/qgy-v12-game-tests.log`；備份對照：`/workspace/qgy-v12-baseline-tests.log`。

## 5. 手機版結果與待驗項目

已落實：360/390/430 流式寬度、固定高度圖像容器、圖片 contain 不裁臉不拉伸、對話在圖外且與底部導覽分離、44px 觸控目標、兩欄篩選、列表單一滾動區、固定圖片尺寸防版面跳動、lazy 縮圖、鍵盤 Escape／Tab 焦點圈限與返回焦點、reduced-motion。

**目前只完成樣式與程式檢查，不能聲稱 360/390/430 的瀏覽器實測或無溢出已通過。** 本執行環境沒有可委派的瀏覽器工具；遵守 box-desktop 規定，未用 Shell／Playwright／CDP 另行繞過。父代理可透過允許的瀏覽器工具補驗本地 `http://localhost:8080`（已有本地開發服務）。

待補截圖目錄：`/workspace/bg/home-screenshots/`，檔名 `ui-v12-*.png`。尚未生成這些截圖；請以隔離測試 context／測試存檔操作，勿改真實玩家存檔。

待驗清單：
1. `ui-v12-home-360.png`、`home-390.png`、`home-430.png`：已持有角色首頁、臉不遮、無水平捲動。
2. `ui-v12-empty.png`：隔離空收藏；`ui-v12-picker.png`：65 人列表、篩選、未持有不能選、已持有一鍵切換。
3. `ui-v12-dialogue.png`：點擊輪巡與短時間三連點。
4. `ui-v12-letters.png`：該角色書信 filter；另看 R 角色尚未收錄空狀態。
5. 手動點每日、單抽／十連、機率、圖鑑、三消、故事分頁、深宮、設定、底部導覽與心聲，確認原流程可用。

## 6. 尚未完成與原因

- **最後全專案型別／build 待並行的 Raid 模組完成後重跑**：`Match3.tsx` 新引入 `./Raid`，當時不存在該檔案。未擅自移除父代理新增的討伐入口。
- **瀏覽器端手機實測與截圖待父代理補驗**，原因如上。未把 SSR 渲染與 CSS 靜態檢查冒稱為手機驗收。
- 其餘 64 人專屬立繪仍是原有美術缺口；依指示已完整交付卡面回退，不阻擋陪伴，不需等補圖。
- 沒有增加劇透型進度解鎖情話：本版 715 句全部以不劇透日常為範圍，高緣分只改親近程度，不越權宣告戀人關係。
