/**
 * スキルツリー v3：外周（Uncommon・Rare・Epic・Legendary）のパネル。docs/ISLAND_PHASE1.md「スキルツリー」「各ランクの枚数」。
 * そのランクの規模の経営にふさわしい実在の工夫をパネルにし、効き目はすべて汎用の効き目（fx。model.ts の fxSum）で書く。
 * 数値は「Common 相当の基準値（FX_BASE）× ランクの倍率（TIER_F）× 重み」。値段はランクの範囲で、並びの順に上がる。
 * 枝ごとの並びは、既存の外周のパネルのあとに続け、ひとつ内側の段（ROW_CAP 枚前）が「先に要る」。
 * 各ランク・各枝の最初の 2 枚に 🏅 エンブレム、最後に大きめの研究パネル（以前の ✨）を 1 枚。
 * このファイルは data.ts から読む（data.ts の値は使わない。型だけ）。
 */
import { t } from '../../i18n';
import type { Branch, Fx, FxKind, Skill, Tier } from './data';

type OuterTier = Exclude<Tier, 'C'>;
/** Common 相当の 1 枚の効き目（割合。apt・brand・lot は数） */
const FX_BASE: Record<FxKind, number> = {
  pull: 0.1,
  price: 0.05,
  demand: 0.08,
  known: 0.3,
  craftDays: 0.08,
  lot: 1,
  haulDays: 0.08,
  cartCap: 0.2,
  matPrice: 0.05,
  procCap: 0.25,
  buyDays: 0.12,
  display: 0.3,
  stamina: 0.1,
  rest: 0.3,
  apt: 3,
  wage: 0.04,
  upkeep: 0.06,
  ads: 0.2,
  brand: 1,
  rally: 0.2,
  manager: 0.05,
  flow: 0.03,
};
/** ランクの倍率（U は C の 1.3 倍・R 1.8・E 2.5・L 3.5） */
const TIER_F: Record<OuterTier, number> = { U: 1.3, R: 1.8, E: 2.5, L: 3.5 };
/** ランクの値段の範囲（GUM） */
const COST: Record<OuterTier, [number, number, number]> = { U: [15000, 60000, 1000], R: [60000, 250000, 5000], E: [250000, 1000000, 10000], L: [1000000, 4000000, 50000] };
/** 🏅 エンブレム（各ランク・各枝の最初の 2 枚） */
const EMBLEM: Record<OuterTier, [number, number]> = { U: [1, 2], R: [3, 4], E: [6, 6], L: [9, 9] };
/** 外周の 1 段に並べる枚数（treelayout.ts と同じ。ひとつ内側の段の同じ列が「先に要る」） */
export const ROW_CAP: Record<OuterTier, number> = { U: 6, R: 8, E: 10, L: 12 };

/** 1 枚：[名前, 効き目（'pull' または 'pull:1.5'。'+' で複数）] */
type P = [string, string];
interface Block {
  /** 既存の外周のパネル（この並びの先頭に入る。並べ方と「先に要る」の数え方だけに使う） */
  have: string[];
  /** はじめの段のパネルが要る、ひとつ内側のパネル */
  anchor: string;
  list: P[];
  /** 大きめの研究パネル（以前の ✨） */
  big: P;
}

