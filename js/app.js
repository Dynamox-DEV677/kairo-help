// ===== Kairo's Help — App Logic =====

let tagsData = { allergies: [], medications: [], conditions: [] };
let socialLinks = [];
let customButtons = [];
let contactCount = 1;
let selectedColor = '#a855f7';
let avatarDataUrl = null;
let generatedProfileId = null;

const SOCIAL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: 'IG' },
  { value: 'twitter', label: 'X / Twitter', icon: 'X' },
  { value: 'github', label: 'GitHub', icon: 'GH' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'LI' },
  { value: 'discord', label: 'Discord', icon: 'DC' },
  { value: 'youtube', label: 'YouTube', icon: 'YT' },
  { value: 'tiktok', label: 'TikTok', icon: 'TT' },
  { value: 'twitch', label: 'Twitch', icon: 'TW' },
  { value: 'spotify', label: 'Spotify', icon: 'SP' },
  { value: 'website', label: 'Website', icon: 'WB' },
  { value: 'email', label: 'Email', icon: '@' }
];

// ===== Start Builder =====
function startBuilder() {
  document.getElementById('hero').classList.add('hidden');
  document.getElementById('builderArea').classList.remove('hidden');
  addSocialLink();
  addCustomBtn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Live Preview =====
function updatePreview() {
  const name = document.getElementById('displayName').value.trim() || 'Your Name';
  const bio = document.getElementById('bio').value.trim() || 'Your bio goes here...';

  document.getElementById('previewName').textContent = name;
  document.getElementById('previewBio').textContent = bio;

  // Avatar
  const avatarEl = document.getElementById('previewAvatar');
  if (avatarDataUrl) {
    avatarEl.innerHTML = `<img src="${avatarDataUrl}" alt="">`;
  } else {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatarEl.textContent = initials || '?';
  }

  // Custom buttons preview
  const btnContainer = document.getElementById('previewButtons');
  btnContainer.innerHTML = '';
  document.querySelectorAll('.custom-btn-entry').forEach(entry => {
    const label = entry.querySelector('[data-field="btnLabel"]').value.trim();
    if (label) {
      const div = document.createElement('div');
      div.className = 'preview-link-btn';
      div.textContent = label;
      btnContainer.appendChild(div);
    }
  });

  // Social icons preview
  const socialsContainer = document.getElementById('previewSocials');
  socialsContainer.innerHTML = '';
  document.querySelectorAll('.social-link-entry').forEach(entry => {
    const select = entry.querySelector('select');
    const url = entry.querySelector('[data-field="socialUrl"]');
    if (select && url && url.value.trim()) {
      const platform = SOCIAL_PLATFORMS.find(p => p.value === select.value);
      if (platform) {
        const icon = document.createElement('div');
        icon.className = 'preview-social-icon';
        icon.textContent = platform.icon;
        socialsContainer.appendChild(icon);
      }
    }
  });
}

// ===== Avatar Upload =====
function handleAvatar(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    avatarDataUrl = e.target.result;
    const uploadEl = document.getElementById('avatarUpload');
    uploadEl.innerHTML = `<img src="${avatarDataUrl}" alt="Avatar"><input type="file" accept="image/*" id="avatarInput" onchange="handleAvatar(this)">`;
    updatePreview();
  };
  reader.readAsDataURL(file);
}

// ===== Social Links =====
function addSocialLink() {
  const container = document.getElementById('socialLinksContainer');
  const entry = document.createElement('div');
  entry.className = 'social-link-entry';

  let optionsHtml = SOCIAL_PLATFORMS.map(p =>
    `<option value="${p.value}">${p.label}</option>`
  ).join('');

  entry.innerHTML = `
    <select class="form-select" onchange="updatePreview()">${optionsHtml}</select>
    <input type="text" class="form-input" placeholder="URL or @username" data-field="socialUrl" oninput="updatePreview()">
    <button class="remove-btn" onclick="this.parentElement.remove();updatePreview()">×</button>
  `;
  container.appendChild(entry);
}

// ===== Custom Buttons =====
function addCustomBtn() {
  const container = document.getElementById('customBtnsContainer');
  const entry = document.createElement('div');
  entry.className = 'custom-btn-entry';
  entry.innerHTML = `
    <input type="text" class="form-input" placeholder="Button Label" data-field="btnLabel" oninput="updatePreview()">
    <input type="text" class="form-input" placeholder="https://..." data-field="btnUrl">
    <button class="remove-btn" onclick="this.parentElement.remove();updatePreview()">×</button>
  `;
  container.appendChild(entry);
}

// ===== Tags Input =====
document.addEventListener('keydown', function(e) {
  if (e.target.classList.contains('tags-input')) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const input = e.target;
      const value = input.value.trim().replace(/,/g, '');
      if (!value) return;

      const target = input.dataset.target;
      if (tagsData[target].includes(value)) { input.value = ''; return; }

      tagsData[target].push(value);

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `${escapeHtml(value)} <button class="tag-remove" onclick="removeTag(this,'${target}','${escapeHtml(value)}')">&times;</button>`;
      input.parentElement.insertBefore(tag, input);
      input.value = '';
    }

    if (e.key === 'Backspace' && !e.target.value) {
      const target = e.target.dataset.target;
      if (tagsData[target].length > 0) {
        tagsData[target].pop();
        const tags = e.target.parentElement.querySelectorAll('.tag');
        if (tags.length) tags[tags.length - 1].remove();
      }
    }
  }
});

