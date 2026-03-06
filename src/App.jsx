import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
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
const PRICE_TICK_MS       = 60_000;
const LEADERBOARD_SYNC_MS = 15_000;

const ALL_TICKERS = [
  "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","NFLX","AMD","INTC","CRM","ORCL","ADBE","QCOM","UBER",
  "JPM","BAC","GS","V","MA",
  "SPY","QQQ","DIA","IWM",
  "DIS","NKE","KO","PEP","WMT","MCD","XOM","JNJ","PFE","BA",
];
const SECTORS = {
  "TECH":    ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","NFLX","AMD","INTC","CRM","ORCL","ADBE","QCOM","UBER"],
  "FINANCE": ["JPM","BAC","GS","V","MA"],
  "ETFs":    ["SPY","QQQ","DIA","IWM"],
  "OTHER":   ["DIS","NKE","KO","PEP","WMT","MCD","XOM","JNJ","PFE","BA"],
};
const BASES = {
  AAPL:189,MSFT:415,GOOGL:175,AMZN:195,META:510,NVDA:875,TSLA:248,NFLX:628,
  AMD:178,INTC:42,CRM:298,ORCL:145,ADBE:520,QCOM:168,UBER:74,
  JPM:195,BAC:38,GS:465,V:278,MA:464,
  SPY:523,QQQ:447,DIA:395,IWM:208,
  DIS:112,NKE:88,KO:62,PEP:175,WMT:88,MCD:295,XOM:118,JNJ:165,PFE:29,BA:175,
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
    doc, getDoc, setDoc, collection, getDocs, serverTimestamp,
  };
}

// ─── Candlestick Chart ─────────────────────────────────────────────────────────
function CandlestickChart({ candles, width=600, height=196 }) {
  if (!candles?.length) return null;
  const pad = {l:4, r:4, t:8, b:8};
  const iW = width-pad.l-pad.r, iH = height-pad.t-pad.b;
  const yMax = Math.max(...candles.map(c=>c.high))*1.002;
  const yMin = Math.min(...candles.map(c=>c.low))*0.998;
  const yr = yMax-yMin || 1;
  const toY = v => pad.t + iH - ((v-yMin)/yr)*iH;
  const n = candles.length, cw = iW/n, bw = Math.max(1.5, cw*0.6);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{display:"block"}}>
      {[.25,.5,.75].map(f => <line key={f} x1={pad.l} y1={pad.t+iH*f} x2={pad.l+iW} y2={pad.t+iH*f} stroke="#1a2535" strokeWidth={0.5} strokeDasharray="4 4"/>)}
      {candles.map((c, idx) => {
        const x = pad.l+idx*cw+cw/2, isUp = c.close>=c.open, col = isUp?"#00d4aa":"#ff4d6d";
        const bTop = toY(Math.max(c.open,c.close)), bBot = toY(Math.min(c.open,c.close)), bH = Math.max(1, bBot-bTop);
        return <g key={idx}>
          <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={col} strokeWidth={1} opacity={0.65}/>
          <rect x={x-bw/2} y={bTop} width={bw} height={bH} fill={col+"cc"} stroke={col} strokeWidth={0.5}/>
        </g>;
      })}
    </svg>
  );
}

// ─── UI Atoms ──────────────────────────────────────────────────────────────────
const Tag = ({children, color}) => (
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:3,padding:"1px 7px",fontSize:11,fontFamily:"monospace",letterSpacing:1}}>{children}</span>
);