const OUTER: Record<OuterTier, Partial<Record<Branch, Block>>> = {
  // ---------------------------------------------------------------- Uncommon（地域チェーン）
  U: {
    shop: {
      have: ['b_sign', 'order', 'fair'],
      anchor: 'golden',
      list: [
        [t('本部の棚割', 'HQ planograms'), 'pull'],
        [t('チラシの共同購入', 'Joint flyer buying'), 'ads'],
        [t('店長会議', 'Store manager meetings'), 'pull'],
        [t('ミステリーショッパー', 'Mystery shoppers'), 'pull'],
        [t('会員アプリ', 'Member app'), 'demand'],
        [t('PB（自社ブランド）商品', 'Private-label goods'), 'price'],
        [t('SV（巡回指導）', 'Field supervisors'), 'display'],
      ],
      big: [t('地域一番店', 'Top store in town'), 'pull:1.5'],
    },
    craft: {
      have: ['night', 'mold'],
      anchor: 'kaizen',
      list: [
        [t('多能工化', 'Multi-skilling'), 'craftDays'],
        [t('段取り替えの短縮（SMED）', 'Quick changeovers (SMED)'), 'craftDays'],
        [t('品質の小集団活動', 'Quality circles'), 'craftDays'],
        [t('治具の共通化', 'Common jigs'), 'lot'],
        [t('作業標準書', 'Standard work sheets'), 'stamina'],
        [t('工房のレイアウト改善', 'Workshop layout redesign'), 'craftDays'],
      ],
      big: [t('改善の師範', 'Kaizen sensei'), 'craftDays:1.5'],
    },
    logi: {
      have: ['crossdock', 'joint'],
      anchor: 'route_opt',
      list: [
        [t('ミルクラン（巡回集荷）', 'Milk runs'), 'haulDays'],
        [t('帰り便の活用', 'Backhaul loads'), 'cartCap'],
        [t('パレット化', 'Palletizing'), 'cartCap'],
        [t('地域の配送センター', 'Regional delivery center'), 'haulDays'],
        [t('配車係', 'Dispatch desk'), 'haulDays'],
      ],
      big: [t('地域配送の網', 'Regional delivery grid'), 'haulDays:1.5'],
    },
    buy: {
      have: ['contract', 'b_partner'],
      anchor: 'stock2',
      list: [
        [t('相見積もり', 'Competitive quotes'), 'matPrice'],
        [t('複数購買', 'Multi-sourcing'), 'procCap'],
        [t('仕入れ先の評価', 'Supplier scorecards'), 'matPrice'],
        [t('発注点の見直し', 'Reorder-point review'), 'buyDays'],
        [t('共同仕入れ', 'Group purchasing'), 'matPrice'],
        [t('仕入れの前倒し', 'Forward buying'), 'procCap'],
        [t('運賃込みの値段交渉', 'Delivered-price deals'), 'matPrice'],
        [t('調達の専任チーム', 'Dedicated buying team'), 'buyDays'],
      ],
      big: [t('共同購買の組合', 'Buying cooperative'), 'procCap:1.5'],
    },
    people: {
      have: ['b_scout', 'training', 'mgr'],
      anchor: 'manual',
      list: [
        [t('評価制度', 'Performance reviews'), 'apt'],
        [t('研修センター', 'Training center'), 'apt'],
        [t('社内公募', 'Internal job postings'), 'stamina'],
        [t('パートの戦力化', 'Empowered part-timers'), 'display'],
        [t('健康経営', 'Workplace wellness'), 'rest'],
      ],
      big: [t('人を育てる名門', 'Talent academy'), 'apt:1.5'],
    },
    ops: {
      have: ['b_ads', 'pr'],
      anchor: 'pdca',
      list: [
        [t('原価管理', 'Cost accounting'), 'upkeep'],
        [t('資金繰り表', 'Cash-flow planning'), 'wage'],
        [t('KPI 会議', 'KPI reviews'), 'flow'],
      ],
      big: [t('経営計画の発表会', 'Business plan rally'), 'brand'],
    },
    sys: {
      have: ['erp', 'dyn', 'flow'],
      anchor: 'inventory',
      list: [
        [t('バーコード', 'Barcodes'), 'display'],
        [t('WMS（倉庫管理システム）', 'Warehouse management system'), 'haulDays'],
        [t('シフト管理システム', 'Shift scheduling system'), 'stamina'],
        [t('CRM（顧客管理）', 'CRM'), 'demand'],
      ],
      big: [t('本部の情報システム', 'HQ information system'), 'flow:1.5'],
    },
    tech: {
      have: ['t_rare'],
      anchor: 't_master',
      list: [
        [t('伝統工芸の継承', 'Heritage crafts'), 'price'],
        [t('意匠登録', 'Registered designs'), 'price'],
        [t('職人の工具箱', 'Crafter toolkits'), 'craftDays'],
      ],
      big: [t('技能の大会', 'Skills contest'), 'apt:1.5'],
    },
  },
  // ---------------------------------------------------------------- Rare（全国チェーン）
  R: {
    shop: {
      have: ['b_premium', 'concierge'],
      anchor: 'b_sign',
      list: [
        [t('旗艦店', 'Flagship store'), 'pull'],
        [t('ポップアップストア', 'Pop-up stores'), 'demand'],
        [t('ロイヤルティプログラム', 'Loyalty program'), 'rally'],
        [t('オムニチャネル', 'Omnichannel'), 'demand'],
        [t('テレビ CM', 'TV commercials'), 'ads'],
        [t('大型の物産展', 'Grand trade fairs'), 'demand'],
        [t('接客のロールプレイ大会', 'Service role-play contest'), 'pull'],
        [t('価格の戦略室', 'Pricing office'), 'price'],
      ],
      big: [t('百貨店の常設売り場', 'Department-store corner'), 'pull:1.5'],
    },
    craft: {
      have: ['line'],
      anchor: 'night',
      list: [
        [t('後工程引き取り', 'Pull production'), 'craftDays'],
        [t('ライン生産', 'Line production'), 'lot'],
        [t('品質保証部', 'Quality assurance dept.'), 'price'],
        [t('自動検査', 'Automated inspection'), 'craftDays'],
        [t('予防保全', 'Preventive maintenance'), 'craftDays'],
        [t('職場の安全衛生', 'Workplace safety'), 'stamina'],
        [t('設計の標準化', 'Design standardization'), 'craftDays'],
      ],
      big: [t('マザー工場', 'Mother factory'), 'craftDays:1.5'],
    },
    logi: {
      have: ['fleet'],
      anchor: 'crossdock',
      list: [
        [t('全国物流網', 'National logistics network'), 'haulDays'],
        [t('ハブ＆スポーク', 'Hub and spoke'), 'haulDays'],
        [t('ドミナント出店', 'Dominant clustering'), 'haulDays'],
        [t('共同物流センター', 'Shared logistics center'), 'cartCap'],
        [t('定温物流', 'Temperature-controlled logistics'), 'cartCap'],
        [t('輸送の見える化', 'Shipment tracking'), 'haulDays'],
      ],
      big: [t('物流の子会社', 'Logistics subsidiary'), 'haulDays:1.5'],
    },
    buy: {
      have: ['direct'],
      anchor: 'contract',
      list: [
        [t('グローバル調達', 'Global sourcing'), 'matPrice'],
        [t('先物の予約買い', 'Forward contracts'), 'matPrice'],
        [t('協力会社の育成', 'Supplier development'), 'procCap'],
        [t('購買の一元化', 'Centralized purchasing'), 'matPrice'],
        [t('調達の BCP', 'Supply continuity plan'), 'procCap'],
        [t('資材の共同開発', 'Co-developed materials'), 'matPrice'],
        [t('VMI（ベンダー管理在庫）', 'Vendor-managed inventory'), 'buyDays'],
        [t('電子調達', 'e-Procurement'), 'buyDays'],
        [t('原料の産地指定', 'Origin-specified materials'), 'procCap'],
      ],
      big: [t('商社との合弁', 'Trading joint venture'), 'matPrice:1.5'],
    },
    people: {
      have: ['headhunt'],
      anchor: 'training',
      list: [
        [t('幹部候補の育成', 'Leadership pipeline'), 'apt'],
        [t('ジョブローテーション', 'Job rotation'), 'apt'],
        [t('360 度評価', '360-degree reviews'), 'apt'],
        [t('社員持株会', 'Employee stock plan'), 'wage'],
        [t('産休・育休の充実', 'Generous parental leave'), 'rest'],
        [t('社内大学', 'Corporate university'), 'apt'],
        [t('メンター制度', 'Mentoring'), 'stamina'],
      ],
      big: [t('全国採用', 'Nationwide hiring'), 'apt:1.5'],
    },
    ops: {
      have: ['holding'],
      anchor: 'pr',
      list: [
        [t('事業部制', 'Divisional structure'), 'manager'],
        [t('中期経営計画', 'Mid-term business plan'), 'flow'],
        [t('IR（投資家向け広報）', 'Investor relations'), 'brand'],
        [t('全社の原価低減', 'Company-wide cost cuts'), 'upkeep'],
      ],
      big: [t('株式上場', 'Stock listing'), 'brand'],
    },
    sys: {
      have: ['forecast', 'ec'],
      anchor: 'erp',
      list: [
        [t('データ基盤', 'Data platform'), 'flow'],
        [t('BI ダッシュボード', 'BI dashboards'), 'flow'],
        [t('RPA（定型業務の自動化）', 'RPA'), 'wage'],
      ],
      big: [t('全社 ERP の統合', 'Unified ERP'), 'flow:1.5'],
    },
    tech: {
      have: [],
      anchor: 'u_tech_1',
      list: [
        [t('工芸の産地ブランド', 'Regional craft brand'), 'price'],
        [t('熟練工の技能伝承', 'Master skill transfer'), 'apt'],
        [t('試作室', 'Prototype room'), 'craftDays'],
        [t('素材の研究所', 'Materials lab'), 'matPrice'],
      ],
      big: [t('伝統工芸士', 'Certified master artisans'), 'price:1.5'],
    },
  },
  // ---------------------------------------------------------------- Epic（世界企業）
  E: {
    shop: {
      have: [],
      anchor: 'concierge',
      list: [
        [t('海外旗艦店', 'Overseas flagship'), 'pull'],
        [t('SPA（製造小売）', 'SPA (own-make retail)'), 'price'],
        [t('グローバル会員', 'Global membership'), 'demand'],
        [t('越境 EC', 'Cross-border e-commerce'), 'demand'],
        [t('ブランドのライセンス', 'Brand licensing'), 'price'],
        [t('世界同時発売', 'Global launch'), 'known'],
        [t('免税店', 'Duty-free shops'), 'demand'],
        [t('世界の広告代理店', 'Global ad agency'), 'ads'],
        [t('多言語の接客', 'Multilingual service'), 'pull'],
        [t('顧客体験の設計', 'Customer experience design'), 'pull'],
      ],
      big: [t('世界一の旗艦店', 'World’s top flagship'), 'pull:1.5'],
    },
    craft: {
      have: [],
      anchor: 'line',
      list: [
        [t('海外の生産拠点', 'Overseas plants'), 'craftDays'],
        [t('デジタルツイン', 'Digital twin'), 'craftDays'],
        [t('協働ロボット', 'Collaborative robots'), 'craftDays'],
        [t('3D プリンタの試作', '3D-printed prototypes'), 'craftDays'],
        [t('工場の IoT', 'Factory IoT'), 'craftDays'],
        [t('世界品質の認証', 'Global quality certification'), 'price'],
        [t('大量生産のライン', 'Mass-production lines'), 'lot'],
        [t('省エネの工場', 'Energy-efficient plants'), 'upkeep'],
      ],
      big: [t('スマート工場', 'Smart factory'), 'craftDays:1.5'],
    },
    logi: {
      have: [],
      anchor: 'fleet',
      list: [
        [t('物流ロボット', 'Logistics robots'), 'haulDays'],
        [t('国際物流', 'International freight'), 'cartCap'],
        [t('自動倉庫', 'Automated warehouses'), 'cartCap'],
        [t('ドローン配送', 'Drone delivery'), 'haulDays'],
        [t('世界の物流ハブ', 'Global hubs'), 'haulDays'],
        [t('輸送の共同化', 'Freight sharing'), 'cartCap'],
        [t('通関の専門部署', 'Customs desk'), 'haulDays'],
      ],
      big: [t('世界物流網', 'Worldwide logistics web'), 'haulDays:1.5'],
    },
    buy: {
      have: [],
      anchor: 'direct',
      list: [
        [t('サプライヤー監査', 'Supplier audits'), 'matPrice'],
        [t('AI 発注', 'AI ordering'), 'buyDays'],
        [t('長期の資源契約', 'Long-term resource deals'), 'procCap'],
        [t('調達の多国籍化', 'Multinational sourcing'), 'procCap'],
        [t('為替予約', 'FX hedging'), 'matPrice'],
        [t('原料の自社農園', 'Own plantations'), 'matPrice'],
        [t('調達のデジタル化', 'Digital procurement'), 'buyDays'],
        [t('鉱山の権益', 'Mine stakes'), 'procCap'],
        [t('グリーン調達', 'Green procurement'), 'price'],
        [t('サプライチェーンの可視化', 'Supply-chain visibility'), 'procCap'],
      ],
      big: [t('資源メジャーとの提携', 'Resource-major alliance'), 'matPrice:1.5'],
    },
    people: {
      have: [],
      anchor: 'headhunt',
      list: [
        [t('タレントマネジメント', 'Talent management'), 'apt'],
        [t('グローバル人材', 'Global talent'), 'apt'],
        [t('リモートワーク', 'Remote work'), 'stamina'],
        [t('世界の研修プログラム', 'Global training programs'), 'apt'],
        [t('ダイバーシティ', 'Diversity program'), 'apt'],
        [t('報酬のグローバル基準', 'Global pay standards'), 'wage'],
        [t('ウェルビーイング', 'Well-being'), 'rest'],
        [t('後継者計画', 'Succession planning'), 'manager'],
      ],
      big: [t('世界のトップ人材', 'World-class talent'), 'apt:1.5'],
    },
    ops: {
      have: [],
      anchor: 'holding',
      list: [
        [t('M&A 部門', 'M&A department'), 'manager'],
        [t('ESG 経営', 'ESG management'), 'brand'],
        [t('地域統括会社', 'Regional headquarters'), 'manager'],
        [t('世界の経営会議', 'Global executive board'), 'flow'],
        [t('内部統制', 'Internal controls'), 'upkeep'],
      ],
      big: [t('世界的なブランド', 'Global brand icon'), 'brand'],
    },
    sys: {
      have: [],
      anchor: 'forecast',
      list: [
        [t('AI の需要予測', 'AI demand sensing'), 'known'],
        [t('全社のクラウド化', 'Cloud migration'), 'upkeep'],
        [t('サイバーセキュリティ', 'Cybersecurity'), 'flow'],
        [t('顧客データ基盤（CDP）', 'Customer data platform'), 'demand'],
        [t('生成 AI の業務活用', 'Generative AI at work'), 'wage'],
      ],
      big: [t('AI の経営基盤', 'AI management platform'), 'flow:1.5'],
    },
    tech: {
      have: [],
      anchor: 'r_tech_1',
      list: [
        [t('世界の工芸展', 'World craft expo'), 'price'],
        [t('工芸の工房の買収', 'Artisan studio acquisition'), 'apt'],
        [t('特許の網', 'Patent portfolio'), 'price'],
        [t('新素材の開発', 'New materials R&D'), 'matPrice'],
      ],
      big: [t('人間国宝', 'Living national treasure'), 'price:1.5'],
    },
  },
  // ---------------------------------------------------------------- Legendary（コングロマリット）
  L: {
    shop: {
      have: [],
      anchor: 'e_shop_1',
      list: [
        [t('ブランドの帝国', 'Brand empire'), 'pull'],
        [t('会員経済圏', 'Membership economy'), 'demand'],
        [t('街の再開発', 'Urban redevelopment'), 'demand'],
        [t('大型商業施設', 'Mega mall'), 'pull'],
        [t('自社のテーマパーク', 'Own theme park'), 'demand'],
        [t('自社メディア', 'Owned media'), 'ads'],
        [t('世界のスポーツ協賛', 'Global sports sponsorship'), 'ads'],
        [t('高級ブランドの傘下', 'Luxury house group'), 'price'],
        [t('生涯顧客', 'Lifetime customers'), 'rally'],
        [t('街ごとの体験', 'Citywide experiences'), 'pull'],
      ],
      big: [t('世界の商都', 'World trade capital'), 'pull:1.5'],
    },
    craft: {
      have: [],
      anchor: 'e_craft_1',
      list: [
        [t('完全自動工場', 'Lights-out factory'), 'craftDays'],
        [t('垂直統合', 'Vertical integration'), 'lot'],
        [t('世界の工場群', 'Global plant network'), 'craftDays'],
        [t('自社の研究所', 'Corporate research labs'), 'craftDays'],
        [t('素材から製品まで', 'Raw-to-retail'), 'price'],
        [t('生産の AI 最適化', 'AI production planning'), 'craftDays'],
        [t('職人の殿堂', 'Crafters’ hall of fame'), 'apt'],
        [t('工場の再生エネルギー', 'Renewable-powered plants'), 'upkeep'],
      ],
      big: [t('未来の工場', 'Factory of the future'), 'craftDays:1.5'],
    },
    logi: {
      have: [],
      anchor: 'e_logi_1',
      list: [
        [t('自社の港', 'Own port'), 'haulDays'],
        [t('物流センター群', 'Logistics center network'), 'cartCap'],
        [t('自社の貨物航空', 'Own air cargo'), 'haulDays'],
        [t('自動運転トラック', 'Self-driving trucks'), 'haulDays'],
        [t('海運の子会社', 'Shipping subsidiary'), 'cartCap'],
        [t('地下の物流網', 'Underground freight'), 'haulDays'],
        [t('衛星の運行管理', 'Satellite fleet tracking'), 'haulDays'],
      ],
      big: [t('地球規模の物流', 'Planet-scale logistics'), 'haulDays:1.5'],
    },
    buy: {
      have: [],
      anchor: 'e_buy_1',
      list: [
        [t('資源の自社開発', 'Own resource development'), 'matPrice'],
        [t('商品取引所の会員権', 'Commodity exchange seat'), 'matPrice'],
        [t('調達の持株会社', 'Procurement holding'), 'procCap'],
        [t('原料の一貫生産', 'Integrated raw materials'), 'matPrice'],
        [t('世界の倉庫網', 'Global warehouse network'), 'procCap'],
        [t('調達の AI エージェント', 'AI buying agents'), 'buyDays'],
        [t('長期の独占契約', 'Exclusive long-term deals'), 'procCap'],
        [t('自社の鉱山', 'Own mines'), 'matPrice'],
        [t('自社の森林', 'Own forests'), 'matPrice'],
        [t('循環型の調達', 'Circular sourcing'), 'procCap'],
      ],
      big: [t('資源の帝国', 'Resource empire'), 'matPrice:1.5'],
    },
    people: {
      have: [],
      anchor: 'e_people_1',
      list: [
        [t('グループの人事', 'Group HR'), 'apt'],
        [t('経営者の養成学校', 'Executive academy'), 'apt'],
        [t('社員の街', 'Company town'), 'rest'],
        [t('世界の人材交流', 'Global talent exchange'), 'apt'],
        [t('雇用の長期保障', 'Long-term job security'), 'wage'],
        [t('一流の福利厚生', 'World-class benefits'), 'rest'],
        [t('社内起業制度', 'Intrapreneurship'), 'manager'],
        [t('人材の総合商社', 'Talent conglomerate'), 'apt'],
      ],
      big: [t('伝説の人材', 'Legendary talent'), 'apt:1.5'],
    },
    ops: {
      have: [],
      anchor: 'e_ops_1',
      list: [
        [t('持株会社の再編', 'Holding restructure'), 'manager'],
        [t('ベンチャー投資', 'Corporate venture capital'), 'manager'],
        [t('プラットフォーム事業', 'Platform business'), 'flow'],
        [t('グループの経営理念', 'Group philosophy'), 'brand'],
        [t('財団の設立', 'Corporate foundation'), 'brand'],
      ],
      big: [t('伝説のブランド', 'Legendary brand'), 'brand'],
    },
    sys: {
      have: [],
      anchor: 'e_sys_1',
      list: [
        [t('グループのデータ統合', 'Group data integration'), 'flow'],
        [t('自社のクラウド', 'Own cloud'), 'upkeep'],
        [t('AI の経営判断', 'AI decision support'), 'flow'],
        [t('自社の決済サービス', 'Own payment service'), 'demand'],
        [t('量子計算の研究', 'Quantum computing research'), 'flow'],
      ],
      big: [t('グループの頭脳', 'Group brain'), 'flow:1.5'],
    },
    tech: {
      have: [],
      anchor: 'e_tech_1',
      list: [
        [t('世界遺産の修復', 'World-heritage restoration'), 'price'],
        [t('工芸の美術館', 'Crafts museum'), 'brand'],
        [t('匠の大学', 'University of crafts'), 'apt'],
        [t('永久保証', 'Lifetime warranty'), 'price'],
      ],
      big: [t('工芸の伝説', 'Crafts legend'), 'price:1.5'],
    },
  },
};

