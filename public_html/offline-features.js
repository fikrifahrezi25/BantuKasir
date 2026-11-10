// Offline Features Handler - Disable AI features when offline

let isOnlineGlobal = true;

// Initialize offline features handler
function initOfflineFeaturesHandler() {
  console.log('[OfflineFeatures] Initializing...');
  
  // Listen to connection status changes
  window.addEventListener('online', () => {
    isOnlineGlobal = true;
    updateOfflineFeatures(true);
  });
  
  window.addEventListener('offline', () => {
    isOnlineGlobal = false;
    updateOfflineFeatures(false);
  });
  
  // Check initial status
  checkAndUpdateFeatures();
  
  // Update periodically
  setInterval(checkAndUpdateFeatures, 5000);
}

// Check connection and update features
async function checkAndUpdateFeatures() {
  if (window.getConnectionStatus) {
    const status = window.getConnectionStatus();
    const isOnline = status === 'online';
    
    if (isOnline !== isOnlineGlobal) {
      isOnlineGlobal = isOnline;
      updateOfflineFeatures(isOnline);
    }
  }
}

// Update offline features based on connection status
function updateOfflineFeatures(isOnline) {
  console.log('[OfflineFeatures] Updating features, online:', isOnline);
  
  // Update voice button
  updateVoiceButton(isOnline);
  
  // Update insight refresh button
  updateInsightButton(isOnline);
  
  // Update other online-only actions
  updateOnlineOnlyActions(isOnline);
}

// Update voice order button
function updateVoiceButton(isOnline) {
  const voiceBtn = document.getElementById('voice-btn');
  if (!voiceBtn) return;
  
  if (!isOnline) {
    voiceBtn.disabled = true;
    voiceBtn.style.opacity = '0.5';
    voiceBtn.style.cursor = 'not-allowed';
    voiceBtn.title = 'Voice order memerlukan koneksi internet';
  } else {
    voiceBtn.disabled = false;
    voiceBtn.style.opacity = '';
    voiceBtn.style.cursor = '';
    voiceBtn.title = 'Klik untuk pesan dengan suara';
  }
}

// Update insight refresh button
function updateInsightButton(isOnline) {
  const insightBtn = document.querySelector('[data-act="refresh-insight"]');
  if (!insightBtn) return;
  
  if (!isOnline) {
    if (!insightBtn.hasAttribute('data-original-disabled')) {
      insightBtn.setAttribute('data-original-disabled', insightBtn.disabled);
    }
    insightBtn.disabled = true;
    insightBtn.style.opacity = '0.5';
    insightBtn.style.cursor = 'not-allowed';
    insightBtn.title = 'AI Insight memerlukan koneksi internet';
  } else {
    const wasDisabled = insightBtn.getAttribute('data-original-disabled') === 'true';
    insightBtn.disabled = wasDisabled;
    insightBtn.style.opacity = wasDisabled ? '0.5' : '';
    insightBtn.style.cursor = wasDisabled ? 'not-allowed' : '';
    insightBtn.removeAttribute('data-original-disabled');
  }
}

// Update other online-only actions
function updateOnlineOnlyActions(isOnline) {
  // Void transaction button
  const voidButtons = document.querySelectorAll('[data-act="void-trx"]');
  voidButtons.forEach(btn => {
    if (!isOnline) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.title = 'Fitur ini memerlukan koneksi internet';
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.title = '';
    }
  });
  
  // Export buttons
  const exportButtons = document.querySelectorAll('[data-act="ekspor-excel"], [data-act="ekspor-csv"]');
  exportButtons.forEach(btn => {
    if (!isOnline) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.title = 'Ekspor memerlukan koneksi internet';
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.title = '';
    }
  });
}

// Override voice order handler to check online status
const originalVoiceHandler = window.handleVoiceOrder;
window.handleVoiceOrder = function() {
  if (!isOnlineGlobal || window.getConnectionStatus() !== 'online') {
    if (window.toast) {
      window.toast('Voice order memerlukan koneksi internet');
    } else {
      alert('Voice order memerlukan koneksi internet');
    }
    return;
  }
  
  if (originalVoiceHandler) {
    originalVoiceHandler.apply(this, arguments);
  }
};

// Override refresh insight handler
const originalRefreshInsight = window.refreshInsight;
window.refreshInsight = async function() {
  if (!isOnlineGlobal || window.getConnectionStatus() !== 'online') {
    if (window.toast) {
      window.toast('AI Insight memerlukan koneksi internet');
    } else {
      alert('AI Insight memerlukan koneksi internet');
    }
    return;
  }
  
  if (originalRefreshInsight) {
    return await originalRefreshInsight.apply(this, arguments);
  }
};

// Show offline message for AI features
window.showOfflineMessage = function(feature) {
  const message = `${feature} memerlukan koneksi internet. Anda saat ini sedang offline.`;
  
  if (window.toast) {
    window.toast(message);
  } else {
    alert(message);
  }
};

// Check if feature is available offline
window.isFeatureAvailableOffline = function(feature) {
  const offlineFeatures = [
    'kasir', // Penjualan
    'produk', // View produk
    'home', // Beranda (data cached)
    'laporan' // Laporan (data cached)
  ];
  
  return offlineFeatures.includes(feature);
};

console.log('[OfflineFeatures] Module loaded');
