import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, serverTimestamp,
} from "firebase/firestore";

// ─── Firebase Config ───────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCAljAr_jQqiyIOAvN5iU0VZbF5847KCH8",
  authDomain:        "tradeforge-d2f8b.firebaseapp.com",
  projectId:         "tradeforge-d2f8b",
  storageBucket:     "tradeforge-d2f8b.firebasestorage.app",
  messagingSenderId: "290179282436",
  appId:             "1:290179282436:web:a141b08f3839d3c9f46751",
};

// ─── Constants ─────────────────────────────────────────────────────────────────
const STARTING_CASH       = 10000;
const PRICE_TICK_MS       = 30_000;
const LEADERBOARD_SYNC_MS = 15_000;

const SECTORS = {
  "🖥 TECH": [
    "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","NFLX","AMD","INTC",
    "CRM","ORCL","ADBE","QCOM","UBER","SHOP","SNOW","PLTR","RBLX","SPOT",
    "TWLO","ZM","DOCU","OKTA","NET","DDOG","MDB","CRWD","ZS","FSLY",
    "AMAT","LRCX","KLAC","MRVL","AVGO","TXN","MPWR","ON","STX","WDC",
    "HPQ","DELL","NTAP","PSTG","GTLB","HCP","PATH","AI","BBAI","IONQ",
  ],
  "💰 FINANCE": [
    "JPM","BAC","GS","V","MA","MS","C","WFC","AXP","BLK",
    "SCHW","COF","USB","PNC","ICE","CB","AON","MMC","TRV","ALL",
    "MET","PRU","AFL","HIG","LNC","ALLY","SYF","DFS","NDAQ","CME",
    "SPGI","MCO","FIS","FISV","PYPL","SQ","AFRM","SOFI","HOOD","LC",
  ],
  "🏥 HEALTHCARE": [
    "JNJ","PFE","UNH","ABBV","MRK","BMY","LLY","CVS","MDT","ISRG",
    "ABT","TMO","DHR","BSX","SYK","ZBH","BAX","BDX","EW","HOLX",
    "REGN","VRTX","GILD","BIIB","AMGN","MRNA","BNTX","NVAX","SGEN","ALNY",
    "HCA","THC","UHS","CNC","MOH","HUM","CI","DVA","IQV","A",
  ],
  "🛒 CONSUMER": [
    "WMT","MCD","KO","PEP","NKE","DIS","SBUX","TGT","COST","HD",
    "LOW","YUM","CMG","ROST","DG","AMZN","EBAY","ETSY","W","CVNA",
    "F","GM","TSLA","RIVN","LCID","TM","HMC","RACE","BWA","LEA",
    "MAR","HLT","MGM","WYNN","LVS","CCL","RCL","NCLH","UAL","DAL",
  ],
  "⚡ ENERGY": [
    "XOM","CVX","COP","SLB","OXY","PSX","VLO","EOG","PXD","HAL",
    "MPC","HES","DVN","FANG","APA","BKR","NOV","HP","RIG","VAL",
    "NEE","DUK","SO","AEP","EXC","PCG","ED","FE","PPL","ETR",
    "ENPH","SEDG","FSLR","RUN","SPWR","BE","PLUG","BLDP","CEG","NRG",
  ],
  "🏭 INDUSTRIAL": [
    "BA","GE","CAT","HON","MMM","LMT","RTX","DE","UPS","FDX",
    "EMR","ETN","PH","ROK","AME","XYL","ITW","GWW","FAST","MSC",
    "NSC","CSX","UNP","KSU","WAB","TT","JCI","CARR","OTIS","GNRC",
    "WM","RSG","CLH","SRCL","AQUA","AWK","CWT","SJW","MSEX","YORW",
  ],
  "🏦 NYSE BLUE CHIP": [
    "BRK.B","T","VZ","IBM","CVX","WBA","KHC","MO","PM","BTI",
    "UL","DEO","BHP","RIO","VALE","BP","TOT","SHEL","ENB","TRP",
    "BCE","TD","BNS","BMO","CM","RY","MFC","SLF","POW","GWO",
    "AIG","BX","KKR","APO","CG","ARES","OWL","HLNE","STEP","TPG",
  ],
  "📡 ETFs": [
    "SPY","QQQ","DIA","IWM","VTI","ARKK","GLD","TLT","XLF","XLE",
    "XLK","XLV","XLI","XLY","XLP","XLU","XLRE","XLB","XLC","XLI",
    "VGT","VHT","VFH","VDE","VIS","VCR","VDC","VCIT","BND","AGG",
    "EEM","EFA","VEA","ACWI","IEMG","SCHD","VYM","DVY","NOBL","DGRO",
  ],
};
const ALL_TICKERS = [...new Set(Object.values(SECTORS).flat())];
const BASES = {
  // TECH
  AAPL:189,MSFT:415,GOOGL:175,AMZN:195,META:510,NVDA:875,TSLA:248,NFLX:628,
  AMD:178,INTC:42,CRM:298,ORCL:145,ADBE:520,QCOM:168,UBER:74,
  SHOP:78,SNOW:165,PLTR:22,RBLX:38,SPOT:245,
  TWLO:65,ZM:68,DOCU:55,OKTA:95,NET:88,DDOG:125,MDB:395,CRWD:285,ZS:195,FSLY:18,
  AMAT:195,LRCX:875,KLAC:695,MRVL:72,AVGO:1285,TXN:178,MPWR:685,ON:72,STX:92,WDC:48,
  HPQ:32,DELL:128,NTAP:98,PSTG:52,GTLB:48,HCP:22,PATH:18,AI:28,BBAI:3,IONQ:12,
  // FINANCE
  JPM:195,BAC:38,GS:465,V:278,MA:464,MS:98,C:62,WFC:55,AXP:195,BLK:820,
  SCHW:72,COF:145,USB:44,PNC:152,ICE:138,CB:225,AON:318,MMC:208,TRV:215,ALL:165,
  MET:68,PRU:115,AFL:88,HIG:95,LNC:32,ALLY:38,SYF:48,DFS:125,NDAQ:195,CME:225,
  SPGI:415,MCO:398,FIS:68,FISV:158,PYPL:62,SQ:72,AFRM:18,SOFI:8,HOOD:18,LC:12,
  // HEALTHCARE
  JNJ:165,PFE:29,UNH:520,ABBV:165,MRK:125,BMY:52,LLY:780,CVS:72,MDT:88,ISRG:395,
  ABT:108,TMO:545,DHR:245,BSX:72,SYK:325,ZBH:118,BAX:38,BDX:238,EW:88,HOLX:72,
  REGN:895,VRTX:458,GILD:82,BIIB:225,AMGN:278,MRNA:98,BNTX:108,NVAX:8,SGEN:225,ALNY:195,
  HCA:285,THC:88,UHS:178,CNC:78,MOH:348,HUM:465,CI:318,DVA:95,IQV:225,A:148,
  // CONSUMER
  WMT:88,MCD:295,KO:62,PEP:175,NKE:88,DIS:112,SBUX:98,TGT:142,COST:745,HD:345,
  LOW:218,YUM:132,CMG:2250,ROST:148,DG:148,EBAY:48,ETSY:72,W:58,CVNA:28,
  F:12,GM:38,RIVN:15,LCID:5,TM:165,HMC:28,RACE:395,BWA:32,LEA:82,
  MAR:225,HLT:195,MGM:38,WYNN:95,LVS:48,CCL:18,RCL:115,NCLH:18,UAL:48,DAL:42,
  // ENERGY
  XOM:118,CVX:158,COP:118,SLB:48,OXY:62,PSX:148,VLO:162,EOG:122,PXD:225,HAL:38,
  MPC:158,HES:148,DVN:48,FANG:185,APA:28,BKR:35,NOV:18,HP:8,RIG:5,VAL:38,
  NEE:58,DUK:98,SO:68,AEP:88,EXC:38,PCG:18,ED:92,FE:38,PPL:28,ETR:108,
  ENPH:98,SEDG:72,FSLR:178,RUN:12,SPWR:5,BE:18,PLUG:5,BLDP:3,CEG:178,NRG:32,
  // INDUSTRIAL
  BA:175,GE:128,CAT:318,HON:198,MMM:108,LMT:458,RTX:98,DE:385,UPS:148,FDX:248,
  EMR:98,ETN:265,PH:395,ROK:295,AME:158,XYL:118,ITW:235,GWW:895,FAST:65,MSC:185,
  NSC:245,CSX:35,UNP:225,KSU:195,WAB:115,TT:228,JCI:62,CARR:58,OTIS:88,GNRC:148,
  WM:198,RSG:178,CLH:95,SRCL:72,AQUA:32,AWK:135,CWT:48,SJW:52,MSEX:62,YORW:38,
  // NYSE BLUE CHIP
  "BRK.B":368,T:18,VZ:42,IBM:148,WBA:18,KHC:32,MO:42,PM:98,BTI:32,
  UL:52,DEO:148,BHP:52,RIO:72,VALE:12,BP:38,TOT:62,SHEL:62,ENB:38,TRP:48,
  BCE:38,TD:62,BNS:68,BMO:118,CM:52,RY:128,MFC:22,SLF:58,POW:32,GWO:28,
  AIG:68,BX:118,KKR:98,APO:95,CG:48,ARES:122,OWL:18,HLNE:72,STEP:32,TPG:28,
  // ETFs
  SPY:523,QQQ:447,DIA:395,IWM:208,VTI:245,ARKK:48,GLD:185,TLT:95,XLF:38,XLE:88,
  XLK:198,XLV:142,XLI:118,XLY:178,XLP:72,XLU:62,XLRE:38,XLB:88,XLC:72,
  VGT:445,VHT:258,VFH:98,VDE:118,VIS:208,VCR:382,VDC:178,VCIT:82,BND:72,AGG:98,
  EEM:38,EFA:72,VEA:48,ACWI:98,IEMG:52,SCHD:78,VYM:112,DVY:118,NOBL:88,DGRO:52,
};
const COMPANY_NAMES = {
  // TECH
  AAPL:"Apple",MSFT:"Microsoft",GOOGL:"Alphabet",AMZN:"Amazon",META:"Meta",
  NVDA:"NVIDIA",TSLA:"Tesla",NFLX:"Netflix",AMD:"AMD",INTC:"Intel",
  CRM:"Salesforce",ORCL:"Oracle",ADBE:"Adobe",QCOM:"Qualcomm",UBER:"Uber",
  SHOP:"Shopify",SNOW:"Snowflake",PLTR:"Palantir",RBLX:"Roblox",SPOT:"Spotify",
  TWLO:"Twilio",ZM:"Zoom",DOCU:"DocuSign",OKTA:"Okta",NET:"Cloudflare",
  DDOG:"Datadog",MDB:"MongoDB",CRWD:"CrowdStrike",ZS:"Zscaler",FSLY:"Fastly",
  AMAT:"Applied Materials",LRCX:"Lam Research",KLAC:"KLA Corp",MRVL:"Marvell",AVGO:"Broadcom",
  TXN:"Texas Instruments",MPWR:"Monolithic Power",ON:"ON Semiconductor",STX:"Seagate",WDC:"Western Digital",
  HPQ:"HP Inc",DELL:"Dell Technologies",NTAP:"NetApp",PSTG:"Pure Storage",GTLB:"GitLab",
  HCP:"HashiCorp",PATH:"UiPath",AI:"C3.ai",BBAI:"BigBear.ai",IONQ:"IonQ",
  // FINANCE
  JPM:"JPMorgan",BAC:"Bank of America",GS:"Goldman Sachs",V:"Visa",MA:"Mastercard",
  MS:"Morgan Stanley",C:"Citigroup",WFC:"Wells Fargo",AXP:"American Express",BLK:"BlackRock",
  SCHW:"Charles Schwab",COF:"Capital One",USB:"U.S. Bancorp",PNC:"PNC Financial",ICE:"Intercontinental Exchange",
  CB:"Chubb",AON:"Aon",MMC:"Marsh McLennan",TRV:"Travelers",ALL:"Allstate",
  MET:"MetLife",PRU:"Prudential",AFL:"Aflac",HIG:"Hartford Financial",LNC:"Lincoln National",
  ALLY:"Ally Financial",SYF:"Synchrony",DFS:"Discover Financial",NDAQ:"Nasdaq",CME:"CME Group",
  SPGI:"S&P Global",MCO:"Moody's",FIS:"Fidelity National",FISV:"Fiserv",PYPL:"PayPal",
  SQ:"Block",AFRM:"Affirm",SOFI:"SoFi",HOOD:"Robinhood",LC:"LendingClub",
  // HEALTHCARE
  JNJ:"Johnson & Johnson",PFE:"Pfizer",UNH:"UnitedHealth",ABBV:"AbbVie",MRK:"Merck",
  BMY:"Bristol-Myers",LLY:"Eli Lilly",CVS:"CVS Health",MDT:"Medtronic",ISRG:"Intuitive Surgical",
  ABT:"Abbott Labs",TMO:"Thermo Fisher",DHR:"Danaher",BSX:"Boston Scientific",SYK:"Stryker",
  ZBH:"Zimmer Biomet",BAX:"Baxter",BDX:"Becton Dickinson",EW:"Edwards Lifesciences",HOLX:"Hologic",
  REGN:"Regeneron",VRTX:"Vertex Pharma",GILD:"Gilead Sciences",BIIB:"Biogen",AMGN:"Amgen",
  MRNA:"Moderna",BNTX:"BioNTech",NVAX:"Novavax",SGEN:"Seagen",ALNY:"Alnylam",
  HCA:"HCA Healthcare",THC:"Tenet Healthcare",UHS:"Universal Health",CNC:"Centene",MOH:"Molina Healthcare",
  HUM:"Humana",CI:"Cigna",DVA:"DaVita",IQV:"IQVIA",A:"Agilent",
  // CONSUMER
  WMT:"Walmart",MCD:"McDonald's",KO:"Coca-Cola",PEP:"PepsiCo",NKE:"Nike",
  DIS:"Disney",SBUX:"Starbucks",TGT:"Target",COST:"Costco",HD:"Home Depot",
  LOW:"Lowe's",YUM:"Yum! Brands",CMG:"Chipotle",ROST:"Ross Stores",DG:"Dollar General",
  EBAY:"eBay",ETSY:"Etsy",W:"Wayfair",CVNA:"Carvana",
  F:"Ford",GM:"General Motors",RIVN:"Rivian",LCID:"Lucid Motors",TM:"Toyota",
  HMC:"Honda",RACE:"Ferrari",BWA:"BorgWarner",LEA:"Lear Corp",
  MAR:"Marriott",HLT:"Hilton",MGM:"MGM Resorts",WYNN:"Wynn Resorts",LVS:"Las Vegas Sands",
  CCL:"Carnival",RCL:"Royal Caribbean",NCLH:"Norwegian Cruise",UAL:"United Airlines",DAL:"Delta Air Lines",
  // ENERGY
  XOM:"ExxonMobil",CVX:"Chevron",COP:"ConocoPhillips",SLB:"SLB",OXY:"Occidental",
  PSX:"Phillips 66",VLO:"Valero Energy",EOG:"EOG Resources",PXD:"Pioneer Natural",HAL:"Halliburton",
  MPC:"Marathon Petroleum",HES:"Hess Corp",DVN:"Devon Energy",FANG:"Diamondback Energy",APA:"APA Corp",
  BKR:"Baker Hughes",NOV:"NOV Inc",HP:"Helmerich & Payne",RIG:"Transocean",VAL:"Valaris",
  NEE:"NextEra Energy",DUK:"Duke Energy",SO:"Southern Co",AEP:"American Electric",EXC:"Exelon",
  PCG:"PG&E",ED:"Con Edison",FE:"FirstEnergy",PPL:"PPL Corp",ETR:"Entergy",
  ENPH:"Enphase Energy",SEDG:"SolarEdge",FSLR:"First Solar",RUN:"Sunrun",SPWR:"SunPower",
  BE:"Bloom Energy",PLUG:"Plug Power",BLDP:"Ballard Power",CEG:"Constellation Energy",NRG:"NRG Energy",
  // INDUSTRIAL
  BA:"Boeing",GE:"GE Aerospace",CAT:"Caterpillar",HON:"Honeywell",MMM:"3M",
  LMT:"Lockheed Martin",RTX:"RTX Corp",DE:"John Deere",UPS:"UPS",FDX:"FedEx",
  EMR:"Emerson Electric",ETN:"Eaton",PH:"Parker Hannifin",ROK:"Rockwell Automation",AME:"AMETEK",
  XYL:"Xylem",ITW:"Illinois Tool Works",GWW:"W.W. Grainger",FAST:"Fastenal",MSC:"MSC Industrial",
  NSC:"Norfolk Southern",CSX:"CSX Corp",UNP:"Union Pacific",KSU:"Kansas City Southern",WAB:"Wabtec",
  TT:"Trane Technologies",JCI:"Johnson Controls",CARR:"Carrier Global",OTIS:"Otis Worldwide",GNRC:"Generac",
  WM:"Waste Management",RSG:"Republic Services",CLH:"Clean Harbors",SRCL:"Stericycle",AQUA:"Evoqua Water",
  AWK:"American Water Works",CWT:"California Water",SJW:"SJW Group",MSEX:"Middlesex Water",YORW:"York Water",
  // NYSE BLUE CHIP
  "BRK.B":"Berkshire Hathaway","T":"AT&T",VZ:"Verizon",IBM:"IBM",WBA:"Walgreens",
  KHC:"Kraft Heinz",MO:"Altria",PM:"Philip Morris",BTI:"British American Tobacco",
  UL:"Unilever",DEO:"Diageo",BHP:"BHP Group",RIO:"Rio Tinto",VALE:"Vale",
  BP:"BP",TOT:"TotalEnergies",SHEL:"Shell",ENB:"Enbridge",TRP:"TC Energy",
  BCE:"BCE Inc",TD:"TD Bank",BNS:"Bank of Nova Scotia",BMO:"Bank of Montreal",CM:"CIBC",
  RY:"Royal Bank of Canada",MFC:"Manulife",SLF:"Sun Life",POW:"Power Corp",GWO:"Great-West Lifeco",
  AIG:"AIG",BX:"Blackstone",KKR:"KKR",APO:"Apollo Global",CG:"Carlyle Group",
  ARES:"Ares Management",OWL:"Blue Owl Capital",HLNE:"Hamilton Lane",STEP:"StepStone",TPG:"TPG Inc",
  // ETFs
  SPY:"S&P 500 ETF",QQQ:"Nasdaq ETF",DIA:"Dow Jones ETF",IWM:"Russell 2000",VTI:"Total Market ETF",
  ARKK:"ARK Innovation",GLD:"Gold ETF",TLT:"Treasury Bond ETF",XLF:"Financial ETF",XLE:"Energy ETF",
  XLK:"Technology ETF",XLV:"Healthcare ETF",XLI:"Industrial ETF",XLY:"Consumer Discr ETF",XLP:"Consumer Staples ETF",
  XLU:"Utilities ETF",XLRE:"Real Estate ETF",XLB:"Materials ETF",XLC:"Comm Services ETF",
  VGT:"Vanguard Tech ETF",VHT:"Vanguard Health ETF",VFH:"Vanguard Finance ETF",VDE:"Vanguard Energy ETF",
  VIS:"Vanguard Industrial ETF",VCR:"Vanguard Consumer ETF",VDC:"Vanguard Staples ETF",
  VCIT:"Corp Bond ETF",BND:"Total Bond ETF",AGG:"Aggregate Bond ETF",
  EEM:"Emerging Markets ETF",EFA:"Developed Markets ETF",VEA:"Vanguard Intl ETF",ACWI:"All World ETF",
  IEMG:"Core EM ETF",SCHD:"Dividend ETF",VYM:"High Dividend ETF",DVY:"Dividend Income ETF",
  NOBL:"Dividend Aristocrats",DGRO:"Dividend Growth ETF",
};

