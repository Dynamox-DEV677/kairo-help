// ===== Kairo's Help — View Page =====

const SOCIAL_ICONS = {
  instagram: 'IG', twitter: 'X', github: 'GH', linkedin: 'LI',
  discord: 'DC', youtube: 'YT', tiktok: 'TT', twitch: 'TW',
  spotify: 'SP', website: 'WB', email: '@'
};

const SOCIAL_URLS = {
  instagram: 'https://instagram.com/',
  twitter: 'https://x.com/',
  github: 'https://github.com/',
  linkedin: 'https://linkedin.com/in/',
  discord: 'https://discord.gg/',
  youtube: 'https://youtube.com/@',
  tiktok: 'https://tiktok.com/@',
  twitch: 'https://twitch.tv/',
  spotify: 'https://open.spotify.com/user/',
  website: '',
  email: 'mailto:'
};

(async function() {
  const params = new URLSearchParams(window.location.search);
  const profileId = params.get('id');

  if (!profileId) { showError(); return; }

  try {
    let data = null;

    // Try localStorage first (has full profile data)
    const localData = localStorage.getItem(`profile_${profileId}`);
    if (localData) {
      data = JSON.parse(localData);
    }

    // Try Supabase for basic data
    if (!data) {
      try {
        const { data: row, error } = await supabase
          .from('emergency_profiles')
          .select('*')
          .eq('id', profileId)
          .single();

        if (row && !error) {
          data = {
            name: row.name,
            age: row.age,
            bloodType: row.blood_type,
            allergies: row.allergies || [],
            medications: row.medications || [],
            conditions: row.conditions || [],
            contacts: row.contacts || [],
            notes: row.notes,
            socials: [],
            buttons: [],
            accentColor: '#a855f7'
          };
        }
      } catch (e) {
        console.log('Supabase unavailable');
      }
    }

    // Fallback old format
    if (!data) {
      const oldData = localStorage.getItem(`eid_${profileId}`);
      if (oldData) data = JSON.parse(oldData);
    }

    if (!data) { showError(); return; }

    // Increment view count
    const viewKey = `views_${profileId}`;
    let views = parseInt(localStorage.getItem(viewKey) || '0') + 1;
    localStorage.setItem(viewKey, views.toString());

    renderProfile(data, views);

  } catch (error) {
    console.error('Error:', error);
    showError();
  }
})();

