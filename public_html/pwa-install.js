// PWA Install Prompt Handler

let deferredPrompt = null;
let isInstalled = false;

// Initialize PWA install handler
function initPWAInstall() {
  console.log('[PWA Install] Initializing...');
  
  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true) {
    isInstalled = true;
    console.log('[PWA Install] App is already installed');
    hideInstallButton();
    return;
  }
  
  // Listen for beforeinstallprompt event (Chrome, Edge, Samsung Internet)
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA Install] beforeinstallprompt event fired');
    
    // Prevent automatic prompt
    e.preventDefault();
    
    // Store the event
    deferredPrompt = e;
    
    // Show install button
    showInstallButton();
  });
  
  // Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA Install] App installed successfully');
    isInstalled = true;
    hideInstallButton();
    
    if (window.toast) {
      window.toast('✓ BantuKasir berhasil dipasang');
    }
    
    // Clear the deferredPrompt
    deferredPrompt = null;
  });
  
  // Check for iOS Safari (doesn't support beforeinstallprompt)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  
  if (isIOS && isSafari && !isInstalled) {
    console.log('[PWA Install] iOS Safari detected, showing manual instructions');
    setTimeout(() => showIOSInstallInstructions(), 2000);
  }
}

// Show install button
function showInstallButton() {
  // Check if button already exists
  let installBtn = document.getElementById('pwa-install-btn');
  
  if (!installBtn) {
    installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.className = 'btn btn--p';
    installBtn.innerHTML = `
      <svg class="i" style="margin-right:8px;width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Pasang Aplikasi
    `;
    installBtn.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9998;
      display: flex;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideUp 0.3s ease-out;
    `;
    
    installBtn.addEventListener('click', handleInstallClick);
    
    document.body.appendChild(installBtn);
    
    // Add animation keyframes
    if (!document.getElementById('pwa-install-style')) {
      const style = document.createElement('style');
      style.id = 'pwa-install-style';
      style.textContent = `
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Hide install button
function hideInstallButton() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.animation = 'slideDown 0.3s ease-out';
    setTimeout(() => installBtn.remove(), 300);
  }
}

// Handle install button click
async function handleInstallClick() {
  if (!deferredPrompt) {
    console.log('[PWA Install] No deferred prompt available');
    return;
  }
  
  // Hide the button
  hideInstallButton();
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for user choice
  const { outcome } = await deferredPrompt.userChoice;
  console.log('[PWA Install] User choice:', outcome);
  
  if (outcome === 'accepted') {
    console.log('[PWA Install] User accepted the install prompt');
  } else {
    console.log('[PWA Install] User dismissed the install prompt');
    // Show button again after 30 seconds
    setTimeout(showInstallButton, 30000);
  }
  
  // Clear the deferredPrompt
  deferredPrompt = null;
}

// Show iOS install instructions
function showIOSInstallInstructions() {
  const banner = document.createElement('div');
  banner.id = 'ios-install-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--card);
    border-top: 2px solid var(--brand);
    padding: 16px;
    z-index: 9998;
    box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
    animation: slideUp 0.3s ease-out;
  `;
  
  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <svg style="width:24px;height:24px;flex-shrink:0;fill:var(--brand);" viewBox="0 0 24 24">
        <path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
        <path d="M12 18h.01"/>
      </svg>
      <div style="flex:1;">
        <div style="font-weight:600;margin-bottom:4px;color:var(--brand);">Pasang BantuKasir</div>
        <div style="font-size:14px;color:var(--muted);line-height:1.4;">
          Ketuk tombol <strong>Bagikan</strong> 
          <svg style="width:16px;height:16px;display:inline;vertical-align:text-bottom;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          lalu pilih <strong>"Tambahkan ke Layar Utama"</strong>
        </div>
      </div>
      <button onclick="document.getElementById('ios-install-banner').remove()" 
              style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;padding:0;line-height:1;">
        ×
      </button>
    </div>
  `;
  
  document.body.appendChild(banner);
  
  // Auto hide after 30 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.animation = 'slideDown 0.3s ease-out';
      setTimeout(() => banner.remove(), 300);
    }
  }, 30000);
}

// Check if running as installed PWA
window.isPWAInstalled = function() {
  return isInstalled || 
         window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
};

console.log('[PWA Install] Module loaded');