// ─── Utils ─────────────────────────────────────────────────────────────────────
const fmt    = (n, d=2) => Number(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});
const fmtUSD = n => `$${fmt(n)}`;
const fmtPct = n => `${n>=0?"+":""}${fmt(n)}%`;
const clr    = n => n >= 0 ? "#00d4aa" : "#ff4d6d";

function seededRng(seed) {
  let s = seed;
  return () => { s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}

function buildInitialPrices() {
  const out = {};
  ALL_TICKERS.forEach(t => {
    const seed = t.split("").reduce((a,c,i) => a + c.charCodeAt(0)*(i+3), 0);
    const rng  = seededRng(seed);
    let price  = BASES[t] || 100;
    const candles = [];
    for (let i = 0; i < 60; i++) {
      const open = price, move = (rng()-0.498)*0.022;
      const close = +(open*(1+move)).toFixed(2);
      const h = +(Math.max(open,close)*(1+rng()*0.01)).toFixed(2);
      const l = +(Math.min(open,close)*(1-rng()*0.01)).toFixed(2);
      candles.push({i, open, close, high:h, low:l});
      price = close;
    }
    out[t] = {candles, current: candles.at(-1).close, open: candles[0].open};
  });
  return out;
}

function tickPrices(prev) {
  const next = {};
  ALL_TICKERS.forEach(t => {
    const old  = prev[t], last = old.candles.at(-1);
    const move = (Math.random()-0.499)*0.018;
    const close = +(last.close*(1+move)).toFixed(2);
    const h = +(Math.max(last.close,close)*(1+Math.random()*0.007)).toFixed(2);
    const l = +(Math.min(last.close,close)*(1-Math.random()*0.007)).toFixed(2);
    next[t] = {
      candles: [...old.candles.slice(-59), {i:last.i+1, open:last.close, close, high:h, low:l}],
      current: close, open: old.open
    };
  });
  return next;
}

// ─── Firebase init (uses npm package, no dynamic loading needed) ──────────────
function initFirebase() {
  const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  const db   = getFirestore(app);
  return {
    app, auth, db,
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
    updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
    doc, getDoc, setDoc, collection, getDocs, serverTimestamp,
  };
}

// ─── Google Finance-style Area Chart ──────────────────────────────────────────
function StockChart({ candles, isUp, width=600, height=220 }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!candles?.length) return null;

  const pad = {l:58, r:70, t:16, b:16};
  const iW = width-pad.l-pad.r, iH = height-pad.t-pad.b;
  const prices = candles.map(c=>c.close);
  const yMax = Math.max(...prices)*1.002;
  const yMin = Math.min(...prices)*0.998;
  const yr = yMax-yMin || 1;
  const toY = v => pad.t + iH - ((v-yMin)/yr)*iH;
  const toX = i => pad.l + (i/(candles.length-1))*iW;

  const color = isUp ? "#26a69a" : "#ef5350";
  const pts = candles.map((c,i) => `${toX(i)},${toY(c.close)}`);
  const linePath = `M${pts.join("L")}`;
  const areaPath = `M${pad.l},${pad.t+iH}L${pts.join("L")}L${toX(candles.length-1)},${pad.t+iH}Z`;
  const yTicks = 5;
  const yLabels = Array.from({length:yTicks}, (_,i) => {
    const v = yMin + (yr * i/(yTicks-1));
    return {v, y: toY(v)};
  });
  const hov = hoverIdx !== null ? candles[hoverIdx] : null;

  return (
    <div style={{position:"relative",userSelect:"none"}}>
      <svg
        width="100%" height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{display:"block",cursor:"crosshair"}}
        onMouseLeave={()=>setHoverIdx(null)}
        onMouseMove={e=>{
          const rect=e.currentTarget.getBoundingClientRect();
          const x=(e.clientX-rect.left)*(width/rect.width)-pad.l;
          const idx=Math.round((x/iW)*(candles.length-1));
          setHoverIdx(Math.max(0,Math.min(candles.length-1,idx)));
        }}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yLabels.map(({y},i)=>(
          <line key={i} x1={pad.l} y1={y} x2={pad.l+iW} y2={y} stroke="#1a2535" strokeWidth={0.5} strokeDasharray="4 4"/>
        ))}
        {/* Y axis labels */}
        {yLabels.map(({v,y})=>(
          <text key={v} x={pad.l-8} y={y+4} textAnchor="end" fill="#3a5a7a" fontSize={10} fontFamily="'IBM Plex Mono',monospace">
            {v.toFixed(2)}
          </text>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)"/>
        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} style={{filter:`drop-shadow(0 0 3px ${color}88)`}}/>
        {/* Hover line */}
        {hoverIdx!==null && (
          <line x1={toX(hoverIdx)} y1={pad.t} x2={toX(hoverIdx)} y2={pad.t+iH} stroke="#4a6a8a" strokeWidth={1} strokeDasharray="3 3"/>
        )}
        {/* Hover dot */}
        {hoverIdx!==null && (
          <circle cx={toX(hoverIdx)} cy={toY(candles[hoverIdx].close)} r={4} fill={color} stroke="#080c10" strokeWidth={2}/>
        )}
        {/* Current price label */}
        <rect x={pad.l+iW+4} y={toY(candles.at(-1).close)-9} width={58} height={18} rx={3} fill={color}/>
        <text x={pad.l+iW+33} y={toY(candles.at(-1).close)+4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="700" fontFamily="'IBM Plex Mono',monospace">
          {candles.at(-1).close.toFixed(2)}
        </text>
      </svg>
      {/* Hover tooltip */}
      {hov && (
        <div style={{
          position:"absolute", top:8,
          left: hoverIdx > candles.length*0.6 ? 66 : "auto",
          right: hoverIdx <= candles.length*0.6 ? 80 : "auto",
          background:"#0d1520ee", border:"1px solid #1e2d40",
          borderRadius:6, padding:"10px 14px",
          fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
          pointerEvents:"none", zIndex:10,
          boxShadow:"0 4px 20px #000a", minWidth:150,
        }}>
          <div style={{color:"#4a6a8a",marginBottom:6,fontSize:10}}>Candle #{hov.i}</div>
          {[["Close",hov.close],["Open",hov.open],["High",hov.high],["Low",hov.low]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:3}}>
              <span style={{color:"#4a6a8a"}}>{l}:</span>
              <span style={{color:"#e0eaf5",fontWeight:600}}>{fmtUSD(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TickerRowfunction TickerRow({t, prices, selected, flash, onSelect}) {
  const p = prices[t], chg = p ? ((p.current-p.open)/p.open)*100 : 0;
  return (
    <div className="tr" onClick={onSelect} style={{padding:"9px 14px",borderBottom:"1px solid #0d1520",background:selected===t?"#0d1a26":"transparent",borderLeft:selected===t?"2px solid #00d4aa":"2px solid transparent",animation:flash[t]?"flash .5s":"none",cursor:"pointer"}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#e0eaf5",fontWeight:600}}>{t} <span style={{fontSize:9,color:"#3a5a7a",fontWeight:400}}>{COMPANY_NAMES[t]}</span></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#8ab0cc"}}>{fmtUSD(p?.current||0)}</span>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:clr(chg)}}>{fmtPct(chg)}</span>
      </div>
    </div>
  );
}

function Countdown({nextTick}) {
  const [secs, setSecs] = useState(60);
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.max(0, Math.ceil((nextTick-Date.now())/1000))), 500);
    return () => clearInterval(iv);
  }, [nextTick]);
  const pct = ((PRICE_TICK_MS/1000-secs)/(PRICE_TICK_MS/1000))*100;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a5a7a"}}>
      <div style={{width:36,height:3,background:"#1a2535",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:"#00d4aa",transition:"width .5s linear"}}/>
      </div>
      <span>TICK {secs}s</span>
    </div>
  );
}

// ─── Auth Screen (Sign In + Sign Up) ──────────────────────────────────────────
const Logo = () => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:6}}>
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
      <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" fill="#00d4aa22" stroke="#00d4aa" strokeWidth="1.5"/>
      <polyline points="8,16 12,12 16,15 20,10" stroke="#00d4aa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:20,letterSpacing:2,color:"#e0eaf5",fontWeight:700}}>TradeForge</span>
  </div>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.1l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.5-4.6 5.9l6.2 5.2C40.8 35.8 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
  </svg>
);