/** 'pull:1.5+price' → fx（ランクの倍率と重みを掛ける） */
function fxOf(spec: string, tier: OuterTier): Fx[] {
  return spec.split('+').map((x) => {
    const [kind, w] = x.split(':') as [FxKind, string | undefined];
    const raw = FX_BASE[kind] * TIER_F[tier] * (w ? Number(w) : 1);
    const v = kind === 'apt' || kind === 'brand' || kind === 'lot' ? Math.max(1, Math.round(raw)) : Math.round(raw * 100) / 100;
    return { kind, v };
  });
}
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

function build(): Skill[] {
  const out: Skill[] = [];
  for (const tier of ['U', 'R', 'E', 'L'] as OuterTier[]) {
    for (const [branch, b] of Object.entries(OUTER[tier]) as [Branch, Block][]) {
      const [lo, hi, step] = COST[tier];
      const n = b.list.length;
      const ids: string[] = [...b.have];
      b.list.forEach(([name, spec], i) => {
        const id = `${tier.toLowerCase()}_${branch}_${i + 1}`;
        const j = ids.length;
        const fx = fxOf(spec, tier);
        const lin = fx.some((f) => f.kind === 'lot' || f.kind === 'brand');
        out.push({
          id,
          branch,
          name,
          note: '',
          cost: roundTo(lo * Math.pow(hi / lo, n > 1 ? i / (n - 1) : 0), step),
          requires: [j >= ROW_CAP[tier] ? ids[j - ROW_CAP[tier]] : b.anchor],
          tier,
          emblem: i < 2 ? EMBLEM[tier][i] : undefined,
          fx,
          max: lin ? 3 : undefined,
        });
        ids.push(id);
      });
      const [dname, dspec] = b.big;
      const fx = fxOf(dspec, tier);
      out.push({ id: `${tier.toLowerCase()}_${branch}_d`, branch, name: dname, note: '', cost: 0, big: true, tier, requires: [ids[0]], fx });
    }
  }
  return out;
}

/** 外周の追加のパネル（data.ts の SKILLS の後ろに足す） */
export const OUTER_SKILLS: Skill[] = build();
