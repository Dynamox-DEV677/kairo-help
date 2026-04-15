// ===== Kairo Virtual Device (Phone PWA) =====

const STORAGE_KEY = 'kairo_device_setup';
const HEARTBEAT_INTERVAL = 30000; // 30s

let profileId = null;
let deviceId = null;
let currentLat = null;
let currentLng = null;
let battery = 100;
let heartbeatTimer = null;
let countdownTimer = null;
let nextHeartbeatMs = HEARTBEAT_INTERVAL;
let watchId = null;

// ===== Init =====
function initApp() {
  const setup = document.getElementById('setupScreen');
  const device = document.getElementById('deviceScreen');
  if (!setup || !device) {
    // DOM not ready yet — retry after DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.profileId && parsed.deviceId) {
        profileId = parsed.profileId;
        deviceId = parsed.deviceId;
        setup.classList.add('hidden');
        device.classList.remove('hidden');
        startDeviceMode();
        return;
      }
    } catch (e) {}
  }

  // No saved data → show setup
  setup.classList.remove('hidden');
  device.classList.add('hidden');
}

initApp();

// ===== Setup Flow =====
function startDevice() {
  const pid = document.getElementById('setupProfileId').value.trim();
  const did = document.getElementById('setupDeviceId').value.trim() || 'KAIRO-001';

  if (!pid) {
    document.getElementById('setupProfileId').style.borderColor = '#ef4444';
    return;
  }

  profileId = pid;
  deviceId = did;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profileId, deviceId }));
  startDeviceMode();
}

function startDeviceMode() {
  // Ensure correct screens are shown
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('deviceScreen').classList.remove('hidden');

  // Scroll to top (sometimes refresh leaves mid-page scroll)
  window.scrollTo(0, 0);

  document.getElementById('devDeviceId').textContent = deviceId;
  document.getElementById('dashLink').href = `device.html?id=${profileId}`;

  initBattery();
  startGPS();
  startHeartbeats();
  setStatus('online');
  log('Device activated', 'heartbeat');
  subscribeToMessages();
  checkPendingMessage();
}

// ===== MESSAGE HANDLING =====
let _currentMsgId = null;

function subscribeToMessages() {
  supabase
    .channel('dev-msg-' + profileId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `profile_id=eq.${profileId}`
    }, (payload) => {
      const m = payload.new;
      if (!m.answer) showIncomingMessage(m);
    })
    .subscribe();
}

async function checkPendingMessage() {
  try {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('profile_id', profileId)
      .is('answer', null)
      .order('sent_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      showIncomingMessage(data[0]);
    }
  } catch (e) {
    console.warn('Pending msg check:', e);
  }
}

function showIncomingMessage(msg) {
  _currentMsgId = msg.id;
  document.getElementById('msgInQuestion').textContent = msg.question;
  document.getElementById('msgIncoming').classList.add('show');

  // Vibrate phone
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  log('Message: ' + msg.question, 'heartbeat');
}

async function answerMsg(answer) {
  if (!_currentMsgId) return;

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(50);

  try {
    await supabase
      .from('messages')
      .update({ answer, answered_at: new Date().toISOString() })
      .eq('id', _currentMsgId);

    log('Replied: ' + answer.toUpperCase(), answer === 'yes' ? 'heartbeat' : 'fall');
  } catch (e) {
    log('Reply failed: ' + e.message, 'error');
  }

  document.getElementById('msgIncoming').classList.remove('show');
  _currentMsgId = null;
}

async function resetDevice() {
  const ok = await showConfirm({
    title: 'Reset Device?',
    message: 'This will clear your profile ID and device ID.',
    confirmText: 'Reset'
  });
  if (!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  location.reload();
}

// ===== Themed Confirm Modal =====
let _confirmResolver = null;

function showConfirm({ title, message, confirmText = 'OK' }) {
  return new Promise((resolve) => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = message;
    document.querySelector('.confirm-ok').textContent = confirmText;
    document.getElementById('confirmBg').classList.add('show');
    _confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  document.getElementById('confirmBg').classList.remove('show');
  if (_confirmResolver) {
    _confirmResolver(result);
    _confirmResolver = null;
  }
}

// Close on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('confirmBg');
  if (bg) {
    bg.addEventListener('click', (e) => {
      if (e.target === bg) closeConfirm(false);
    });
  }
});