function removeTag(btn, target, value) {
  tagsData[target] = tagsData[target].filter(v => v !== value);
  btn.parentElement.remove();
}

// ===== Contacts =====
function addContact() {
  if (contactCount >= 3) return;
  contactCount++;
  const container = document.getElementById('contactsList');
  const entry = document.createElement('div');
  entry.className = 'social-link-entry';
  entry.dataset.contact = contactCount;
  entry.innerHTML = `
    <input type="text" class="form-input" placeholder="Name" data-field="contactName">
    <input type="tel" class="form-input" placeholder="Phone" data-field="contactPhone">
    <button class="remove-btn" onclick="this.parentElement.remove();contactCount--">×</button>
  `;
  container.appendChild(entry);
}

// ===== Color Picker =====
function pickColor(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  selectedColor = el.dataset.color;
  document.querySelector('.preview-avatar').style.borderColor = selectedColor;
  document.querySelector('.preview-avatar').style.boxShadow = `0 0 20px ${selectedColor}44, 0 0 60px ${selectedColor}22`;
}

// ===== Generate Profile =====
async function generateProfile() {
  const name = document.getElementById('displayName').value.trim();
  if (!name) {
    document.getElementById('displayName').style.borderColor = '#ef4444';
    document.getElementById('displayName').focus();
    setTimeout(() => document.getElementById('displayName').style.borderColor = '', 2000);
    return;
  }

  const btn = document.querySelector('.btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block"></span> Generating...';

  const profileData = collectFormData();
  const shortId = generateShortId();

  try {
    const { error: dbError } = await supabase
      .from('emergency_profiles')
      .insert({
        id: shortId,
        name: profileData.name,
        age: profileData.age,
        dob: null,
        language: null,
        blood_type: profileData.bloodType,
        allergies: profileData.allergies,
        medications: profileData.medications,
        conditions: profileData.conditions,
        contacts: profileData.contacts,
        notes: profileData.notes,
        edit_token: generateUUID(),
        // Store extended data as JSON in notes or a separate field
      });

    if (dbError) throw dbError;

    // Also save full profile data to localStorage for extended fields
    localStorage.setItem(`profile_${shortId}`, JSON.stringify(profileData));

    generatedProfileId = shortId;
    showResult(shortId);

  } catch (error) {
    console.error('Supabase error:', error);
    // Fallback: localStorage only
    localStorage.setItem(`profile_${shortId}`, JSON.stringify(profileData));
    generatedProfileId = shortId;
    showResult(shortId);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Generate My Profile';
  }
}

function collectFormData() {
  // Social links
  const socials = [];
  document.querySelectorAll('.social-link-entry').forEach(entry => {
    const select = entry.querySelector('select');
    const urlInput = entry.querySelector('[data-field="socialUrl"]');
    if (select && urlInput && urlInput.value.trim()) {
      socials.push({ platform: select.value, url: urlInput.value.trim() });
    }
  });

  // Custom buttons
  const buttons = [];
  document.querySelectorAll('.custom-btn-entry').forEach(entry => {
    const label = entry.querySelector('[data-field="btnLabel"]').value.trim();
    const url = entry.querySelector('[data-field="btnUrl"]').value.trim();
    if (label) buttons.push({ label, url });
  });

  // Contacts
  const contacts = [];
  document.querySelectorAll('#contactsList .social-link-entry, #contactsList > div').forEach(entry => {
    const nameEl = entry.querySelector('[data-field="contactName"]');
    const phoneEl = entry.querySelector('[data-field="contactPhone"]');
    if (nameEl && phoneEl) {
      const name = nameEl.value.trim();
      const phone = phoneEl.value.trim();
      if (name || phone) contacts.push({ name, phone });
    }
  });

  return {
    name: document.getElementById('displayName').value.trim(),
    username: document.getElementById('username').value.trim(),
    bio: document.getElementById('bio').value.trim(),
    avatar: avatarDataUrl,
    age: document.getElementById('age').value ? parseInt(document.getElementById('age').value) : null,
    bloodType: document.getElementById('bloodType').value || null,
    allergies: tagsData.allergies,
    medications: tagsData.medications,
    conditions: tagsData.conditions,
    contacts,
    notes: document.getElementById('notes').value.trim() || null,
    socials,
    buttons,
    accentColor: selectedColor,
    createdAt: new Date().toISOString()
  };
}

// ===== Show Result =====
function showResult(shortId) {
  const profileUrl = `${window.location.origin}/view.html?id=${shortId}`;
  document.getElementById('resultUrl').value = profileUrl;
  generateQRCode(profileUrl);
  document.getElementById('resultModal').classList.add('active');
}

// ===== QR Code =====
function generateQRCode(url) {
  const container = document.getElementById('qrContainer');
  container.innerHTML = '';
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const cellSize = 5;
  const margin = 12;
  const size = moduleCount * cellSize + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1d1d1f';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * cellSize + margin, row * cellSize + margin, cellSize, cellSize);
      }
    }
  }
  container.appendChild(canvas);
}

// ===== Actions =====
function copyUrl() {
  const input = document.getElementById('resultUrl');
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.classList.add('copied');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copy'; }, 2000);
  });
}

function downloadQR() {
  const canvas = document.querySelector('#qrContainer canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = 'profile-qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function viewProfile() {
  if (generatedProfileId) window.open(`view.html?id=${generatedProfileId}`, '_blank');
}

function closeModal() {
  document.getElementById('resultModal').classList.remove('active');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('active');
  });
});

// ===== Utilities =====
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});