function renderProfile(data, views) {
  document.getElementById('viewLoading').classList.add('hidden');
  document.getElementById('viewContent').classList.remove('hidden');

  document.title = `${data.name} — Kairo's Help`;

  // Set accent color
  const color = data.accentColor || '#a855f7';
  document.documentElement.style.setProperty('--neon-purple', color);

  // Avatar
  const avatarEl = document.getElementById('profileAvatar');
  if (data.avatar) {
    avatarEl.innerHTML = `<img src="${data.avatar}" alt="${escapeHtml(data.name)}">`;
  } else {
    const initials = data.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatarEl.textContent = initials;
  }
  avatarEl.style.borderColor = color;
  avatarEl.style.boxShadow = `0 0 20px ${color}44, 0 0 60px ${color}22`;

  // Name
  document.getElementById('profileName').textContent = data.name;

  // Typing bio effect
  if (data.bio) {
    typeBio(data.bio);
  } else {
    document.getElementById('profileBio').innerHTML = '';
  }

  // Custom buttons
  if (data.buttons && data.buttons.length > 0) {
    const linksContainer = document.getElementById('profileLinks');
    data.buttons.forEach((btn, i) => {
      const link = document.createElement('a');
      link.href = btn.url || '#';
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'profile-link';
      link.style.animationDelay = `${i * 0.1}s`;
      link.innerHTML = `
        <div class="link-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></div>
        <span class="link-text">${escapeHtml(btn.label)}</span>
        <span class="link-arrow">→</span>
      `;
      // Ripple effect on click
      link.addEventListener('click', createRipple);
      linksContainer.appendChild(link);
    });
    animateIn(linksContainer.children);
  }

  // Social icons
  if (data.socials && data.socials.length > 0) {
    const socialsContainer = document.getElementById('profileSocials');
    data.socials.forEach((social, i) => {
      const link = document.createElement('a');
      let url = social.url;
      if (!url.startsWith('http') && !url.startsWith('mailto:')) {
        url = (SOCIAL_URLS[social.platform] || '') + url.replace('@', '');
      }
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'social-icon';
      link.title = social.platform;
      link.textContent = SOCIAL_ICONS[social.platform] || 'LK';
      link.style.animationDelay = `${i * 0.08}s`;
      socialsContainer.appendChild(link);
    });
    animateIn(socialsContainer.children);
  }

  // Emergency section
  const hasEmergency = data.bloodType || (data.allergies && data.allergies.length) ||
    (data.medications && data.medications.length) || (data.conditions && data.conditions.length) ||
    (data.contacts && data.contacts.length) || data.notes;

  if (hasEmergency) {
    document.getElementById('emergencySection').style.display = 'block';

    if (data.bloodType) {
      document.getElementById('bloodTypeCard').classList.remove('hidden');
      document.getElementById('viewBloodType').textContent = data.bloodType;
    }

    if (data.allergies && data.allergies.length) {
      document.getElementById('allergiesCard').classList.remove('hidden');
      const c = document.getElementById('viewAllergies');
      data.allergies.forEach(a => {
        const tag = document.createElement('span');
        tag.className = 'info-tag allergy';
        tag.textContent = a;
        c.appendChild(tag);
      });
    }

    if (data.medications && data.medications.length) {
      document.getElementById('medicationsCard').classList.remove('hidden');
      const c = document.getElementById('viewMedications');
      data.medications.forEach(m => {
        const tag = document.createElement('span');
        tag.className = 'info-tag medication';
        tag.textContent = m;
        c.appendChild(tag);
      });
    }

    if (data.conditions && data.conditions.length) {
      document.getElementById('conditionsCard').classList.remove('hidden');
      const c = document.getElementById('viewConditions');
      data.conditions.forEach(co => {
        const tag = document.createElement('span');
        tag.className = 'info-tag condition';
        tag.textContent = co;
        c.appendChild(tag);
      });
    }

    if (data.contacts && data.contacts.length) {
      document.getElementById('contactsCard').classList.remove('hidden');
      const c = document.getElementById('viewContacts');
      const colors = ['#a855f7', '#3b82f6', '#10b981', '#ec4899'];
      data.contacts.forEach((contact, i) => {
        if (!contact.name && !contact.phone) return;
        const card = document.createElement('a');
        card.href = contact.phone ? `tel:${contact.phone}` : '#';
        card.className = 'contact-card';
        const initial = contact.name ? contact.name[0].toUpperCase() : '?';
        const bgColor = colors[i % colors.length];
        card.innerHTML = `
          <div class="contact-avatar" style="background:${bgColor}">${initial}</div>
          <div class="contact-info">
            <div class="contact-name">${escapeHtml(contact.name || 'Unknown')}</div>
            <div class="contact-relation">${contact.phone ? escapeHtml(contact.phone) : ''}</div>
          </div>
          ${contact.phone ? '<div class="contact-call-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 014.12 4.18 2 2 0 016.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg></div>' : ''}
        `;
        c.appendChild(card);
      });
    }

    if (data.notes) {
      document.getElementById('notesCard').classList.remove('hidden');
      document.getElementById('viewNotes').textContent = data.notes;
    }
  }

  // View counter
  document.getElementById('viewCount').textContent = views || 0;
}

// ===== Typing Bio Effect =====
function typeBio(text) {
  const el = document.getElementById('profileBio');
  el.innerHTML = '<span class="typing-cursor"></span>';
  let i = 0;

  function typeChar() {
    if (i < text.length) {
      const cursor = el.querySelector('.typing-cursor');
      const span = document.createTextNode(text[i]);
      el.insertBefore(span, cursor);
      i++;
      setTimeout(typeChar, 30 + Math.random() * 40);
    } else {
      // Remove cursor after a delay
      setTimeout(() => {
        const cursor = el.querySelector('.typing-cursor');
        if (cursor) cursor.remove();
      }, 2000);
    }
  }

  setTimeout(typeChar, 500);
}

// ===== Animate Elements In =====
function animateIn(elements) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  Array.from(elements).forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `all 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.1}s`;
    observer.observe(el);
  });
}

// ===== Ripple Effect =====
function createRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${e.clientX - rect.left - size/2}px;
    top: ${e.clientY - rect.top - size/2}px;
    background: rgba(255,255,255,0.15);
    border-radius: 50%;
    transform: scale(0);
    animation: rippleAnim 0.6s ease-out;
    pointer-events: none;
    z-index: 2;
  `;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

// Add ripple animation
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes rippleAnim {
    to { transform: scale(2.5); opacity: 0; }
  }
`;
document.head.appendChild(rippleStyle);

// ===== Error =====
function showError() {
  document.getElementById('viewLoading').classList.add('hidden');
  document.getElementById('viewError').classList.remove('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