// ===== GPS =====
function startGPS() {
  if (!navigator.geolocation) {
    document.getElementById('devCoords').textContent = 'GPS not supported';
    document.getElementById('devGpsIcon').classList.add('error');
    return;
  }

  document.getElementById('devCoords').textContent = 'Acquiring GPS...';

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      document.getElementById('devCoords').textContent =
        `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
      document.getElementById('devGpsIcon').classList.add('active');
      document.getElementById('devGpsIcon').classList.remove('error');
    },
    (err) => {
      document.getElementById('devCoords').textContent = 'GPS denied — enable in settings';
      document.getElementById('devGpsIcon').classList.add('error');
      log('GPS permission denied', 'error');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000
    }
  );
}

// ===== Battery =====
function initBattery() {
  if ('getBattery' in navigator) {
    navigator.getBattery().then(b => {
      const updateBattery = () => {
        battery = Math.round(b.level * 100);
        renderBattery();
      };
      updateBattery();
      b.addEventListener('levelchange', updateBattery);
    });
  } else {
    // Fallback: simulate slow drain
    setInterval(() => {
      battery = Math.max(0, battery - 1);
      renderBattery();
    }, 60000);
    renderBattery();
  }
}

function renderBattery() {
  const pill = document.getElementById('devBatteryPill');
  const txt = document.getElementById('devBattery');
  txt.textContent = battery + '%';
  pill.classList.remove('low', 'medium');
  if (battery < 20) pill.classList.add('low');
  else if (battery < 50) pill.classList.add('medium');
}

// ===== Status =====
function setStatus(s) {
  const dot = document.getElementById('devStatusDot');
  const status = document.getElementById('pulseStatus');
  const ring = document.getElementById('pulseRing');

  dot.className = 'status-dot ' + s;
  status.className = 'pulse-status ' + s;
  ring.className = 'pulse-ring' + (s === 'alert' ? ' alert' : '');

  if (s === 'online') status.textContent = 'CONNECTED';
  else if (s === 'alert') status.textContent = 'EMERGENCY';
  else status.textContent = 'OFFLINE';
}

// ===== Heartbeats =====
function startHeartbeats() {
  // First heartbeat after 5s
  setTimeout(() => {
    sendAlert('heartbeat');
    nextHeartbeatMs = HEARTBEAT_INTERVAL;
  }, 5000);

  // Recurring
  heartbeatTimer = setInterval(() => {
    sendAlert('heartbeat');
    nextHeartbeatMs = HEARTBEAT_INTERVAL;
  }, HEARTBEAT_INTERVAL);

  // Countdown display
  countdownTimer = setInterval(() => {
    nextHeartbeatMs = Math.max(0, nextHeartbeatMs - 1000);
    const sec = Math.ceil(nextHeartbeatMs / 1000);
    document.getElementById('pulseDetail').textContent = `Next heartbeat in ${sec}s`;
  }, 1000);
}

function sendManualHeartbeat() {
  sendAlert('heartbeat');
  log('Manual heartbeat sent', 'heartbeat');
}

// ===== Alert Triggers =====
async function triggerSOS() {
  const btn = document.getElementById('sosBtn');
  btn.classList.add('firing');
  setTimeout(() => btn.classList.remove('firing'), 400);

  // Vibrate phone if supported
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

  setStatus('alert');
  showSOSOverlay();
  await sendAlert('sos');
  log('SOS EMERGENCY SENT', 'sos');

  // Revert to online after 5s
  setTimeout(() => setStatus('online'), 5000);
}

async function triggerFall() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  await sendAlert('fall');
  log('Fall detected — alert sent', 'fall');
}

function showSOSOverlay() {
  const overlay = document.getElementById('sosOverlay');
  document.getElementById('sosOverlaySub').textContent =
    currentLat ? `Location: ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}` : 'Alert sent to parents';
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 2500);
}

// ===== Send to Supabase =====
async function sendAlert(alertType) {
  try {
    const payload = {
      profile_id: profileId,
      device_id: deviceId,
      alert_type: alertType,
      latitude: currentLat,
      longitude: currentLng,
      battery_level: battery
    };

    const { error } = await supabase
      .from('device_alerts')
      .insert(payload);

    if (error) {
      log('Send failed: ' + error.message, 'error');
      return false;
    }
    return true;
  } catch (err) {
    log('Network error', 'error');
    return false;
  }
}

// ===== Log =====
function log(text, type = 'heartbeat') {
  const list = document.getElementById('logList');
  const empty = list.querySelector('.log-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'log-item ' + type;

  const icon = type === 'sos'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'
    : type === 'fall'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    : type === 'error'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  item.innerHTML = `${icon}<span>${escapeHtml(text)}</span><span class="log-time">${time}</span>`;
  list.prepend(item);

  // Keep only last 20
  while (list.children.length > 20) {
    list.removeChild(list.lastChild);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Visibility — pause when page hidden =====
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    log('App backgrounded', 'heartbeat');
  } else {
    log('App resumed', 'heartbeat');
  }
});
