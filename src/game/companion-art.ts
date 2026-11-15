/** Existing assets only. Add a sprite here to upgrade art without touching dialogue or saves. */
export type CompanionImage = {
  sprite?: string | null;
  card?: string | null;
  avatar?: string | null;
  thumbnail?: string | null;
};
export type CompanionArtKind = "sprite" | "card" | "avatar" | "silhouette";
export const COMPANION_ART: Record<string, { companionImage: CompanionImage }> = {
  qin: {
    companionImage: {
      sprite: "/cg/prologue/qin.png?v=20",
      card: "/portraits/qin.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/qin.webp",
    },
  },
  zhouyu: {
    companionImage: {
      sprite: "/sprites/zhouyu.png?v=20",
      card: "/portraits/zhouyu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhouyu.webp",
    },
  },
  lanling: {
    companionImage: {
      sprite: "/sprites/lanling.png?v=20",
      card: "/portraits/lanling.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/lanling.webp",
    },
  },
  libai: {
    companionImage: {
      sprite: "/sprites/libai.png?v=20",
      card: "/portraits/libai.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/libai.webp",
    },
  },
  liuche: {
    companionImage: {
      sprite: "/sprites/liuche.png?v=20",
      card: "/portraits/liuche.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liuche.webp",
    },
  },
  sima: {
    companionImage: {
      sprite: null,
      card: "/portraits/sima.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/sima.webp",
    },
  },
  zhuge: {
    companionImage: {
      sprite: null,
      card: "/portraits/zhuge.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhuge.webp",
    },
  },
  huo: {
    companionImage: {
      sprite: null,
      card: "/portraits/huo.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/huo.webp",
    },
  },
  caocao: {
    companionImage: {
      sprite: null,
      card: "/portraits/caocao.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/caocao.webp",
    },
  },
  lishimin: {
    companionImage: {
      sprite: null,
      card: "/portraits/lishimin.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/lishimin.webp",
    },
  },
  nalan: {
    companionImage: {
      sprite: null,
      card: "/portraits/nalan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/nalan.webp",
    },
  },
  panan: {
    companionImage: {
      sprite: null,
      card: "/portraits/panan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/panan.webp",
    },
  },
  songyu: {
    companionImage: {
      sprite: null,
      card: "/portraits/songyu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/songyu.webp",
    },
  },
  luyou: {
    companionImage: {
      sprite: null,
      card: "/portraits/luyou.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/luyou.webp",
    },
  },
  sushi: {
    companionImage: {
      sprite: null,
      card: "/portraits/sushi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/sushi.webp",
    },
  },
  zhaoyun: {
    companionImage: {
      sprite: null,
      card: "/portraits/zhaoyun.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhaoyun.webp",
    },
  },
  hanxin: {
    companionImage: {
      sprite: null,
      card: "/portraits/hanxin.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/hanxin.webp",
    },
  },
  dufu: {
    companionImage: {
      sprite: null,
      card: "/portraits/dufu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/dufu.webp",
    },
  },
  yuefei: {
    companionImage: {
      sprite: null,
      card: "/portraits/yuefei.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/yuefei.webp",
    },
  },
  wangwei: {
    companionImage: {
      sprite: null,
      card: "/portraits/wangwei.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wangwei.webp",
    },
  },
  xinqiji: {
    companionImage: {
      sprite: null,
      card: "/portraits/xinqiji.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/xinqiji.webp",
    },
  },
  baijuyi: {
    companionImage: {
      sprite: null,
      card: "/portraits/baijuyi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/baijuyi.webp",
    },
  },
  tao: {
    companionImage: {
      sprite: null,
      card: "/portraits/tao.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/tao.webp",
    },
  },
  dumu: {
    companionImage: {
      sprite: null,
      card: "/portraits/dumu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/dumu.webp",
    },
  },
  meng: {
    companionImage: {
      sprite: null,
      card: "/portraits/meng.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/meng.webp",
    },
  },
  wangchangling: {
    companionImage: {
      sprite: null,
      card: "/portraits/wangchangling.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wangchangling.webp",
    },
  },
  machao: {
    companionImage: {
      sprite: null,
      card: "/portraits/machao.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/machao.webp",
    },
  },
  zhoutai: {
    companionImage: {
      sprite: null,
      card: "/portraits/zhoutai.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhoutai.webp",
    },
  },
  luxun: {
    companionImage: {
      sprite: null,
      card: "/portraits/luxun.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/luxun.webp",
    },
  },
  jiangwei: {
    companionImage: {
      sprite: null,
      card: "/portraits/jiangwei.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/jiangwei.webp",
    },
  },
  shaonianchanggong: {
    companionImage: {
      sprite: null,
      card: "/portraits/shaonianchanggong.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/shaonianchanggong.webp",
    },
  },
  xielingyun: {
    companionImage: {
      sprite: null,
      card: "/portraits/xielingyun.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/xielingyun.webp",
    },
  },
  luobinwang: {
    companionImage: {
      sprite: null,
      card: "/portraits/luobinwang.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/luobinwang.webp",
    },
  },
  chenziang: {
    companionImage: {
      sprite: null,
      card: "/portraits/chenziang.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/chenziang.webp",
    },
  },
  censhen: {
    companionImage: {
      sprite: null,
      card: "/portraits/censhen.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/censhen.webp",
    },
  },
  weiyingwu: {
    companionImage: {
      sprite: null,
      card: "/portraits/weiyingwu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/weiyingwu.webp",
    },
  },
  wangbo: {
    companionImage: {
      sprite: null,
      card: "/portraits/wangbo.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wangbo.webp",
    },
  },
  hezhizhang: {
    companionImage: {
      sprite: null,
      card: "/portraits/hezhizhang.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/hezhizhang.webp",
    },
  },
  wangzhihuan: {
    companionImage: {
      sprite: null,
      card: "/portraits/wangzhihuan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wangzhihuan.webp",
    },
  },
  gaoshi: {
    companionImage: {
      sprite: null,
      card: "/portraits/gaoshi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/gaoshi.webp",
    },
  },
  liuyuxi: {
    companionImage: {
      sprite: null,
      card: "/portraits/liuyuxi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liuyuxi.webp",
    },
  },
  yuanzhen: {
    companionImage: {
      sprite: null,
      card: "/portraits/yuanzhen.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/yuanzhen.webp",
    },
  },
  liuzongyuan: {
    companionImage: {
      sprite: null,
      card: "/portraits/liuzongyuan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liuzongyuan.webp",
    },
  },
  lihe: {
    companionImage: {
      sprite: null,
      card: "/portraits/lihe.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/lihe.webp",
    },
  },
  zhangruoxu: {
    companionImage: {
      sprite: null,
      card: "/portraits/zhangruoxu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhangruoxu.webp",
    },
  },
  cuihao: {
    companionImage: {
      sprite: null,
      card: "/portraits/cuihao.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/cuihao.webp",
    },
  },
  qinguan: {
    companionImage: {
      sprite: null,
      card: "/portraits/qinguan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/qinguan.webp",
    },
  },
  huangtingjian: {
    companionImage: {
      sprite: null,
      card: "/portraits/huangtingjian.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/huangtingjian.webp",
    },
  },
  yanjiandao: {
    companionImage: {
      sprite: null,
      card: "/portraits/yanjiandao.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/yanjiandao.webp",
    },
  },
  ganning: {
    companionImage: {
      sprite: null,
      card: "/portraits/ganning.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/ganning.webp",
    },
  },
  taishici: {
    companionImage: {
      sprite: null,
      card: "/portraits/taishici.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/taishici.webp",
    },
  },
  xiangyu: {
    companionImage: {
      sprite: null,
      card: "/portraits/xiangyu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/xiangyu.webp",
    },
  },
  lvbu: {
    companionImage: {
      sprite: null,
      card: "/portraits/lvbu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/lvbu.webp",
    },
  },
  weiqing: {
    companionImage: {
      sprite: null,
      card: "/portraits/weiqing.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/weiqing.webp",
    },
  },
  quyuan: {
    companionImage: {
      sprite: null,
      card: "/portraits/quyuan.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/quyuan.webp",
    },
  },
  liyu: {
    companionImage: {
      sprite: null,
      card: "/portraits/liyu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liyu.webp",
    },
  },
  liuxiu: {
    companionImage: {
      sprite: null,
      card: "/portraits/liuxiu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liuxiu.webp",
    },
  },
  sunce: {
    companionImage: {
      sprite: null,
      card: "/portraits/sunce.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/sunce.webp",
    },
  },
  caozhi: {
    companionImage: {
      sprite: null,
      card: "/portraits/caozhi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/caozhi.webp",
    },
  },
  wentingyun: {
    companionImage: {
      sprite: null,
      card: "/portraits/wentingyun.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wentingyun.webp",
    },
  },
  zhaozhen: {
    companionImage: {
      sprite: null,
      card: "/portraits/zhaozhen.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/zhaozhen.webp",
    },
  },
  lishangyin: {
    companionImage: {
      sprite: null,
      card: "/portraits/lishangyin.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/lishangyin.webp",
    },
  },
  wanganshi: {
    companionImage: {
      sprite: null,
      card: "/portraits/wanganshi.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/wanganshi.webp",
    },
  },
  ouyangxiu: {
    companionImage: {
      sprite: null,
      card: "/portraits/ouyangxiu.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/ouyangxiu.webp",
    },
  },
  liuyong: {
    companionImage: {
      sprite: null,
      card: "/portraits/liuyong.jpg",
      avatar: null,
      thumbnail: "/companion/thumbs/liuyong.webp",
    },
  },
};
export function companionArtCandidates(
  image: CompanionImage = {},
): { kind: CompanionArtKind; src: string }[] {
  return (
    [
      ["sprite", image.sprite],
      ["card", image.card],
      ["avatar", image.avatar],
    ] as const
  )
    .filter((row): row is readonly ["sprite" | "card" | "avatar", string] => !!row[1])
    .map(([kind, src]) => ({ kind, src }));
}
export const ART_STATUS: Record<CompanionArtKind, string> = {
  sprite: "已有立繪",
  card: "只有卡面",
  avatar: "只有頭像",
  silhouette: "無圖片",
};