function LineTooltip({active, payload}) {
  if (!active || !payload?.length) return null;
  return <div style={{background:"#0d1520",border:"1px solid #1a2535",borderRadius:4,padding:"6px 10px",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#c8d6e5"}}>{fmtUSD(payload[0].value)}</div>;
}

function TickerRow({t, prices, selected, flash, onSelect}) {
  const p = prices[t], chg = p ? ((p.current-p.open)/p.open)*100 : 0;
  return (
    <div className="tr" onClick={onSelect} style={{padding:"9px 14px",borderBottom:"1px solid #0d1520",background:selected===t?"#0d1a26":"transparent",borderLeft:selected===t?"2px solid #00d4aa":"2px solid transparent",animation:flash[t]?"flash .5s":"none",cursor:"pointer"}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#e0eaf5",fontWeight:600}}>{t}</div>
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
  const [chartMode,setChartMode]    = useState("line");
  const [search,   setSearch]       = useState("");
  const [flash,    setFlash]        = useState({});
  const [notif,    setNotif]        = useState(null);
  const [leaderboard,setLeaderboard]= useState([]);
  const [saving,   setSaving]       = useState(false);
  const [nextTick, setNextTick]     = useState(Date.now()+PRICE_TICK_MS);

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
        { cash:cashVal, portfolio:port, trades:trs, displayName:u.displayName, photoURL:u.photoURL||"", updatedAt:ts },
        { merge:true }
      );
      await fb.setDoc(fb.doc(fb.db, "leaderboard", u.uid), {
        name: u.displayName || u.email?.split("@")[0] || "Trader",
        photoURL: u.photoURL || "",
        value: +tv.toFixed(2),
        pnl: +((tv-STARTING_CASH)/STARTING_CASH*100).toFixed(2),
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

  // ── Price tick every minute ──
  useEffect(() => {
    const iv = setInterval(() => {
      const next = tickPrices(priceRef.current);
      setPrices(next);
      priceRef.current = next;
      setNextTick(Date.now() + PRICE_TICK_MS);
    }, PRICE_TICK_MS);
    return () => clearInterval(iv);
  }, []);

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
      // Check if display name is already taken in Firestore
      const nameSnap = await fb.getDocs(fb.collection(fb.db, "usernames"));
      const taken = nameSnap.docs.map(d => d.id.toLowerCase());
      if (taken.includes(trimmed.toLowerCase())) {
        setFbError(`"${trimmed}" is already taken. Please choose a different name.`);
        setSignInLoading(false);
        return;
      }
      // Create the account
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, password);
      // Update display name
      await fb.updateProfile(cred.user, { displayName: trimmed });
      // Reserve the username in Firestore
      await fb.setDoc(fb.doc(fb.db, "usernames", trimmed.toLowerCase()), {
        uid: cred.user.uid, displayName: trimmed, createdAt: fb.serverTimestamp()
      });
      // Initialize player data
      await fb.setDoc(fb.doc(fb.db, "players", cred.user.uid), {
        cash: STARTING_CASH, portfolio: {}, trades: [],
        displayName: trimmed, photoURL: "", createdAt: fb.serverTimestamp()
      });
      // Initialize leaderboard entry
      await fb.setDoc(fb.doc(fb.db, "leaderboard", cred.user.uid), {
        name: trimmed, photoURL: "", value: STARTING_CASH,
        pnl: 0, updatedAt: fb.serverTimestamp()
      });
      // Manually set the user state so the app transitions immediately
      // (onAuthStateChanged may have fired before displayName was set)
      setCash(STARTING_CASH);
      setPortfolio({});
      setTrades([]);
      setUser({ ...cred.user, displayName: trimmed });
    } catch(e) {
      const msgs = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email":        "Invalid email address.",
        "auth/weak-password":        "Password is too weak (min 6 characters).",
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
  const lineData     = sel.candles.map(c=>({t:c.i, price:c.close}));
  const lastCandle   = sel.candles.at(-1);
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
        {["trade","portfolio","leaderboard"].map(t=>(
          <button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── SIDEBAR ── */}
        <div style={{width:200,borderRight:"1px solid #1a2535",overflowY:"auto",flexShrink:0}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid #1a2535",position:"sticky",top:0,background:"#080c10",zIndex:2}}>
            <input placeholder="Search ticker..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{width:"100%",background:"#0d1520",border:"1px solid #1a2535",color:"#c8d6e5",borderRadius:4,padding:"5px 8px",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",outline:"none",boxSizing:"border-box"}}/>
          </div>
          {filtered
            ? filtered.map(t=><TickerRow key={t} t={t} prices={prices} selected={selected} flash={flash} onSelect={()=>{setSelected(t);setTab("trade");}}/>)
            : Object.entries(SECTORS).map(([lbl,tks])=>(
                <div key={lbl}>
                  <div className="sector-lbl">— {lbl} —</div>
                  {tks.map(t=><TickerRow key={t} t={t} prices={prices} selected={selected} flash={flash} onSelect={()=>{setSelected(t);setTab("trade");}}/>)}
                </div>
              ))
          }
        </div>

        {/* ── MAIN ── */}
        <div style={{flex:1,overflowY:"auto",padding:"28px 40px",minWidth:0}}>

          {/* ════ TRADE ════ */}
          {tab==="trade" && (
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"flex-end",gap:16,marginBottom:20,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:28,fontWeight:700,color:"#e0eaf5",letterSpacing:2}}>{selected}</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a5a7a",marginTop:2}}>TradeForge · 1-MIN CANDLES</div>
                </div>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:34,fontWeight:700,color:"#e0eaf5",marginBottom:2}}>{fmtUSD(sel.current)}</span>
                <Tag color={clr(dayChange)}>{dayChange>=0?"▲":"▼"} {fmtUSD(Math.abs(dayChange))} ({fmtPct(dayChangePct)})</Tag>
                {portfolio[selected]>0 && <Tag color="#7b9dbe">HELD: {portfolio[selected]}</Tag>}
              </div>

              {/* Chart toggle */}
              <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a5a7a"}}>CHART:</span>
                <button className={`ctog ${chartMode==="line"?"on":""}`} onClick={()=>setChartMode("line")}>LINE</button>
                <button className={`ctog ${chartMode==="candle"?"on":""}`} onClick={()=>setChartMode("candle")}>CANDLE</button>
              </div>

              {/* Chart */}
              <div ref={chartRef} style={{background:"#0a0f14",border:"1px solid #1a2535",borderRadius:8,padding:chartMode==="line"?"14px 8px 8px":"10px",marginBottom:chartMode==="candle"?0:24,height:320,overflow:"hidden"}}>
                {chartMode==="line"
                  ? <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineData}>
                        <XAxis dataKey="t" hide/><YAxis domain={["auto","auto"]} hide/>
                        <Tooltip content={<LineTooltip/>}/>
                        <ReferenceLine y={sel.open} stroke="#1e3a5a" strokeDasharray="4 4"/>
                        <Line type="monotone" dataKey="price" stroke={clr(dayChange)} strokeWidth={2} dot={false} style={{filter:`drop-shadow(0 0 4px ${clr(dayChange)}88)`}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  : <CandlestickChart candles={sel.candles} width={Math.max(100,chartW-20)} height={300}/>
                }
              </div>

              {/* OHLC strip (candle mode) */}
              {chartMode==="candle" && lastCandle && (
                <div style={{display:"flex",gap:18,marginBottom:18,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"7px 12px",background:"#0a0f14",border:"1px solid #1a2535",borderTop:"none",borderRadius:"0 0 8px 8px",flexWrap:"wrap"}}>
                  {[["O",lastCandle.open],["H",lastCandle.high],["L",lastCandle.low],["C",lastCandle.close]].map(([l,v])=>(
                    <div key={l}><span style={{color:"#4a6a8a"}}>{l} </span><span style={{color:"#c8d6e5"}}>{fmtUSD(v)}</span></div>
                  ))}
                  <div style={{marginLeft:"auto",color:clr(lastCandle.close-lastCandle.open)}}>
                    {lastCandle.close>=lastCandle.open?"▲":"▼"} {fmtPct(((lastCandle.close-lastCandle.open)/lastCandle.open)*100)}
                  </div>
                </div>
              )}

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
                    <div style={{display:"grid",gridTemplateColumns:"52px 44px 1fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #1a2535",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#4a6a8a",letterSpacing:1}}>
                      {["#","","TRADER","PORTFOLIO","RETURN"].map(h=><div key={h}>{h}</div>)}
                    </div>
                    {leaderboard.map((r,i)=>(
                      <div key={r.id} style={{display:"grid",gridTemplateColumns:"52px 44px 1fr 1fr 1fr",padding:"14px 20px",borderBottom:"1px solid #0d1520",background:r.id===user.uid?"#00d4aa08":"transparent",borderLeft:r.id===user.uid?"2px solid #00d4aa":"2px solid transparent",alignItems:"center"}}>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":"#3a5a7a"}}>
                          {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                        </div>
                        <div>
                          {r.photoURL
                            ? <img src={r.photoURL} alt="" style={{width:24,height:24,borderRadius:"50%",border:"1px solid #1a2535",display:"block"}}/>
                            : <div style={{width:24,height:24,borderRadius:"50%",background:"#1a2535",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#4a6a8a",fontFamily:"'IBM Plex Mono',monospace"}}>{r.name?.[0]?.toUpperCase()}</div>
                          }
                        </div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:r.id===user.uid?"#00d4aa":"#e0eaf5",fontWeight:r.id===user.uid?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#8ab0cc"}}>{fmtUSD(r.value)}</div>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:clr(r.pnl)}}>{fmtPct(r.pnl)}</div>
                      </div>
                    ))}
                  </div>
              }
              <div style={{marginTop:14,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#2a4a6a",lineHeight:2}}>
                ✓ Signed in as {user.displayName} — progress auto-saved to Google<br/>
                ✓ Prices update every 60s for all players<br/>
                ✓ Leaderboard refreshes every {LEADERBOARD_SYNC_MS/1000}s automatically
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}