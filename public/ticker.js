// HELIX Ticker — scrolling stats marquee (self-contained, zero dependencies).
// Lifted from the VitaForge component per HELIXTICKERINTEGRATION.md.
/* ============ HELIX TICKER COMPONENT JS (self-contained) ============ */
var HelixTicker = (function(){
  var PREFS_KEY = 'helix_ticker_prefs_v1';
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

  function render(){
    var host = state.host;
    // innerHTML rebuild would otherwise close the menu and wipe typed input
    var prevMenu = host.querySelector('#hxMenu');
    var keepOpen = !!(prevMenu && prevMenu.classList.contains('open'));
    var keepLabel = prevMenu && prevMenu.querySelector('#hxCLabel') ? prevMenu.querySelector('#hxCLabel').value : '';
    var keepValue = prevMenu && prevMenu.querySelector('#hxCValue') ? prevMenu.querySelector('#hxCValue').value : '';
    var vis = visibleStats();
    var live = state.stats.some(function(s){ return s.group==='markets' && s.live; });
    var itemHtml = vis.map(function(s){
      return '<div class="hx-stat" data-id="'+esc(s.id)+'"><span class="k">'+esc(s.label)+'</span>'+
        '<span class="v">'+esc(fmtVal(s.value))+'</span>'+deltaHtml(s.change, s.changePct)+'</div>';
    }).join('');
    if (!vis.length) itemHtml = '<div class="hx-stat"><span class="k">No stats selected — open ⚙</span></div>';
    // Track duplicated for a seamless loop.
    host.innerHTML =
      '<div class="hx-ticker">'+
        '<div class="hx-live'+(live?'':' demo')+'"><span class="dot"></span>'+(live?'LIVE':'SAMPLE')+'</div>'+
        '<div class="hx-viewport"><div class="hx-track">'+itemHtml+itemHtml+'</div></div>'+
        '<div class="hx-gear" title="Choose stats">⚙</div>'+
      '</div>'+ menuHtml();
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
      '<h4>Stat groups</h4>'+
      '<label><input type="checkbox" data-grp="markets" '+(g.markets?'checked':'')+'> Markets (default)</label>'+
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
    (state.marketQuotes || []).forEach(function(q){
      stats.push({ id: 'm_' + q.symbol, group: 'markets', label: q.symbol, value: q.last, change: q.change, changePct: q.changePct, live: true });
    });
    if (!stats.length) {
      // Clearly-labeled sample market data (badge shows SAMPLE).
      [['SPY', 748.28, 6.2, 0.83], ['QQQ', 622.4, -1.9, -0.3], ['DIA', 512.1, 2.4, 0.47], ['BTC', 118342, 1120, 0.96]]
        .forEach(function(r){ stats.push({ id: 'm_' + r[0], group: 'markets', label: r[0] + ' (sample)', value: r[1], change: r[2], changePct: r[3], live: false }); });
    }
    (state.opts.businessStats || []).forEach(function(b, i){
      stats.push({ id: 'b_' + (b.id || i), group: 'business', label: b.label, value: b.value, change: b.change != null ? b.change : null, changePct: b.changePct != null ? b.changePct : null });
    });
    (state.prefs.custom || []).forEach(function(c){
      stats.push({ id: c.id, group: 'custom', label: c.label, value: c.value });
    });
    state.stats = stats;
  }
  function rebuild(){ render(); }

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
    return { refresh: function(){ assemble(); render(); } };
  }
  return { mount: mount };
})();
/* ============ /HELIX TICKER COMPONENT JS ============ */