function AuthInput({label, type, value, onChange, placeholder}) {
  return (
    <div style={{marginBottom:14,textAlign:"left"}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:6}}>{label}</div>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{width:"100%",background:"#0d1520",border:"1px solid #1e2d40",color:"#e0eaf5",borderRadius:6,padding:"11px 14px",fontSize:14,fontFamily:"'IBM Plex Sans',sans-serif",outline:"none",boxSizing:"border-box",transition:"border-color .2s"}}
        onFocus={e=>e.target.style.borderColor="#00d4aa55"}
        onBlur={e=>e.target.style.borderColor="#1e2d40"}
      />
    </div>
  );
}

function SignInScreen({onEmailSignIn, onEmailSignUp, onGoogleSignIn, error, loading}) {
  const [mode,     setMode]     = useState("signin"); // "signin" | "signup"
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [animDir,  setAnimDir]  = useState(1); // 1 = slide left, -1 = slide right
  const [visible,  setVisible]  = useState(true);

  const switchMode = (next) => {
    setAnimDir(next === "signup" ? 1 : -1);
    setVisible(false);
    setTimeout(() => { setMode(next); setVisible(true); }, 220);
  };

  const handleSubmit = () => {
    if (mode === "signin") onEmailSignIn(email, password);
    else onEmailSignUp(email, password, username);
  };

  const inputStyle = {
    transform: visible ? "translateX(0)" : `translateX(${animDir * 30}px)`,
    opacity: visible ? 1 : 0,
    transition: "all 0.22s cubic-bezier(.4,0,.2,1)",
  };

  return (
    <div style={{width:"100vw",height:"100vh",background:"#080c10",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans',sans-serif",overflow:"hidden"}}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .auth-card{animation:fadeUp .3s ease}
      `}</style>
      <div className="auth-card" style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:14,padding:"40px 44px",width:400,boxShadow:"0 24px 80px #000c",overflow:"hidden"}}>

        {/* Logo */}
        <Logo/>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#2a4a6a",letterSpacing:3,marginBottom:28,textAlign:"center"}}>PAPER TRADING · MULTIPLAYER</div>

        {/* Animated form */}
        <div style={inputStyle}>
          {/* Title */}
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#e0eaf5",fontWeight:700,marginBottom:20,textAlign:"center",letterSpacing:1}}>
            {mode === "signin" ? "WELCOME BACK" : "CREATE ACCOUNT"}
          </div>

          {/* Username field (signup only) */}
          {mode === "signup" && (
            <AuthInput label="DISPLAY NAME" type="text" value={username}
              onChange={e=>setUsername(e.target.value)} placeholder="e.g. WallStreetKid"/>
          )}

          <AuthInput label="EMAIL" type="email" value={email}
            onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>

          <AuthInput label="PASSWORD" type="password" value={password}
            onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>

          {/* Submit button */}
          <button
            onClick={handleSubmit} disabled={loading}
            style={{width:"100%",background:"#00d4aa22",color:"#00d4aa",border:"1px solid #00d4aa55",borderRadius:8,padding:"12px",fontSize:13,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:2,cursor:loading?"wait":"pointer",transition:"all .15s",marginTop:4,marginBottom:16,opacity:loading?0.6:1}}
            onMouseOver={e=>!loading&&(e.currentTarget.style.background="#00d4aa33")}
            onMouseOut={e=>!loading&&(e.currentTarget.style.background="#00d4aa22")}
          >
            {loading ? "LOADING..." : mode === "signin" ? "SIGN IN →" : "CREATE ACCOUNT →"}
          </button>

          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <div style={{flex:1,height:1,background:"#1a2535"}}/>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#2a4a6a"}}>OR</span>
            <div style={{flex:1,height:1,background:"#1a2535"}}/>
          </div>

          {/* Google button */}
          <button
            onClick={onGoogleSignIn} disabled={loading}
            style={{width:"100%",background:"#fff",color:"#1a1a1a",border:"none",borderRadius:8,padding:"11px 20px",fontSize:13,fontWeight:600,cursor:loading?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .15s",boxShadow:"0 2px 12px #00000044",opacity:loading?0.7:1}}
            onMouseOver={e=>!loading&&(e.currentTarget.style.background="#f0f0f0")}
            onMouseOut={e=>!loading&&(e.currentTarget.style.background="#fff")}
          >
            <GoogleIcon/> Continue with Google
          </button>

          {/* Error */}
          {error && (
            <div style={{marginTop:14,background:"#ff4d6d18",border:"1px solid #ff4d6d44",borderRadius:6,padding:"9px 12px",color:"#ff4d6d",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.5}}>
              ⚠ {error}
            </div>
          )}

          {/* Switch mode */}
          <div style={{marginTop:20,textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#3a5a7a"}}>
            {mode === "signin" ? (
              <>Don't have an account?{" "}
                <span onClick={()=>switchMode("signup")} style={{color:"#00d4aa",cursor:"pointer",textDecoration:"underline"}}>Sign up</span>
              </>
            ) : (
              <>Already have an account?{" "}
                <span onClick={()=>switchMode("signin")} style={{color:"#00d4aa",cursor:"pointer",textDecoration:"underline"}}>Sign in</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner({msg="LOADING"}) {
  return (
    <div style={{width:"100vw",height:"100vh",background:"#080c10",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
        <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" fill="#00d4aa22" stroke="#00d4aa" strokeWidth="1.5"/>
        <polyline points="8,16 12,12 16,15 20,10" stroke="#00d4aa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,letterSpacing:3,color:"#00d4aa"}}>{msg}</div>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
}


// ─── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab({ user, fbRef, privateProfile, setPrivateProfile, settingsMsg, setSettingsMsg, handleSignOut, db_save }) {
  const [newEmail,    setNewEmail]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [currentPass, setCurrentPass] = useState("");
  const [loading,     setLoading]     = useState(false);

  const msg = (text, ok=true) => {
    setSettingsMsg({text, ok});
    setTimeout(() => setSettingsMsg(null), 4000);
  };

  const reauth = async () => {
    const fb = fbRef.current;
    const cred = fb.EmailAuthProvider.credential(user.email, currentPass);
    await fb.reauthenticateWithCredential(user, cred);
  };

  const changeEmail = async () => {
    if (!newEmail.trim()) return msg("Enter a new email.", false);
    if (!currentPass) return msg("Enter your current password to confirm.", false);
    setLoading(true);
    try {
      await reauth();
      await fbRef.current.updateEmail(user, newEmail.trim());
      msg("Email updated successfully!");
      setNewEmail(""); setCurrentPass("");
    } catch(e) {
      const errs = {
        "auth/wrong-password": "Current password is incorrect.",
        "auth/email-already-in-use": "That email is already in use.",
        "auth/invalid-email": "Invalid email address.",
        "auth/requires-recent-login": "Please sign out and sign back in, then try again.",
      };
      msg(errs[e.code] || e.message, false);
    }
    setLoading(false);
  };

  const changePassword = async () => {
    if (newPassword.length < 6) return msg("New password must be at least 6 characters.", false);
    if (newPassword !== confirmPass) return msg("Passwords do not match.", false);
    if (!currentPass) return msg("Enter your current password to confirm.", false);
    setLoading(true);
    try {
      await reauth();
      await fbRef.current.updatePassword(user, newPassword);
      msg("Password updated successfully!");
      setNewPassword(""); setConfirmPass(""); setCurrentPass("");
    } catch(e) {
      const errs = {
        "auth/wrong-password": "Current password is incorrect.",
        "auth/requires-recent-login": "Please sign out and sign back in, then try again.",
      };
      msg(errs[e.code] || e.message, false);
    }
    setLoading(false);
  };

  const togglePrivate = async () => {
    const next = !privateProfile;
    setPrivateProfile(next);
    await db_save(next);
    msg(next ? "Profile set to private — hidden from leaderboard." : "Profile set to public — visible on leaderboard.");
  };

  const isGoogle = user.providerData?.[0]?.providerId === "google.com";

  const Section = ({title, children}) => (
    <div style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:10,padding:"22px 26px",marginBottom:18}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:18}}>{title}</div>
      {children}
    </div>
  );

  const Field = ({label, type, value, onChange, placeholder}) => (
    <div style={{marginBottom:12}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:1,marginBottom:5}}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",maxWidth:360,background:"#0d1520",border:"1px solid #1e2d40",color:"#e0eaf5",borderRadius:6,padding:"9px 12px",fontSize:13,fontFamily:"'IBM Plex Sans',sans-serif",outline:"none",boxSizing:"border-box",transition:"border-color .2s"}}
        onFocus={e=>e.target.style.borderColor="#00d4aa55"}
        onBlur={e=>e.target.style.borderColor="#1e2d40"}
      />
    </div>
  );

  const Btn = ({onClick, children, danger}) => (
    <button onClick={onClick} disabled={loading}
      style={{background:danger?"#ff4d6d22":"#00d4aa22",color:danger?"#ff4d6d":"#00d4aa",border:`1px solid ${danger?"#ff4d6d55":"#00d4aa55"}`,borderRadius:6,padding:"9px 20px",fontSize:12,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:1,cursor:"pointer",transition:"all .15s",opacity:loading?0.6:1}}
      onMouseOver={e=>e.currentTarget.style.opacity="0.8"}
      onMouseOut={e=>e.currentTarget.style.opacity="1"}
    >{children}</button>
  );

  return (
    <div style={{maxWidth:560}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:22}}>ACCOUNT SETTINGS — {user.displayName}</div>

      {/* Status message */}
      {settingsMsg && (
        <div style={{marginBottom:16,background:settingsMsg.ok?"#00d4aa18":"#ff4d6d18",border:`1px solid ${settingsMsg.ok?"#00d4aa44":"#ff4d6d44"}`,borderRadius:6,padding:"10px 14px",color:settingsMsg.ok?"#00d4aa":"#ff4d6d",fontSize:12,fontFamily:"'IBM Plex Mono',monospace",animation:"slideIn .2s ease"}}>
          {settingsMsg.ok?"✓":"⚠"} {settingsMsg.text}
        </div>
      )}

      {/* Profile visibility */}
      <Section title="PRIVACY">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#e0eaf5",marginBottom:4}}>Private Profile</div>
            <div style={{fontSize:12,color:"#4a6a8a",lineHeight:1.5}}>Hide your account from the global leaderboard.<br/>Only you can see your ranking.</div>
          </div>
          <div onClick={togglePrivate} style={{width:48,height:26,borderRadius:13,background:privateProfile?"#00d4aa33":"#1a2535",border:`1px solid ${privateProfile?"#00d4aa":"#2a3a4a"}`,cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}>
            <div style={{position:"absolute",top:3,left:privateProfile?24:3,width:18,height:18,borderRadius:"50%",background:privateProfile?"#00d4aa":"#4a6a8a",transition:"left .2s",boxShadow:"0 1px 4px #0008"}}/>
          </div>
        </div>
      </Section>

      {/* Account info */}
      <Section title="ACCOUNT">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px",marginBottom:4,fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>
          <div><span style={{color:"#4a6a8a"}}>NAME </span><span style={{color:"#e0eaf5"}}>{user.displayName}</span></div>
          <div><span style={{color:"#4a6a8a"}}>EMAIL </span><span style={{color:"#e0eaf5"}}>{user.email}</span></div>
          <div><span style={{color:"#4a6a8a"}}>LOGIN </span><span style={{color:"#e0eaf5"}}>{isGoogle?"Google":"Email"}</span></div>
        </div>
      </Section>

      {/* Change email - email users only */}
      {!isGoogle && (<>
        <Section title="CHANGE EMAIL">
          <Field label="NEW EMAIL" type="email" value={newEmail} onChange={setNewEmail} placeholder="new@email.com"/>
          <Field label="CURRENT PASSWORD" type="password" value={currentPass} onChange={setCurrentPass} placeholder="••••••••"/>
          <Btn onClick={changeEmail}>UPDATE EMAIL</Btn>
        </Section>

        <Section title="CHANGE PASSWORD">
          <Field label="CURRENT PASSWORD" type="password" value={currentPass} onChange={setCurrentPass} placeholder="••••••••"/>
          <Field label="NEW PASSWORD" type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••"/>
          <Field label="CONFIRM NEW PASSWORD" type="password" value={confirmPass} onChange={setConfirmPass} placeholder="••••••••"/>
          <Btn onClick={changePassword}>UPDATE PASSWORD</Btn>
        </Section>
      </>)}

      {isGoogle && (
        <Section title="CHANGE EMAIL / PASSWORD">
          <div style={{fontSize:12,color:"#4a6a8a",fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.7}}>
            You signed in with Google. To change your email or password,<br/>visit your Google account settings at <span style={{color:"#00d4aa"}}>myaccount.google.com</span>
          </div>
        </Section>
      )}

      {/* Sign out */}
      <Section title="SESSION">
        <Btn onClick={handleSignOut} danger>SIGN OUT</Btn>
      </Section>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [fbState,  setFbState]      = useState(null);   // full firebase module object
  const [fbError,  setFbError]      = useState(null);
  const [fbLoading,setFbLoading]    = useState(true);
  const [signInLoading,setSignInLoading] = useState(false);
  const [user,     setUser]         = useState(null);

  const [prices,   setPrices]       = useState(buildInitialPrices);
  const [cash,     setCash]         = useState(STARTING_CASH);
  const [portfolio,setPortfolio]    = useState({});
  const [trades,   setTrades]       = useState([]);
  const [selected, setSelected]     = useState("AAPL");
  const [qty,      setQty]          = useState("");
  const [tab,      setTab]          = useState("trade");
  const [search,   setSearch]       = useState("");
  const [flash,    setFlash]        = useState({});
  const [notif,    setNotif]        = useState(null);
  const [leaderboard,setLeaderboard]= useState([]);
  const [saving,        setSaving]        = useState(false);
  const [nextTick,      setNextTick]      = useState(Date.now()+PRICE_TICK_MS);
  const [privateProfile,setPrivateProfile]= useState(false);
  const [settingsMsg,   setSettingsMsg]   = useState(null);

  const notifTimer = useRef(null);
  const chartRef   = useRef(null);
  const [chartW,   setChartW]       = useState(600);
  const priceRef   = useRef(prices);   priceRef.current = prices;
  const fbRef      = useRef(null);     fbRef.current    = fbState;
  const userRef    = useRef(user);     userRef.current  = user;

  // Measure chart
  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(e => { for(const x of e) setChartW(x.contentRect.width); });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Boot Firebase ──
  useEffect(() => {
    try {
      const fb = initFirebase();
      setFbState(fb);
      fb.onAuthStateChanged(fb.auth, async u => {
        setFbLoading(false);
        if (u) {
          try { await u.reload(); } catch(_) {}
          const freshUser = fb.auth.currentUser || u;
          setUser(freshUser);
          try {
            const snap = await fb.getDoc(fb.doc(fb.db, "players", freshUser.uid));
            if (snap.exists()) {
              const d = snap.data();
              setCash(d.cash ?? STARTING_CASH);
              setPortfolio(d.portfolio ?? {});
              setTrades(d.trades ?? []);
              setPrivateProfile(d.privateProfile ?? false);
            }
          } catch(e) { console.error("Load player:", e); }
        } else {
          setUser(null);
        }
      });
    } catch(err) {
      console.error("Firebase boot error:", err);
      setFbError(err.message || "Could not connect to Firebase.");
      setFbLoading(false);
    }
  }, []);

  // ── Save to Firestore ──
  const save = useCallback(async (cashVal, port, trs, tv) => {
    const fb = fbRef.current;
    const u = userRef.current;
    if (!u || !fb) return;
    setSaving(true);
    try {
      const ts = fb.serverTimestamp();
      await fb.setDoc(fb.doc(fb.db, "players", u.uid),
        { cash:cashVal, portfolio:port, trades:trs, displayName:u.displayName, photoURL:u.photoURL||"", privateProfile:false, updatedAt:ts },
        { merge:true }
      );
      await fb.setDoc(fb.doc(fb.db, "leaderboard", u.uid), {
        name: u.displayName || u.email?.split("@")[0] || "Trader",
        photoURL: u.photoURL || "",
        value: +tv.toFixed(2),
        cash: +cashVal.toFixed(2),
        pnl: +((tv-STARTING_CASH)/STARTING_CASH*100).toFixed(2),
        private: false,
        updatedAt: ts,
      }, { merge:true });
    } catch(e) { console.error("Save error:", e); }
    setSaving(false);
  }, []);

  // ── Leaderboard fetch ──
  const fetchLB = useCallback(async () => {
    const fb = fbRef.current;
    if (!fb) return;
    try {
      const q = fb.collection(fb.db, "leaderboard");
      const snap = await fb.getDocs(q);
      const rows = snap.docs.map(d => ({id:d.id, ...d.data()}));
      rows.sort((a,b) => b.value - a.value);
      setLeaderboard(rows.slice(0, 25));
    } catch(e) { console.error("LB fetch:", e); }
  }, []);

  // ── Price sync via Firestore (shared across all players) ──
  useEffect(() => {
    const fb = fbRef.current;
    if (!fb) return;

    const syncPrices = async () => {
      try {
        const snap = await fb.getDoc(fb.doc(fb.db, "market", "prices"));
        const now = Date.now();
        if (snap.exists()) {
          const d = snap.data();
          const serverTime = d.updatedAt?.toMillis?.() || 0;
          const age = now - serverTime;
          // If server prices are fresh (written in last 35s), use them
          if (age < 35000 && d.prices) {
            // Apply server prices to local candles
            setPrices(prev => {
              const next = {};
              ALL_TICKERS.forEach(t => {
                const serverPrice = d.prices[t];
                if (!serverPrice) { next[t] = prev[t]; return; }
                const old = prev[t];
                const last = old.candles.at(-1);
                const close = serverPrice;
                const h = +(Math.max(last.close, close) * (1 + Math.random()*0.003)).toFixed(2);
                const l = +(Math.min(last.close, close) * (1 - Math.random()*0.003)).toFixed(2);
                next[t] = {
                  candles: [...old.candles.slice(-59), {i:last.i+1, open:last.close, close, high:h, low:l}],
                  current: close, open: old.open,
                };
              });
              priceRef.current = next;
              return next;
            });
            setNextTick(serverTime + PRICE_TICK_MS);
            return;
          }
        }
        // We are the first — generate new prices and write to Firestore
        const next = tickPrices(priceRef.current);
        const priceMap = {};
        ALL_TICKERS.forEach(t => { priceMap[t] = next[t].current; });
        setPrices(next);
        priceRef.current = next;
        setNextTick(now + PRICE_TICK_MS);
        await fb.setDoc(fb.doc(fb.db, "market", "prices"), {
          prices: priceMap,
          updatedAt: fb.serverTimestamp(),
        });
      } catch(e) {
        // Fallback: local tick
        const next = tickPrices(priceRef.current);
        setPrices(next);
        priceRef.current = next;
        setNextTick(Date.now() + PRICE_TICK_MS);
      }
    };

    // Initial load from server
    syncPrices();
    const iv = setInterval(syncPrices, PRICE_TICK_MS);
    return () => clearInterval(iv);
  }, [fbState]);

  // ── Leaderboard poll ──
  useEffect(() => {
    if (!user) return;
    fetchLB();
    const iv = setInterval(fetchLB, LEADERBOARD_SYNC_MS);
    return () => clearInterval(iv);
  }, [user, fetchLB]);

  // ── Sign in / out ──
  const handleGoogleSignIn = async () => {
    const fb = fbRef.current;
    if (!fb) return;
    setSignInLoading(true);
    setFbError(null);
    try {
      const provider = new fb.GoogleAuthProvider();
      await fb.signInWithPopup(fb.auth, provider);
    } catch(e) {
      setFbError(e.code === "auth/popup-blocked"
        ? "Popup was blocked. Please allow popups for this site and try again."
        : e.message || "Sign-in failed. Please try again.");
    }
    setSignInLoading(false);
  };

  const handleEmailSignIn = async (email, password) => {
    const fb = fbRef.current;
    if (!fb) return;
    setSignInLoading(true);
    setFbError(null);
    try {
      await fb.signInWithEmailAndPassword(fb.auth, email, password);
    } catch(e) {
      const msgs = {
        "auth/user-not-found":   "No account found with that email.",
        "auth/wrong-password":   "Incorrect password.",
        "auth/invalid-email":    "Invalid email address.",
        "auth/invalid-credential": "Incorrect email or password.",
      };
      setFbError(msgs[e.code] || e.message || "Sign-in failed.");
    }
    setSignInLoading(false);
  };

  const handleEmailSignUp = async (email, password, username) => {
    const fb = fbRef.current;
    if (!fb) return;
    const trimmed = username.trim();
    if (!trimmed) return setFbError("Please enter a display name.");
    if (trimmed.length < 3) return setFbError("Display name must be at least 3 characters.");
    if (trimmed.length > 20) return setFbError("Display name must be 20 characters or less.");
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return setFbError("Display name can only contain letters, numbers, and underscores.");
    if (password.length < 6) return setFbError("Password must be at least 6 characters.");
    setSignInLoading(true);
    setFbError(null);
    try {
      // Step 1: Create Firebase Auth account first (now we're authenticated)
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, password);

      // Step 2: Now authenticated — check if username is taken
      const nameDoc = await fb.getDoc(fb.doc(fb.db, "usernames", trimmed.toLowerCase()));
      if (nameDoc.exists()) {
        // Username taken — delete the account we just made and bail
        await cred.user.delete();
        setFbError(`"${trimmed}" is already taken. Please choose a different name.`);
        setSignInLoading(false);
        return;
      }

      // Step 3: Set display name
      await fb.updateProfile(cred.user, { displayName: trimmed });

      // Step 4: Write all Firestore docs (now authenticated, no permissions error)
      const ts = fb.serverTimestamp();
      await fb.setDoc(fb.doc(fb.db, "usernames", trimmed.toLowerCase()), {
        uid: cred.user.uid, displayName: trimmed, createdAt: ts,
      });
      await fb.setDoc(fb.doc(fb.db, "players", cred.user.uid), {
        cash: STARTING_CASH, portfolio: {}, trades: [],
        displayName: trimmed, photoURL: "", createdAt: ts,
      });
      await fb.setDoc(fb.doc(fb.db, "leaderboard", cred.user.uid), {
        name: trimmed, photoURL: "", value: STARTING_CASH,
        cash: STARTING_CASH, pnl: 0, private: false, updatedAt: ts,
      });

      // Step 5: Transition into the app
      setCash(STARTING_CASH);
      setPortfolio({});
      setTrades([]);
      setUser({ ...cred.user, displayName: trimmed });
    } catch(e) {
      const msgs = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email":        "Invalid email address.",
        "auth/weak-password":        "Password is too weak — use at least 6 characters.",
      };
      setFbError(msgs[e.code] || e.message || "Sign-up failed.");
    }
    setSignInLoading(false);
  };

  const handleSignOut = async () => {
    const fb = fbRef.current;
    if (fb) await fb.signOut(fb.auth);
    setUser(null); setCash(STARTING_CASH); setPortfolio({}); setTrades([]);
  };

  // ── Notify helper ──
  function notify(msg, ok=true) {
    setNotif({msg,ok});
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(()=>setNotif(null), 3000);
  }
  function flashTicker(t) {
    setFlash(f=>({...f,[t]:1}));
    setTimeout(()=>setFlash(f=>{const n={...f};delete n[t];return n;}),500);
  }

  function getTotalValue(c=cash,p=portfolio,px=prices) {
    let total = c;
    Object.entries(p).forEach(([t,sh])=>{ total+=(px[t]?.current||0)*sh; });
    return total;
  }

  // ── Buy / Sell ──
  async function trade(type) {
    const n = parseInt(qty);
    if (!n||n<=0) return notify("Enter a valid quantity", false);
    const price = prices[selected]?.current;
    if (type==="BUY") {
      const cost = +(price*n).toFixed(2);
      if (cost>cash) return notify("Insufficient funds", false);
      const nc=+(cash-cost).toFixed(2), np={...portfolio,[selected]:(portfolio[selected]||0)+n};
      const nt=[{id:Date.now(),type:"BUY",ticker:selected,qty:n,price,total:cost,time:new Date().toLocaleTimeString()},...trades.slice(0,49)];
      setCash(nc); setPortfolio(np); setTrades(nt);
      flashTicker(selected); notify(`Bought ${n} × ${selected} @ ${fmtUSD(price)}`); setQty("");
      const tv=getTotalValue(nc,np,prices);
      await save(nc,np,nt,tv); fetchLB();
    } else {
      const held=portfolio[selected]||0;
      if (n>held) return notify(`You only hold ${held} shares`, false);
      const proceeds=+(price*n).toFixed(2), nc=+(cash+proceeds).toFixed(2);
      const np={...portfolio,[selected]:portfolio[selected]-n};
      if(np[selected]===0) delete np[selected];
      const nt=[{id:Date.now(),type:"SELL",ticker:selected,qty:n,price,total:proceeds,time:new Date().toLocaleTimeString()},...trades.slice(0,49)];
      setCash(nc); setPortfolio(np); setTrades(nt);
      flashTicker(selected); notify(`Sold ${n} × ${selected} @ ${fmtUSD(price)}`); setQty("");
      const tv=getTotalValue(nc,np,prices);
      await save(nc,np,nt,tv); fetchLB();
    }
  }

  // ─── Render gates ───────────────────────────────────────────────────────────
  if (fbLoading) return <Spinner msg="LOADING TRADEFORGE..." />;
  if (!user)     return <SignInScreen onEmailSignIn={handleEmailSignIn} onEmailSignUp={handleEmailSignUp} onGoogleSignIn={handleGoogleSignIn} error={fbError} loading={signInLoading}/>;
  // Smooth fade-in when entering the app

  const sel          = prices[selected] || {candles:[], current:0, open:0};
  const dayChange    = sel.current - sel.open;
  const dayChangePct = sel.open ? (dayChange/sel.open)*100 : 0;
  const totalValue   = getTotalValue();
  const totalPnL     = totalValue - STARTING_CASH;
  const myRank       = leaderboard.findIndex(r=>r.id===user.uid)+1;
  const filtered     = search ? ALL_TICKERS.filter(t=>t.includes(search.toUpperCase())) : null;

  return (
    <div style={{height:"100vh",width:"100vw",maxWidth:"100%",background:"#080c10",color:"#c8d6e5",fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",display:"flex",flexDirection:"column",overflow:"hidden",position:"fixed",top:0,left:0,animation:"appFadeIn .5s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;600&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overflow:hidden}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0a0f14}::-webkit-scrollbar-thumb{background:#1e2d40;border-radius:2px}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .tr:hover{background:#0d1a26!important}
        .tab-btn{background:none;border:none;color:#5a7a9a;padding:12px 22px;font-size:13px;font-family:'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
        .tab-btn.active{color:#00d4aa;border-bottom-color:#00d4aa}
        .tab-btn:hover{color:#90b8d8}
        .abtn{border:none;border-radius:5px;padding:12px 32px;font-size:14px;font-family:'IBM Plex Mono',monospace;font-weight:700;letter-spacing:1px;cursor:pointer;transition:all .15s}
        .buy-btn{background:#00d4aa22;color:#00d4aa;border:1px solid #00d4aa55}
        .buy-btn:hover{background:#00d4aa33;box-shadow:0 0 18px #00d4aa44}
        .sell-btn{background:#ff4d6d22;color:#ff4d6d;border:1px solid #ff4d6d55}
        .sell-btn:hover{background:#ff4d6d33;box-shadow:0 0 18px #ff4d6d44}
        .ctog{background:none;border:1px solid #1e2d40;color:#5a7a9a;padding:5px 13px;font-size:11px;font-family:'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer;transition:all .15s;border-radius:3px}
        .ctog.on{background:#00d4aa18;color:#00d4aa;border-color:#00d4aa55}
        .ctog:hover{color:#c8d6e5}
        @keyframes flash{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes slideIn{from{transform:translateY(-14px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        .sector-lbl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#2a4a6a;letter-spacing:2px;padding:8px 14px 4px;border-bottom:1px solid #0d1520}
        @keyframes appFadeIn{from{opacity:0;transform:scale(0.99)}to{opacity:1;transform:scale(1)}}
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{background:"#0a0f14",borderBottom:"1px solid #1a2535",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,flexWrap:"wrap",gap:10}}>
        {/* Brand */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" fill="#00d4aa22" stroke="#00d4aa" strokeWidth="1.5"/>
            <polyline points="8,16 12,12 16,15 20,10" stroke="#00d4aa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:14,letterSpacing:2,color:"#e0eaf5",fontWeight:700}}>TradeForge</span>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#2a4a6a",letterSpacing:1}}>Stocks({ALL_TICKERS.length})</span>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#00d4aa",boxShadow:"0 0 6px #00d4aa",animation:"pulse 2s infinite"}}/>
          {myRank>0 && <Tag color="#7b9dbe">RANK #{myRank}</Tag>}
          {saving && <Tag color="#f5a623">SAVING</Tag>}
        </div>
        {/* Stats */}
        <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:24,fontFamily:"'IBM Plex Mono',monospace",fontSize:13}}>
            <div><span style={{color:"#3a5a7a",marginRight:5}}>CASH</span><span style={{color:"#c8d6e5"}}>{fmtUSD(cash)}</span></div>
            <div><span style={{color:"#3a5a7a",marginRight:5}}>NAV</span><span style={{color:clr(totalPnL),textShadow:`0 0 8px ${clr(totalPnL)}55`}}>{fmtUSD(totalValue)}</span></div>
            <div><span style={{color:"#3a5a7a",marginRight:5}}>P&L</span><span style={{color:clr(totalPnL),fontWeight:700}}>{totalPnL>=0?"+":""}{fmtUSD(totalPnL)}</span></div>
          </div>
          <Countdown nextTick={nextTick}/>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {user.photoURL && <img src={user.photoURL} alt="" style={{width:24,height:24,borderRadius:"50%",border:"1px solid #1a2535"}}/>}
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#7b9dbe"}}>{user.displayName?.split(" ")[0]||"Trader"}</span>
            <button className="ctog" onClick={handleSignOut} style={{fontSize:10,padding:"3px 8px"}}>SIGN OUT</button>
          </div>
        </div>
      </div>

      {/* ── NOTIFICATION ── */}
      {notif && (
        <div style={{position:"fixed",top:58,right:18,zIndex:999,background:notif.ok?"#00d4aa18":"#ff4d6d18",border:`1px solid ${notif.ok?"#00d4aa55":"#ff4d6d55"}`,color:notif.ok?"#00d4aa":"#ff4d6d",padding:"9px 18px",borderRadius:6,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,animation:"slideIn .2s ease",boxShadow:`0 4px 20px ${notif.ok?"#00d4aa18":"#ff4d6d18"}`}}>
          {notif.msg}
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{background:"#0a0f14",borderBottom:"1px solid #1a2535",paddingLeft:12,flexShrink:0}}>
        {["trade","portfolio","leaderboard","settings"].map(t=>(
          <button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── SIDEBAR ── */}
        <div style={{width:200,borderRight:"1px solid #1a2535",overflowY:"auto",flexShrink:0,display:"flex",flexDirection:"column"}}>
          {/* Search box */}
          <div style={{padding:"8px 10px",borderBottom:"1px solid #1a2535",position:"sticky",top:0,background:"#080c10",zIndex:2}}>
            <input placeholder="Ticker or category..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{width:"100%",background:"#0d1520",border:"1px solid #1a2535",color:"#c8d6e5",borderRadius:4,padding:"5px 8px",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",outline:"none",boxSizing:"border-box"}}/>
          </div>
          {/* Results */}
          {(() => {
            if (!search) {
              // Show all sectors normally
              return Object.entries(SECTORS).map(([lbl,tks])=>(
                <div key={lbl}>
                  <div className="sector-lbl">— {lbl} —</div>
                  {tks.map(t=><TickerRow key={t} t={t} prices={prices} selected={selected} flash={flash} onSelect={()=>{setSelected(t);setTab("trade");}}/>)}
                </div>
              ));
            }
            const q = search.toUpperCase();
            const qLower = search.toLowerCase();
            // Check if query matches a category name
            const matchedSectors = Object.entries(SECTORS).filter(([lbl]) =>
              lbl.toLowerCase().includes(qLower) || lbl.replace(/[^a-zA-Z ]/g,"").toLowerCase().includes(qLower)
            );
            if (matchedSectors.length > 0) {
              return matchedSectors.map(([lbl,tks])=>(
                <div key={lbl}>
                  <div className="sector-lbl">— {lbl} —</div>
                  {tks.map(t=><TickerRow key={t} t={t} prices={prices} selected={selected} flash={flash} onSelect={()=>{setSelected(t);setTab("trade");}}/>)}
                </div>
              ));
            }
            // Otherwise search by ticker or company name
            const byTicker = ALL_TICKERS.filter(t => t.includes(q));
            const byName   = ALL_TICKERS.filter(t => !t.includes(q) && (COMPANY_NAMES[t]||"").toUpperCase().includes(q));
            const results  = [...byTicker, ...byName];
            if (results.length === 0) return (
              <div style={{padding:"20px 14px",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#3a5a7a",textAlign:"center"}}>No results for "{search}"</div>
            );
            return results.map(t=><TickerRow key={t} t={t} prices={prices} selected={selected} flash={flash} onSelect={()=>{setSelected(t);setTab("trade");}}/>);
          })()}
        </div>

        {/* ── MAIN ── */}
        <div style={{flex:1,overflowY:"auto",padding:"28px 40px",minWidth:0}}>

          {/* ════ TRADE ════ */}
          {tab==="trade" && (
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"flex-end",gap:16,marginBottom:20,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:28,fontWeight:700,color:"#e0eaf5",letterSpacing:2}}>
                    {selected}<span style={{fontSize:14,color:"#4a6a8a",fontWeight:400,marginLeft:10}}>({COMPANY_NAMES[selected]||""})</span>
                  </div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a5a7a",marginTop:2}}>TradeForge · <span style={{color:"#00d4aa88"}}>⟳ Prices sync every 30 seconds</span></div>
                </div>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:34,fontWeight:700,color:"#e0eaf5",marginBottom:2}}>{fmtUSD(sel.current)}</span>
                <Tag color={clr(dayChange)}>{dayChange>=0?"▲":"▼"} {fmtUSD(Math.abs(dayChange))} ({fmtPct(dayChangePct)})</Tag>
                {portfolio[selected]>0 && <Tag color="#7b9dbe">HELD: {portfolio[selected]}</Tag>}
              </div>

              {/* Chart */}
              <div ref={chartRef} style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,padding:"4px 0",marginBottom:20,overflow:"hidden"}}>
                <StockChart candles={sel.candles} isUp={dayChange>=0} width={Math.max(400,chartW)} height={220}/>
              </div>

              {/* Order panel */}
              <div style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,padding:24,maxWidth:480}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:14}}>PLACE ORDER</div>
                <div style={{display:"flex",gap:12,marginBottom:14}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:"#4a6a8a",marginBottom:6,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:1}}>SHARES</div>
                    <input type="number" placeholder="0" value={qty} onChange={e=>setQty(e.target.value)}
                      style={{width:"100%",background:"#0d1520",border:"1px solid #1e2d40",color:"#e0eaf5",borderRadius:4,padding:"12px 16px",fontSize:22,fontFamily:"'IBM Plex Mono',monospace",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:"#4a6a8a",marginBottom:6,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:1}}>COST EST.</div>
                    <div style={{background:"#0d1520",border:"1px solid #1e2d40",borderRadius:4,padding:"12px 16px",fontSize:22,fontFamily:"'IBM Plex Mono',monospace",color:"#7b9dbe"}}>
                      {qty&&parseInt(qty)>0 ? fmtUSD(sel.current*parseInt(qty)) : "—"}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="abtn buy-btn" onClick={()=>trade("BUY")}>BUY</button>
                  <button className="abtn sell-btn" onClick={()=>trade("SELL")}>SELL</button>
                </div>
                <div style={{marginTop:12,fontSize:11,color:"#3a5a7a",fontFamily:"'IBM Plex Mono',monospace"}}>
                  Cash: {fmtUSD(cash)} · Max: {Math.floor(cash/(sel.current||1))} shares
                </div>
              </div>

              {/* Order history */}
              {trades.length>0 && (
                <div style={{marginTop:24}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:10}}>ORDER HISTORY</div>
                  <div style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,overflow:"hidden"}}>
                    {trades.slice(0,10).map(tr=>(
                      <div key={tr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid #0d1520",gap:8,flexWrap:"wrap"}}>
                        <Tag color={tr.type==="BUY"?"#00d4aa":"#ff4d6d"}>{tr.type}</Tag>
                        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#e0eaf5",minWidth:44}}>{tr.ticker}</span>
                        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#8ab0cc"}}>{tr.qty}×{fmtUSD(tr.price)}</span>
                        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:tr.type==="BUY"?"#ff4d6d":"#00d4aa"}}>{tr.type==="BUY"?"−":"+"}{fmtUSD(tr.total)}</span>
                        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a5a7a"}}>{tr.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ PORTFOLIO ════ */}
          {tab==="portfolio" && (
            <div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:18}}>HOLDINGS — {user.displayName}</div>
              {Object.keys(portfolio).length===0
                ? <div style={{color:"#3a5a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,padding:"36px 0"}}>No positions yet — start trading!</div>
                : <div style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,overflow:"hidden",marginBottom:24}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",padding:"10px 14px",borderBottom:"1px solid #1a2535",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:1}}>
                      {["TICKER","SHARES","PRICE","VALUE","P&L"].map(h=><div key={h}>{h}</div>)}
                    </div>
                    {Object.entries(portfolio).map(([t,shares])=>{
                      const p=prices[t]?.current||0, val=p*shares;
                      const buys=trades.filter(tr=>tr.ticker===t&&tr.type==="BUY");
                      const avgCost=buys.length ? buys.reduce((s,tr)=>s+tr.total,0)/buys.reduce((s,tr)=>s+tr.qty,0) : p;
                      const pnl=(p-avgCost)*shares;
                      return (
                        <div key={t} className="tr" onClick={()=>{setSelected(t);setTab("trade");}}
                          style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",padding:"11px 14px",borderBottom:"1px solid #0d1520",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,cursor:"pointer"}}>
                          <div style={{color:"#e0eaf5",fontWeight:700}}>{t}</div>
                          <div style={{color:"#8ab0cc"}}>{shares}</div>
                          <div style={{color:"#8ab0cc"}}>{fmtUSD(p)}</div>
                          <div style={{color:"#e0eaf5"}}>{fmtUSD(val)}</div>
                          <div style={{color:clr(pnl)}}>{pnl>=0?"+":""}{fmtUSD(pnl)}</div>
                        </div>
                      );
                    })}
                  </div>
              }
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
                {[
                  {label:"CASH",     val:fmtUSD(cash),                                 raw:1},
                  {label:"INVESTED", val:fmtUSD(totalValue-cash),                      raw:1},
                  {label:"TOTAL P&L",val:(totalPnL>=0?"+":"")+fmtUSD(totalPnL), raw:totalPnL},
                ].map(({label,val,raw})=>(
                  <div key={label} style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,padding:"14px 16px"}}>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2,marginBottom:8}}>{label}</div>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:19,fontWeight:700,color:label==="TOTAL P&L"?clr(raw):"#e0eaf5"}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════ SETTINGS ════ */}
          {tab==="settings" && (
            <SettingsTab
              user={user}
              fbRef={fbRef}
              privateProfile={privateProfile}
              setPrivateProfile={setPrivateProfile}
              settingsMsg={settingsMsg}
              setSettingsMsg={setSettingsMsg}
              handleSignOut={handleSignOut}
              db_save={async(priv)=>{
                const fb=fbRef.current; const u=userRef.current;
                if(!fb||!u) return;
                await fb.setDoc(fb.doc(fb.db,"players",u.uid),{privateProfile:priv},{merge:true});
                await fb.setDoc(fb.doc(fb.db,"leaderboard",u.uid),{private:priv},{merge:true});
              }}
            />
          )}

          {/* ════ LEADERBOARD ════ */}
          {tab==="leaderboard" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#4a6a8a",letterSpacing:2}}>GLOBAL LEADERBOARD · $10K START · LIVE</div>
                <button className="ctog" onClick={fetchLB} style={{fontSize:10}}>↻ REFRESH</button>
              </div>
              {leaderboard.length===0
                ? <div style={{color:"#3a5a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:13}}>No players yet — be the first!</div>
                : <div style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,overflow:"hidden"}}>
                    <div style={{display:"grid",gridTemplateColumns:"52px 44px 1fr 1fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #1a2535",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#4a6a8a",letterSpacing:1}}>
                      {["#","","TRADER","PORTFOLIO","CASH","RETURN"].map(h=><div key={h}>{h}</div>)}
                    </div>
                    {leaderboard.filter(r=>!r.private||r.id===user.uid).map((r,i)=>(
                      <div key={r.id} style={{display:"grid",gridTemplateColumns:"52px 44px 1fr 1fr 1fr 1fr",padding:"14px 20px",borderBottom:"1px solid #0d1520",background:r.id===user.uid?"#00d4aa08":"transparent",borderLeft:r.id===user.uid?"2px solid #00d4aa":"2px solid transparent",alignItems:"center"}}>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":"#3a5a7a"}}>
                          {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                        </div>
                        <div>
                          {r.photoURL
                            ? <img src={r.photoURL} alt="" style={{width:24,height:24,borderRadius:"50%",border:"1px solid #1a2535",display:"block"}}/>
                            : <div style={{width:24,height:24,borderRadius:"50%",background:"#1a2535",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#4a6a8a",fontFamily:"'IBM Plex Mono',monospace"}}>{r.name?.[0]?.toUpperCase()}</div>
                          }
                        </div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:r.id===user.uid?"#00d4aa":"#e0eaf5",fontWeight:r.id===user.uid?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {r.name}{r.private&&r.id===user.uid&&<span style={{color:"#3a5a7a",fontSize:10,marginLeft:6}}>(private)</span>}
                        </div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#8ab0cc"}}>{fmtUSD(r.value)}</div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#c8d6e5"}}>{fmtUSD(r.cash||0)}</div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:clr(r.pnl)}}>{fmtPct(r.pnl)}</div>
                      </div>
                    ))}
                  </div>
              }
              <div style={{marginTop:14,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#2a4a6a",lineHeight:2}}>
                ✓ Signed in as {user.displayName} — progress auto-saved to Google<br/>
                ✓ Prices update every 30s for all players<br/>
                ✓ Leaderboard refreshes every {LEADERBOARD_SYNC_MS/1000}s automatically
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}