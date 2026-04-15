// ===== Kairo's Help - Premium Device Dashboard =====

let currentProfileId = null;
let currentDeviceId = null;
let deviceMap = null;
let deviceMarker = null;
let radarElement = null;
let activeAlertObj = null;
let isEmergencyMode = false;

// ===== Initialize =====
(async function() {
  const params = new URLSearchParams(window.location.search);
  currentProfileId = params.get('id');

  if (!currentProfileId) { showError(); return; }

  // Start with localStorage fallback (instant — don't wait for Supabase)
  let profileData = null;
  try {
    const local = localStorage.getItem(`profile_${currentProfileId}`);
    if (local) profileData = JSON.parse(local);
  } catch (e) {}

  // Try Supabase but don't block on it — use 8s timeout
  const supaPromise = Promise.race([
    supabase.from('emergency_profiles').select('*').eq('id', currentProfileId).single()
      .then(res => res.data || null).catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), 8000))
  ]);

  const row = await supaPromise;

  if (!row && !profileData) { showError(); return; }

  const name = (row && row.name) || (profileData && profileData.name) || 'Unknown';
  const deviceId = (row && row.device_id) || (profileData && profileData.deviceId) || null;
  const linked = (row && row.device_linked) || !!(profileData && profileData.deviceId);

  // Dismiss loader asap
  setTimeout(() => {
    document.getElementById('loaderScreen').classList.add('fade-out');
  }, 1000);

  setTimeout(() => {
    if (!linked || !deviceId) {
      document.getElementById('linkDeviceSection').classList.remove('hidden');
      return;
    }

    currentDeviceId = deviceId;
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('profileNameDisplay').textContent = name;
    document.getElementById('deviceIdDisplay').textContent = deviceId;
    document.getElementById('viewProfileLink').href = `view.html?id=${currentProfileId}`;

    // Wrap each init so partial failures don't cascade
    safeCall(initMap, 'initMap');
    safeCall(loadDeviceStatus, 'loadDeviceStatus');
    safeCall(loadAlerts, 'loadAlerts');
    safeCall(subscribeToAlerts, 'subscribeToAlerts');
  }, 1400);
})();

function safeCall(fn, name) {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') {
      result.catch(err => console.warn('[' + name + ']', err));
    }
  } catch (err) {
    console.warn('[' + name + ']', err);
  }
}

