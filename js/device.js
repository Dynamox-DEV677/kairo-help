// ===== Kairo's Help - Device Dashboard =====

let currentProfileId = null;
let currentDeviceId = null;
let deviceMap = null;
let deviceMarker = null;
let realtimeChannel = null;

// ===== Init =====
(async function() {
  const params = new URLSearchParams(window.location.search);
  currentProfileId = params.get('id');

  if (!currentProfileId) {
    showError();
    return;
  }

  try {
    // Check profile exists and has device
    let profileData = null;

    // Try localStorage first
    const local = localStorage.getItem(`profile_${currentProfileId}`);
    if (local) profileData = JSON.parse(local);

    // Try Supabase
    const { data: row, error } = await supabase
      .from('emergency_profiles')
      .select('*')
      .eq('id', currentProfileId)
      .single();

    if (!row && !profileData) {
      showError();
      return;
    }

    const name = (row && row.name) || (profileData && profileData.name) || 'Unknown';
    const deviceId = (row && row.device_id) || (profileData && profileData.deviceId) || null;
    const deviceLinked = (row && row.device_linked) || (profileData && !!profileData.deviceId) || false;

    document.getElementById('pageLoading').classList.add('hidden');

    if (!deviceLinked || !deviceId) {
      // Show link device flow
      document.getElementById('linkDeviceSection').classList.remove('hidden');
      return;
    }

    // Show dashboard
    currentDeviceId = deviceId;
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('profileNameDisplay').textContent = name;
    document.getElementById('deviceIdDisplay').textContent = deviceId;
    document.getElementById('viewProfileLink').href = `view.html?id=${currentProfileId}`;

    // Init map
    initMap();

    // Load alerts
    await loadAlerts();

    // Load device status
    await loadDeviceStatus();

    // Subscribe to realtime alerts
    subscribeToAlerts();

  } catch (err) {
    console.error('Dashboard error:', err);
    showError();
  }
})();

// ===== Map =====
function initMap() {
  deviceMap = L.map('deviceMap', {
    center: [20.5937, 78.9629], // Default: India center
    zoom: 4,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(deviceMap);
}

function updateMapLocation(lat, lng) {
  if (!deviceMap) return;
  if (!lat || !lng) return;

  const pos = [lat, lng];

  if (deviceMarker) {
    deviceMarker.setLatLng(pos);
  } else {
    deviceMarker = L.circleMarker(pos, {
      radius: 10,
      fillColor: '#a855f7',
      color: '#a855f7',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.6
    }).addTo(deviceMap);
  }

  deviceMap.setView(pos, 15, { animate: true });
  document.getElementById('coordsText').textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
}

// ===== Load Device Status =====
async function loadDeviceStatus() {
  try {
    const { data, error } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .eq('alert_type', 'heartbeat')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const last = data[0];
      const timeDiff = Date.now() - new Date(last.timestamp).getTime();
      const isOnline = timeDiff < 5 * 60 * 1000; // 5 minutes

      setDeviceStatus(isOnline ? 'online' : 'offline');
      updateBattery(last.battery_level);
      document.getElementById('lastHeartbeat').textContent = `Last: ${timeAgo(last.timestamp)}`;

      if (last.latitude && last.longitude) {
        updateMapLocation(last.latitude, last.longitude);
      }
    } else {
      setDeviceStatus('offline');
    }

    // Check for active SOS alerts
    const { data: sosAlerts } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .eq('resolved', false)
      .neq('alert_type', 'heartbeat')
      .order('timestamp', { ascending: false });

    if (sosAlerts && sosAlerts.length > 0) {
      setDeviceStatus('alert');
    }
  } catch (err) {
    console.error('Status load error:', err);
  }
}

function setDeviceStatus(status) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  dot.className = 'status-dot ' + status;
  text.className = 'status-text ' + status;

  if (status === 'online') text.textContent = 'Online';
  else if (status === 'alert') text.textContent = 'ALERT ACTIVE';
  else text.textContent = 'Offline';
}

function updateBattery(level) {
  if (level === null || level === undefined) return;

  const bar = document.getElementById('batteryBar');
  const percent = document.getElementById('batteryPercent');
  const value = document.getElementById('batteryValue');

  bar.style.width = level + '%';
  bar.className = 'battery-bar ' + (level > 50 ? 'high' : level > 20 ? 'medium' : 'low');
  percent.textContent = level + '%';
  value.textContent = level + '%';
}

