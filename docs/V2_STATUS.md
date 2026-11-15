# 《千古遇》V2.0 階段 A／B 狀態報告

更新：2026-11-07（台北時間）。本檔區分「已實作」與「尚未實作」，不把規劃寫成已完成。

## 可回復版本
- 備份：`/workspace/bak/qgy-new-pre-v2.tgz`（約 46 MB，533 個檔案；含 `src/`、`public/`、`scripts/`、`docs/`、設定檔；不含 `node_modules`、`.git`、`dist`、`.vercel`）。
- 還原：`tar -xzf /workspace/bak/qgy-new-pre-v2.tgz -C /workspace`。
- 存檔 key 仍為 `qiangu-yu`，persist 版本維持 4；命器為**追加欄位**，舊存檔由 `merge` 自動補上，不清除任何既有欄位。

## 階段 A：既有系統檢查

| 項目 | 狀態 | 實際程式 |
|---|---|---|
| 65 位角色（SSR 5／SS 10／S 20／R 30） | 已實作 | `src/game/data.ts` `CHARACTERS` |
| 65 人助陣技能 | 已實作（本次未改動） | `src/game/skills.ts`：R 共用三種（r-poet 吟哦／r-brush 潤筆／r-vanguard 先登），S、SS、SSR 各自獨立 |
| 緣分 0–6 階（壹 0–2／貳 3–5／參 6 定情），只靠重複卡 | 已實作 | `bond.ts`（每 5 張重複升 1 階）、`skills.ts skillStep`、`assist.ts chargeCost`（貳 ×0.92、參 ×0.84 蓄力） |
| 角色召喚、50 抽 SSR 保底、圖鑑、墨玉 | 已實作（本次未改動價格與機率） | `logic.ts`、`store.ts pull`、`Codex.tsx` |
| 7×8 三消、50 關／150 星、主線故事解鎖 | 已實作 | `match3.ts`、`levels.ts`、`main-story.ts` |
| 深宮・無盡晉封塔 | 已實作 | `shengong.ts`、`Shengong.tsx`（沿用同一個 `Game` 元件） |
| 刻玉（橫／直）、金鑲玉、龍珠、墨封、冰封 | 已實作 | `match3.ts`（seal 1 = 墨封，2 = 墨封＋冰封） |
| V1.3 墨厄討伐「噬墨之影」 | **部分實作** | `raid.ts`、`Raid.tsx`、`raid.css` |
| 劇情特殊三消 | **未實作**（程式中不存在） | — |
| 雲端存檔 | 已實作 | `cloud-save.ts` `Snapshot`（本次追加 `artifacts`） |

### V1.3 討伐已有
5000 HP、20 步、三人助陣各自蓄力（只由玩家移動回充，每回合上限 22）、每 3 次有效移動反擊（墨封＋護盾 95）、HP 低於 50% 二階加冰封、封印上限 10、全隊加步上限 12、雙人連攜（240 傷害／削盾 100，目前文案為「天命連攜」）、三人「天命共鳴」（520／削盾 220）、首勝 300 墨玉（最多 +50%，重複勝利 0）、CSS 墨影受擊與 cut-in、略過／省電模式。

### V2.0 討伐仍缺少
雙人連攜名稱「墨痕共鳴」、材料掉落、普通／精英／首領封印三種難度、多階段首領、命器在討伐中生效、護盾削減的命器效果、第 10／20／40 關解鎖門檻（目前討伐入口未設關卡門檻）、正式 Boss 美術、討伐命器傷害換算。

## 階段 B：命器基礎（已實作）
- 資料：`src/game/artifacts.ts` — 27 種命器、材料、存檔模型、裝備／卸下／轉移、解鎖門檻、首開贈禮。
- 共用效果引擎：`src/game/artifact-engine.ts` — 主線與深宮已接上；討伐、劇情三消與未來模式可呼叫同一組 `startArtifactRun / artifactCast / artifactMove`。
- 介面：`src/components/game/ArtifactHall.tsx`、`artifacts.css`；大廳入口「命器閣」；三消助陣列顯示所戴命器與專屬是否相契。
- 測試：`src/game/artifacts.test.ts`（19 項）、`scripts/artifact-save-test.mjs`、`scripts/artifact-ui-test.mjs`。

### 15 位專屬命器原主人（角色 ID）
| 角色 | ID | 原技能 ID／名稱 | 命器 |
|---|---|---|---|
| 嬴政（資料顯示名「秦始皇」） | `qin` | qin／橫掃六合 | 六合玄璽 |
| 周瑜 | `zhouyu` | zhouyu／火燒赤壁 | 赤壁古琴 |
| 蘭陵王 | `lanling` | lanling／入陣曲 | 戰鬼金面 |
| 李白 | `libai` | libai／斗酒詩百篇 | 太白醉月壺 |
| 劉徹 | `liuche` | liuche／金屋藏嬌 | 金屋鳳釵 |
| 司馬相如 | `sima` | sima／鳳求凰 | 綠綺 |
| 諸葛亮 | `zhuge` | zhuge／草船借箭 | 臥龍羽扇 |
| 霍去病 | `huo` | huo／封狼居胥 | 封狼銀槍 |
| 曹操 | `caocao` | caocao／挾令諸侯 | 魏武虎符 |
| 李世民 | `lishimin` | lishimin／貞觀之治 | 貞觀龍璽 |
| 納蘭性德 | `nalan` | nalan／人生若只如初見 | 憶雪端硯 |
| 潘安 | `panan` | panan／擲果盈車 | 洛陽香囊 |
| 宋玉 | `songyu` | songyu／高唐神女 | 巫山雲佩 |
| 陸游 | `luyou` | luyou／鐵馬冰河 | 鐵馬寒鋒 |
| 趙雲 | `zhaoyun` | zhaoyun／七進七出 | 龍膽銀槍 |

完整 27 件效果表見 `docs/V2_MINGQI_CATALOG.md`。

## 待後續階段
階段 C 完整專屬演出、D 命器召喚（機率／保底／價格待確認）、E 討伐擴充與命器接入討伐、F「墨痕共鳴」更名與連攜上限、G 戰鬥動畫、H 材料掉落與淬鍊升級、I 精英／首領封印／命器共鳴／覺醒演出、J 圖鑑命器欄位、經濟模擬與全回歸。
