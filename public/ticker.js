// HELIX Ticker — scrolling stats marquee (self-contained, zero dependencies).
// Lifted from the VitaForge component per HELIXTICKERINTEGRATION.md.
/* ============ HELIX TICKER COMPONENT JS (self-contained) ============ */
var HelixTicker = (function(){
  var PREFS_KEY = 'helix_ticker_prefs_v3';
  var state = { speed: 45 /* px per second */, paused: false, offset: 0, raf: null, lastT: 0,
    stats: [], prefs: null, opts: {}, host: null };

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function loadPrefs(){
    try { var p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (p && p.groups) return p; } catch(e){}
    return { groups: { markets: true, business: true, custom: true }, hidden: {}, custom: [] };
  }
  function savePrefs(){ try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch(e){} }

  function fmtVal(v){
    if (typeof v === 'number') return v >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits:2}) : String(Math.round(v*100)/100);
    return String(v);
  }
  function deltaHtml(chg, pct){
    if (chg == null && pct == null) return '';
    var n = (pct != null ? pct : chg);
    var cls = n > 0 ? 'hx-up' : (n < 0 ? 'hx-down' : 'hx-flat');
    var arrow = n > 0 ? '▲' : (n < 0 ? '▼' : '•');
    var bits = [];
    if (chg != null) bits.push((chg>0?'+':'') + fmtVal(chg));
    if (pct != null) bits.push((pct>0?'+':'') + (Math.round(pct*100)/100) + '%');
    return '<span class="d '+cls+'">'+arrow+' '+bits.join(' · ')+'</span>';
  }

  // Build the visible stat list from groups + hidden map.
  function visibleStats(){
    return state.stats.filter(function(s){
      if (!state.prefs.groups[s.group]) return false;
      if (state.prefs.hidden[s.id]) return false;
      return true;
    });
  }

  function statInner(s){
    var sample = s.group === 'markets' && !s.live;
    return '<span class="k"'+(sample?' title="Illustrative sample quote — real market data arrives when you connect it in Settings"':'')+'>'+
      esc(s.label)+(sample?'<sup>✱</sup>':'')+'</span>'+
      '<span class="v">'+esc(fmtVal(s.value))+'</span>'+deltaHtml(s.change, s.changePct);
  }

  function render(){
    var host = state.host;
    // innerHTML rebuild would otherwise close the menu and wipe typed input
    var prevMenu = host.querySelector('#hxMenu');
    var keepOpen = !!(prevMenu && prevMenu.classList.contains('open'));
    var keepLabel = prevMenu && prevMenu.querySelector('#hxCLabel') ? prevMenu.querySelector('#hxCLabel').value : '';
    var keepValue = prevMenu && prevMenu.querySelector('#hxCValue') ? prevMenu.querySelector('#hxCValue').value : '';
    var vis = visibleStats();
    // The badge describes what is actually on screen: business + custom stats
    // are always real workspace numbers; only sample market rows demote it.
    var sampleShown = vis.some(function(s){ return s.group==='markets' && !s.live; });
    var badge = sampleShown
      ? '<div class="hx-live demo" title="Rows marked ✱ are illustrative sample quotes. Your business stats are always real."><span class="dot"></span>SAMPLE</div>'
      : '<div class="hx-live" title="Every number here is computed live from your workspace."><span class="dot"></span>LIVE</div>';
    var itemHtml = vis.map(function(s){
      return '<div class="hx-stat" data-id="'+esc(s.id)+'">'+statInner(s)+'</div>';
    }).join('');
    if (!vis.length) itemHtml = '<div class="hx-stat"><span class="k">No stats selected — open ⚙</span></div>';
    // Track duplicated for a seamless loop.
    host.innerHTML =
      '<div class="hx-ticker">'+
        badge+
        '<div class="hx-viewport"><div class="hx-track">'+itemHtml+itemHtml+'</div></div>'+
        '<div class="hx-gear" title="Choose stats">⚙</div>'+
      '</div>'+ menuHtml();
    state.cardId = null; // innerHTML rebuild removed any open insight card
    var menu = host.querySelector('#hxMenu');
    if (keepOpen) menu.classList.add('open');
    if (keepLabel) menu.querySelector('#hxCLabel').value = keepLabel;
    if (keepValue) menu.querySelector('#hxCValue').value = keepValue;
    wire();
  }

  function menuHtml(){
    var g = state.prefs.groups;
    var perStat = state.stats.map(function(s){
      return '<label><input type="checkbox" data-stat="'+esc(s.id)+'" '+(!state.prefs.hidden[s.id]?'checked':'')+'> '+esc(s.label)+
        (s.group==='custom'?'<span class="rm" data-rm="'+esc(s.id)+'">remove</span>':'')+'</label>';
    }).join('');
    return '<div class="hx-menu" id="hxMenu">'+
      '<div class="hint" style="margin:0 0 10px">● <b>LIVE</b> stats are computed from your real workspace, every second. '+
      '✱ Market quotes are illustrative samples until live market data is connected (Settings → gateway).</div>'+
      '<h4>Stat groups</h4>'+
      '<label><input type="checkbox" data-grp="markets" '+(g.markets?'checked':'')+'> Markets <span class="hint" style="margin:0">(sample until connected)</span></label>'+
      '<label><input type="checkbox" data-grp="business" '+(g.business?'checked':'')+'> My business</label>'+
      '<label><input type="checkbox" data-grp="custom" '+(g.custom?'checked':'')+'> Custom</label>'+
      '<div class="sect"><h4>Individual stats</h4>'+perStat+'</div>'+
      '<div class="sect"><h4>Add custom stat</h4>'+
        '<input type="text" id="hxCLabel" placeholder="Label — e.g. Weekly signups">'+
        '<input type="text" id="hxCValue" placeholder="Value — e.g. 42">'+
        '<div class="row2"><button id="hxAdd">+ Add</button><button class="hx-ai" id="hxAI">✨ AI suggest</button></div>'+
        '<div class="hint" id="hxHint">AI suggests WHICH stats matter for your business — values always come from your data, never invented.</div>'+
      '</div></div>';
  }

  function wire(){
    var host = state.host;
    var track = host.querySelector('.hx-track');
    var menu = host.querySelector('#hxMenu');

    // Marquee = pure CSS animation (GPU-composited; :hover pauses it natively —
    // no JS loop to throttle). Duration derived from content width for constant px/s.
    var half = track.scrollWidth / 2;
    track.style.setProperty('--hx-dur', Math.max(12, half / state.speed) + 's');
    // touch devices have no hover: tap toggles pause
    host.querySelector('.hx-viewport').addEventListener('touchstart', function(){ track.classList.toggle('hx-hold'); }, {passive:true});

    // hover (or tap) a stat → insight card with meaning, recommendation, tip
    var vp = host.querySelector('.hx-viewport');
    vp.addEventListener('mouseover', function(e){
      var st = e.target.closest ? e.target.closest('.hx-stat[data-id]') : null;
      if (st) showCard(st);
    });
    vp.addEventListener('mouseleave', function(){ hideCard(); });
    vp.addEventListener('click', function(e){
      var st = e.target.closest ? e.target.closest('.hx-stat[data-id]') : null;
      if (!st) return;
      if (state.cardId === st.getAttribute('data-id')) hideCard(); else showCard(st);
    });

    host.querySelector('.hx-gear').addEventListener('click', function(e){ e.stopPropagation(); menu.classList.toggle('open'); });
    if (!state.docBound) {
      state.docBound = true;
      document.addEventListener('click', function(e){
        var m = state.host && state.host.querySelector('#hxMenu');
        if (!m) return;
        // a click on a menu control can rebuild the menu mid-dispatch; the
        // detached target would read as "outside" and wrongly close it
        if (e.target && !e.target.isConnected) return;
        if (!m.contains(e.target)) m.classList.remove('open');
      });
    }

    menu.querySelectorAll('input[data-grp]').forEach(function(cb){
      cb.addEventListener('change', function(){ state.prefs.groups[cb.dataset.grp] = cb.checked; savePrefs(); rebuild(); });
    });
    menu.querySelectorAll('input[data-stat]').forEach(function(cb){
      cb.addEventListener('change', function(){
        if (cb.checked) delete state.prefs.hidden[cb.dataset.stat]; else state.prefs.hidden[cb.dataset.stat] = true;
        savePrefs(); rebuild();
      });
    });
    menu.querySelectorAll('.rm').forEach(function(el){
      el.addEventListener('click', function(e){ e.preventDefault();
        state.prefs.custom = state.prefs.custom.filter(function(c){ return c.id !== el.dataset.rm; });
        savePrefs(); assemble(); rebuild();
      });
    });
    var add = menu.querySelector('#hxAdd');
    if (add) add.addEventListener('click', function(){
      var l = menu.querySelector('#hxCLabel').value.trim();
      var v = menu.querySelector('#hxCValue').value.trim();
      if (!l || !v) return;
      var num = parseFloat(v);
      state.prefs.custom.push({ id: 'c_' + Date.now(), label: l, value: isFinite(num) && String(num) === v ? num : v });
      menu.querySelector('#hxCLabel').value = '';
      menu.querySelector('#hxCValue').value = '';
      savePrefs(); assemble(); rebuild();
    });
    var ai = menu.querySelector('#hxAI');
    if (ai) ai.addEventListener('click', function(){
      var hint = menu.querySelector('#hxHint');
      if (typeof state.opts.aiSuggest === 'function') {
        hint.textContent = 'Asking your AI team…';
        Promise.resolve(state.opts.aiSuggest()).then(function(suggestions){
          var list = (suggestions || []).slice(0,5).filter(function(s){ return s && s.label; });
          list.forEach(function(s){
            state.prefs.custom.push({ id: 'c_' + Math.random().toString(36).slice(2), label: s.label, value: (s.value != null ? s.value : '—') });
          });
          savePrefs(); assemble(); rebuild();
          var h = state.host.querySelector('#hxHint');
          if (h) h.textContent = list.length
            ? 'Added ' + list.length + ' suggested stat' + (list.length > 1 ? 's' : '') + ' — set their values from your data.'
            : 'No suggestions yet — connect the gateway in Settings to enable AI suggestions.';
        }).catch(function(){
          var h = state.host.querySelector('#hxHint');
          if (h) h.textContent = 'AI suggest unavailable right now.';
        });
      } else {
        hint.textContent = 'Connect the gateway (Settings) to enable AI suggestions.';
      }
    });

  }

  // Assemble the stat list from sources.
  function assemble(){
    var stats = [];
    var MKT_DESC = { SPY: 'S&P 500 ETF — broad US market.', QQQ: 'Nasdaq-100 ETF — big tech.', DIA: 'Dow Jones ETF — US blue chips.', BTC: 'Bitcoin, in US dollars.' };
    (state.marketQuotes || []).forEach(function(q){
      stats.push({ id: 'm_' + q.symbol, group: 'markets', label: q.symbol, value: q.last, change: q.change, changePct: q.changePct, live: true,
        desc: (MKT_DESC[q.symbol] || q.symbol) + ' Live quote via your connected gateway.',
        tip: 'Live market context for planning — HELIX never trades or advises on securities.' });
    });
    if (!stats.length) {
      // Clearly-labeled sample market data (badge shows SAMPLE).
      [['SPY', 748.28, 6.2, 0.83], ['QQQ', 622.4, -1.9, -0.3], ['DIA', 512.1, 2.4, 0.47], ['BTC', 118342, 1120, 0.96]]
        .forEach(function(r){ stats.push({ id: 'm_' + r[0], group: 'markets', label: r[0], value: r[1], change: r[2], changePct: r[3], live: false,
          desc: (MKT_DESC[r[0]] || r[0]) + ' This is an illustrative SAMPLE quote — not live data.',
          tip: 'Connect live market data in Settings → gateway and this row flips to LIVE automatically.' }); });
    }
    (state.opts.businessStats || []).forEach(function(b, i){
      stats.push({ id: 'b_' + (b.id || i), group: 'business', label: b.label, value: b.value, change: b.change != null ? b.change : null, changePct: b.changePct != null ? b.changePct : null,
        desc: b.desc || 'Computed live from your workspace.', tip: b.tip || '', href: b.href || '' });
    });
    (state.prefs.custom || []).forEach(function(c){
      stats.push({ id: c.id, group: 'custom', label: c.label, value: c.value,
        desc: 'Your custom stat — the value is whatever you set it to.',
        tip: 'Edit or remove it any time from the ⚙ menu.' });
    });
    state.stats = stats;
  }
  function rebuild(){ render(); }

  // ----- hover insight card: pause is native (:hover), the card adds meaning -----
  function findStat(id){ for (var i = 0; i < state.stats.length; i++) if (state.stats[i].id === id) return state.stats[i]; return null; }
  function cardHtml(s){
    var sample = s.group === 'markets' && !s.live;
    return '<div class="row1"><b>'+esc(s.label)+'</b>'+
      '<span class="badge '+(sample?'demo':'live')+'">'+(sample?'SAMPLE':'LIVE')+'</span></div>'+
      '<div class="val">'+esc(fmtVal(s.value))+' '+deltaHtml(s.change, s.changePct)+'</div>'+
      (s.desc ? '<p class="desc">'+esc(s.desc)+'</p>' : '')+
      (s.tip ? '<p class="tip">💡 '+esc(s.tip)+'</p>' : '')+
      (s.href ? '<a class="go" href="'+esc(s.href)+'">Open →</a>' : '');
  }
  function showCard(statEl){
    var id = statEl.getAttribute('data-id');
    var s = id && findStat(id);
    if (!s) return;
    state.cardId = id;
    var host = state.host;
    if (state.hideT) { clearTimeout(state.hideT); state.hideT = null; }
    var card = host.querySelector('.hx-card');
    if (!card) {
      card = document.createElement('div'); card.className = 'hx-card'; host.appendChild(card);
      card.addEventListener('mouseenter', function(){ if (state.hideT) { clearTimeout(state.hideT); state.hideT = null; } });
      card.addEventListener('mouseleave', function(){ hideCard(); });
    }
    card.innerHTML = cardHtml(s);
    var hostR = host.getBoundingClientRect();
    var r = statEl.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.left - hostR.left, hostR.width - 296));
    card.style.left = left + 'px';
    card.classList.add('open');
  }
  function hideCard(){
    // grace period so the pointer can travel from the stat into the card
    if (state.hideT) clearTimeout(state.hideT);
    state.hideT = setTimeout(function(){
      state.hideT = null;
      state.cardId = null;
      var card = state.host.querySelector('.hx-card');
      if (card) card.classList.remove('open');
    }, 250);
  }

  // Fast path for frequent refreshes: patch values into the existing DOM.
  // A full render() would restart the marquee animation and rebuild the menu,
  // so it is reserved for when the stat LIST itself changes.
  function statSig(){ return state.stats.map(function(s){ return s.id + '|' + s.label; }).join(','); }
  function patchValues(){
    var byId = {};
    state.stats.forEach(function(s){ byId[s.id] = s; });
    state.host.querySelectorAll('.hx-stat[data-id]').forEach(function(n){
      var s = byId[n.getAttribute('data-id')];
      if (!s) return;
      n.innerHTML = statInner(s);
    });
    // keep an open insight card current
    if (state.cardId) {
      var open = findStat(state.cardId);
      var card = state.host.querySelector('.hx-card.open');
      if (open && card) card.innerHTML = cardHtml(open);
    }
  }

  function mount(sel, opts){
    state.host = typeof sel === 'string' ? document.querySelector(sel) : sel;
    state.opts = opts || {};
    state.prefs = loadPrefs();
    state.marketQuotes = null;
    assemble(); render();
    // fetch live markets
    if (state.opts.marketsUrl) {
      fetch(state.opts.marketsUrl, { headers: state.opts.gatewayKey ? { 'Authorization': 'Bearer ' + state.opts.gatewayKey } : {} })
        .then(function(r){ return r.json(); })
        .then(function(d){ if (d && d.ok && d.quotes && d.quotes.length) { state.marketQuotes = d.quotes; assemble(); render(); } })
        .catch(function(){ /* stay on labeled sample */ });
      if (state.opts.refreshMs) setInterval(function(){
        fetch(state.opts.marketsUrl, { headers: state.opts.gatewayKey ? { 'Authorization': 'Bearer ' + state.opts.gatewayKey } : {} })
          .then(function(r){ return r.json(); })
          .then(function(d){ if (d && d.ok && d.quotes && d.quotes.length) { state.marketQuotes = d.quotes; assemble(); render(); } })
          .catch(function(){});
      }, Math.max(60000, state.opts.refreshMs));
    }
    return { refresh: function(){
      var before = statSig();
      assemble();
      if (statSig() === before) { patchValues(); return; }
      // list changed — full rebuild, unless the prefs menu is open (it would
      // be wiped mid-interaction; the next refresh after closing catches up)
      var menu = state.host.querySelector('#hxMenu');
      if (!(menu && menu.classList.contains('open'))) render();
    } };
  }
  return { mount: mount };
})();
/* ============ /HELIX TICKER COMPONENT JS ============ */