// ===== Load Alerts =====
async function loadAlerts() {
  try {
    const { data, error } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('profile_id', currentProfileId)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return;

    const activeFeed = document.getElementById('activeAlertFeed');
    const historyFeed = document.getElementById('alertHistory');
    let activeCount = 0;

    activeFeed.innerHTML = '';
    historyFeed.innerHTML = '';

    data.forEach(alert => {
      if (alert.alert_type === 'heartbeat') {
        // Skip heartbeats in the feed, only show in history
        const card = createAlertCard(alert, true);
        historyFeed.appendChild(card);
        return;
      }

      if (!alert.resolved) {
        activeCount++;
        const card = createAlertCard(alert, false);
        activeFeed.appendChild(card);

        // Update map to alert location
        if (alert.latitude && alert.longitude) {
          updateMapLocation(alert.latitude, alert.longitude);
        }
      } else {
        const card = createAlertCard(alert, true);
        historyFeed.appendChild(card);
      }
    });

    document.getElementById('activeAlertCount').textContent = activeCount;
    document.getElementById('activeAlertCount').style.color = activeCount > 0 ? '#ff3b30' : 'var(--neon-green)';

    if (activeFeed.children.length === 0) {
      activeFeed.innerHTML = '<div class="empty-state">No active alerts. All clear.</div>';
    }
    if (historyFeed.children.length === 0) {
      historyFeed.innerHTML = '<div class="empty-state">No alerts recorded yet.</div>';
    }

  } catch (err) {
    console.error('Load alerts error:', err);
  }
}

function createAlertCard(alert, isHistory) {
  const card = document.createElement('div');
  card.className = `alert-card ${alert.alert_type}`;
  card.innerHTML = `
    <span class="alert-type-badge ${alert.alert_type}">${alert.alert_type.toUpperCase()}</span>
    <div class="alert-card-info">
      <div class="alert-card-time">${formatTime(alert.timestamp)}</div>
      <div class="alert-card-coords">${alert.latitude ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}` : 'No GPS data'}${alert.battery_level !== null ? ` | Battery: ${alert.battery_level}%` : ''}</div>
    </div>
    ${!isHistory && !alert.resolved ? `<button class="alert-resolve-btn" onclick="resolveAlert('${alert.id}', this)">Resolve</button>` : ''}
  `;
  return card;
}

// ===== Resolve Alert =====
async function resolveAlert(alertId, btn) {
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const { error } = await supabase
      .from('device_alerts')
      .update({ resolved: true })
      .eq('id', alertId);

    if (error) throw error;

    // Reload alerts
    await loadAlerts();
    await loadDeviceStatus();

  } catch (err) {
    console.error('Resolve error:', err);
    btn.textContent = 'Retry';
    btn.disabled = false;
  }
}

// ===== Realtime Subscription =====
function subscribeToAlerts() {
  realtimeChannel = supabase
    .channel('device-alerts-' + currentProfileId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'device_alerts',
      filter: `profile_id=eq.${currentProfileId}`
    }, handleNewAlert)
    .subscribe();
}

function handleNewAlert(payload) {
  const alert = payload.new;

  if (alert.alert_type === 'heartbeat') {
    // Update status and battery
    setDeviceStatus('online');
    updateBattery(alert.battery_level);
    document.getElementById('lastHeartbeat').textContent = `Last: just now`;
    if (alert.latitude && alert.longitude) {
      updateMapLocation(alert.latitude, alert.longitude);
    }
    return;
  }

  // SOS / Fall / Geofence alert
  setDeviceStatus('alert');

  // Add to active feed
  const activeFeed = document.getElementById('activeAlertFeed');
  const emptyState = activeFeed.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const card = createAlertCard(alert, false);
  activeFeed.prepend(card);

  // Update count
  const countEl = document.getElementById('activeAlertCount');
  countEl.textContent = parseInt(countEl.textContent || '0') + 1;
  countEl.style.color = '#ff3b30';

  // Update map
  if (alert.latitude && alert.longitude) {
    updateMapLocation(alert.latitude, alert.longitude);
  }

  // Flash the page
  document.body.style.animation = 'none';
  document.body.offsetHeight; // Trigger reflow
  document.body.style.animation = '';
}

// ===== Link Device =====
async function linkDevice() {
  const deviceId = document.getElementById('linkDeviceIdInput').value.trim();
  if (!deviceId) return;

  try {
    const { error } = await supabase
      .from('emergency_profiles')
      .update({ device_id: deviceId, device_linked: true })
      .eq('id', currentProfileId);

    if (error) throw error;

    // Also update localStorage
    const local = localStorage.getItem(`profile_${currentProfileId}`);
    if (local) {
      const data = JSON.parse(local);
      data.deviceId = deviceId;
      localStorage.setItem(`profile_${currentProfileId}`, JSON.stringify(data));
    }

    // Reload page
    window.location.reload();

  } catch (err) {
    console.error('Link device error:', err);
    alert('Failed to link device. Try again.');
  }
}

// ===== Error State =====
function showError() {
  document.getElementById('pageLoading').classList.add('hidden');
  document.getElementById('pageError').classList.remove('hidden');
}

// ===== Utilities =====
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}