// ===== Map =====
function initMap() {
  deviceMap = L.map('deviceMap', {
    center: [20.5937, 78.9629],
    zoom: 4,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(deviceMap);

  // Add zoom control to bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(deviceMap);
}

function updateMapLocation(lat, lng) {
  if (!deviceMap || !lat || !lng) return;
  const pos = [lat, lng];

  if (deviceMarker) {
    deviceMarker.setLatLng(pos);
  } else {
    // Custom neon marker
    const markerIcon = L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="position:relative;width:20px;height:20px">
          <div style="width:20px;height:20px;border-radius:50%;background:#ffffff;box-shadow:0 0 12px #ffffff,0 0 30px rgba(255,255,255,0.4);position:absolute;inset:0"></div>
          <div class="radar-ping"></div>
          <div class="radar-ping" style="animation-delay:1s"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    deviceMarker = L.marker(pos, { icon: markerIcon }).addTo(deviceMap);
  }

  deviceMap.flyTo(pos, 15, { duration: 1.5 });
  document.getElementById('coordsText').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// ===== Device Status =====
async function loadDeviceStatus() {
  try {
    const { data } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .eq('alert_type', 'heartbeat')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const last = data[0];
      const diff = Date.now() - new Date(last.timestamp).getTime();
      const online = diff < 5 * 60 * 1000;

      setStatus(online ? 'online' : 'offline');
      setBattery(last.battery_level);
      setSignal(online ? 4 : 0);

      if (last.latitude && last.longitude) {
        updateMapLocation(last.latitude, last.longitude);
        setGPS(true);
      }
    } else {
      setStatus('offline');
      setSignal(0);
      setGPS(false);
    }

    // Check active alerts
    const { data: active } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .eq('resolved', false)
      .neq('alert_type', 'heartbeat')
      .order('timestamp', { ascending: false });

    if (active && active.length > 0) {
      enterEmergencyMode(active[0]);
    }
  } catch (e) {
    console.error('Status error:', e);
  }
}

function setStatus(s) {
  const ring = document.getElementById('statusRing');
  const label = document.getElementById('statusLabel');
  ring.className = 'status-ring ' + s;
  label.className = 'status-label ' + s;
  label.textContent = s === 'online' ? 'ONLINE' : s === 'alert' ? 'ALERT' : 'OFFLINE';
}

function setBattery(level) {
  if (level === null || level === undefined) return;
  const ring = document.getElementById('batteryRing');
  const text = document.getElementById('batteryText');
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (level / 100) * circumference;

  ring.style.strokeDashoffset = offset;
  ring.className = 'battery-ring-fill' + (level > 50 ? '' : level > 20 ? ' medium' : ' low');
  text.textContent = level + '%';
}

function setSignal(bars) {
  document.querySelectorAll('.signal-bar').forEach((bar, i) => {
    bar.classList.toggle('active', i < bars);
  });
  document.getElementById('signalText').textContent = bars > 0 ? 'Connected' : 'No Signal';
}

function setGPS(hasFix) {
  const icon = document.getElementById('gpsIcon');
  const text = document.getElementById('gpsText');
  icon.className = 'gps-icon' + (hasFix ? ' active' : '');
  text.textContent = hasFix ? 'Fix Acquired' : 'No Fix';
}

// ===== Emergency Mode =====
function enterEmergencyMode(alert) {
  isEmergencyMode = true;
  activeAlertObj = alert;
  setStatus('alert');

  // Show alert command center
  const cmd = document.getElementById('alertCommand');
  cmd.classList.remove('hidden');
  document.getElementById('allClearState').classList.add('hidden');

  const meta = document.getElementById('alertCommandMeta');
  const time = new Date(alert.timestamp).toLocaleString();
  meta.textContent = `${alert.alert_type.toUpperCase()} at ${time}`;

  // Red overlay
  document.getElementById('emergencyOverlay').classList.add('active');

  // Heartbeat turns red
  const hbLine = document.getElementById('hbLine');
  hbLine.classList.add('alert-mode');

  // Live badge turns red
  document.getElementById('liveBadge').classList.add('alert-mode');
  document.getElementById('liveBadge').querySelector('.live-dot').style.color = '#ff6b6b';
  document.getElementById('liveBadge').childNodes[2].textContent = ' SOS';

  // Update map to alert location
  if (alert.latitude && alert.longitude) {
    updateMapLocation(alert.latitude, alert.longitude);
  }
}

function exitEmergencyMode() {
  isEmergencyMode = false;
  activeAlertObj = null;

  document.getElementById('alertCommand').classList.add('hidden');
  document.getElementById('allClearState').classList.remove('hidden');
  document.getElementById('emergencyOverlay').classList.remove('active');
  document.getElementById('hbLine').classList.remove('alert-mode');

  const badge = document.getElementById('liveBadge');
  badge.classList.remove('alert-mode');
  badge.innerHTML = '<span class="live-dot"></span> LIVE';

  setStatus('online');
}

async function resolveActiveAlert() {
  if (!activeAlertObj) return;
  const btn = document.getElementById('alertResolveBtn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    await supabase.from('device_alerts').update({ resolved: true }).eq('id', activeAlertObj.id);
    exitEmergencyMode();
    loadAlerts();
  } catch (e) {
    btn.textContent = 'RESOLVE';
    btn.disabled = false;
  }
}

// ===== Load Alerts =====
async function loadAlerts() {
  try {
    const { data } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return;

    const timeline = document.getElementById('alertTimeline');
    timeline.innerHTML = '';
    let totalCount = 0;
    let lastAlertTime = null;

    data.forEach((alert, i) => {
      totalCount++;
      if (!lastAlertTime && alert.alert_type !== 'heartbeat') lastAlertTime = alert.timestamp;

      const item = document.createElement('div');
      item.className = `tl-item ${alert.alert_type}`;
      item.style.animationDelay = `${i * 0.05}s`;

      const resolved = alert.resolved || alert.alert_type === 'heartbeat';
      const coords = alert.latitude ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}` : 'No GPS';
      const battery = alert.battery_level !== null ? ` | ${alert.battery_level}%` : '';

      item.innerHTML = `
        <div class="tl-top">
          <span class="tl-badge ${alert.alert_type}">${alert.alert_type.toUpperCase()}</span>
          <span class="tl-time">${timeAgo(alert.timestamp)}</span>
        </div>
        <div class="tl-details">${coords}${battery}</div>
        ${!resolved ? `<button class="tl-resolve" onclick="resolveFromTimeline('${alert.id}', this)">Resolve</button>` : ''}
      `;
      timeline.appendChild(item);
    });

    // Animate total count
    animateNumber('totalAlertCount', totalCount);
    document.getElementById('lastAlertTime').textContent = lastAlertTime ? timeAgo(lastAlertTime) : 'None';

  } catch (e) {
    console.error('Alerts error:', e);
  }
}

async function resolveFromTimeline(id, btn) {
  btn.textContent = '...';
  try {
    await supabase.from('device_alerts').update({ resolved: true }).eq('id', id);
    if (activeAlertObj && activeAlertObj.id === id) exitEmergencyMode();
    loadAlerts();
  } catch (e) {
    btn.textContent = 'Retry';
  }
}

// ===== Realtime =====
function subscribeToAlerts() {
  supabase
    .channel('dash-' + currentProfileId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'device_alerts',
      filter: `profile_id=eq.${currentProfileId}`
    }, (payload) => {
      const alert = payload.new;

      if (alert.alert_type === 'heartbeat') {
        setStatus('online');
        setBattery(alert.battery_level);
        setSignal(4);
        if (alert.latitude && alert.longitude) {
          updateMapLocation(alert.latitude, alert.longitude);
          setGPS(true);
        }
        // Add to timeline
        prependTimeline(alert);
        return;
      }

      // SOS / Fall / Geofence
      enterEmergencyMode(alert);
      prependTimeline(alert);
      animateNumber('totalAlertCount', parseInt(document.getElementById('totalAlertCount').textContent || '0') + 1);
    })
    .subscribe();
}

function prependTimeline(alert) {
  const timeline = document.getElementById('alertTimeline');
  const empty = timeline.querySelector('.timeline-empty');
  if (empty) empty.remove();

  const resolved = alert.resolved || alert.alert_type === 'heartbeat';
  const coords = alert.latitude ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}` : 'No GPS';
  const battery = alert.battery_level !== null ? ` | ${alert.battery_level}%` : '';

  const item = document.createElement('div');
  item.className = `tl-item ${alert.alert_type}`;
  item.innerHTML = `
    <div class="tl-top">
      <span class="tl-badge ${alert.alert_type}">${alert.alert_type.toUpperCase()}</span>
      <span class="tl-time">just now</span>
    </div>
    <div class="tl-details">${coords}${battery}</div>
    ${!resolved ? `<button class="tl-resolve" onclick="resolveFromTimeline('${alert.id}', this)">Resolve</button>` : ''}
  `;
  timeline.prepend(item);
}

// ===== Link Device =====
async function linkDevice() {
  const id = document.getElementById('linkDeviceIdInput').value.trim();
  if (!id) return;

  try {
    await supabase.from('emergency_profiles')
      .update({ device_id: id, device_linked: true })
      .eq('id', currentProfileId);

    const local = localStorage.getItem(`profile_${currentProfileId}`);
    if (local) {
      const d = JSON.parse(local);
      d.deviceId = id;
      localStorage.setItem(`profile_${currentProfileId}`, JSON.stringify(d));
    }
    window.location.reload();
  } catch (e) {
    console.error(e);
  }
}

// ===== Share Location =====
function shareLocation() {
  const url = `${window.location.origin}/device.html?id=${currentProfileId}`;
  if (navigator.share) {
    navigator.share({ title: 'Kairo Device Tracker', url });
  } else {
    navigator.clipboard.writeText(url);
    const btn = document.querySelector('.action-share');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
    setTimeout(() => {
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share Location';
    }, 2000);
  }
}

// ===== Utilities =====
function showError() {
  document.getElementById('loaderScreen').classList.add('fade-out');
  setTimeout(() => {
    document.getElementById('pageError').classList.remove('hidden');
  }, 600);
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function animateNumber(elId, target) {
  const el = document.getElementById(elId);
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  const duration = 600;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + diff * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ===== SIMULATOR PANEL =====
function toggleSimPanel() {
  const panel = document.getElementById('simPanel');
  const toggle = document.getElementById('simToggle');
  panel.classList.toggle('open');
  toggle.classList.toggle('active');
}

function setSimLocation(lat, lng) {
  document.getElementById('simLat').value = lat;
  document.getElementById('simLng').value = lng;
}

// Battery range slider live update
document.addEventListener('DOMContentLoaded', () => {
  const range = document.getElementById('simBattery');
  const val = document.getElementById('simBatteryVal');
  if (range && val) {
    range.addEventListener('input', () => {
      val.textContent = range.value + '%';
    });
  }
});

async function sendTestAlert(alertType) {
  const status = document.getElementById('simStatus');
  status.className = 'sim-status sending';
  status.textContent = 'Sending ' + alertType + '...';

  const lat = parseFloat(document.getElementById('simLat').value) || null;
  const lng = parseFloat(document.getElementById('simLng').value) || null;
  const battery = parseInt(document.getElementById('simBattery').value) || 50;

  const deviceId = currentDeviceId || 'SIM-TEST';
  const profileId = currentProfileId;

  if (!profileId) {
    status.className = 'sim-status error';
    status.textContent = 'No profile ID. Open with ?id=yourprofileid';
    return;
  }

  try {
    const { error } = await supabase.from('device_alerts').insert({
      profile_id: profileId,
      device_id: deviceId,
      alert_type: alertType,
      latitude: lat,
      longitude: lng,
      battery_level: battery,
      resolved: false
    });

    if (error) throw error;

    status.className = 'sim-status success';
    status.textContent = alertType.toUpperCase() + ' sent successfully';
    setTimeout(() => { status.textContent = ''; status.className = 'sim-status'; }, 3000);

    // Slightly move location for next heartbeat (simulate movement)
    if (lat) {
      document.getElementById('simLat').value = (lat + (Math.random() - 0.5) * 0.002).toFixed(6);
      document.getElementById('simLng').value = (lng + (Math.random() - 0.5) * 0.002).toFixed(6);
    }

  } catch (e) {
    console.error('Sim error:', e);
    status.className = 'sim-status error';
    status.textContent = 'Failed: ' + (e.message || 'Unknown error');
  }
}

// ===== MESSAGES / CHECK-IN =====
let _msgInited = false;

async function initMessages() {
  if (_msgInited || !currentProfileId) return;
  _msgInited = true;

  await loadMessages();

  // Real-time subscription for incoming answers
  supabase
    .channel('msg-' + currentProfileId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `profile_id=eq.${currentProfileId}`
    }, () => loadMessages())
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `profile_id=eq.${currentProfileId}`
    }, () => loadMessages())
    .subscribe();
}

async function loadMessages() {
  try {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('profile_id', currentProfileId)
      .order('sent_at', { ascending: true })
      .limit(30);

    const convo = document.getElementById('msgConvo');
    if (!convo) return;

    if (!data || data.length === 0) {
      convo.innerHTML = '<div class="msg-empty">No messages yet. Send a check-in above.</div>';
      return;
    }

    convo.innerHTML = '';
    data.forEach(m => {
      // Parent's question bubble
      const qBubble = document.createElement('div');
      qBubble.className = 'msg-bubble parent';
      qBubble.innerHTML = escapeHtml(m.question) + `<div class="msg-time">${fmtTime(m.sent_at)}</div>`;
      convo.appendChild(qBubble);

      // Child's answer bubble (or pending)
      if (m.answer) {
        const aBubble = document.createElement('div');
        aBubble.className = 'msg-bubble child-' + m.answer;
        aBubble.innerHTML = m.answer.toUpperCase() +
          `<div class="msg-time">${fmtTime(m.answered_at)}</div>`;
        convo.appendChild(aBubble);
      } else {
        const p = document.createElement('div');
        p.className = 'msg-bubble pending';
        p.textContent = 'Waiting for answer...';
        convo.appendChild(p);
      }
    });

    convo.scrollTop = convo.scrollHeight;
  } catch (e) {
    console.warn('Load messages:', e);
  }
}

async function sendMsg() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || !currentProfileId) return;
  await doSendMsg(text);
  input.value = '';
}

async function sendQuickMsg(text) {
  if (!currentProfileId) return;
  await doSendMsg(text);
}

async function doSendMsg(text) {
  try {
    await supabase.from('messages').insert({
      profile_id: currentProfileId,
      device_id: currentDeviceId,
      question: text
    });
    await loadMessages();
  } catch (e) {
    console.error('Send msg:', e);
  }
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Hook Enter key on input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('msgInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMsg();
    });
  }
});

// Init messages once device dashboard shows up — safeCall it
const _origSafeCall = safeCall;
safeCall = function(fn, name) {
  _origSafeCall(fn, name);
  if (name === 'loadAlerts') _origSafeCall(initMessages, 'initMessages');
};
