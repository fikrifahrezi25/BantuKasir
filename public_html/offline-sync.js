// Offline Sync Manager - Handle transaction synchronization and connection status
// Auto sync on: online event, app open, periodic retry with backoff

let syncInProgress = false;
let connectionStatus = 'checking'; // checking, online, offline
let syncRetryTimeout = null;
let healthCheckInterval = null;

const SYNC_RETRY_DELAYS = [5000, 10000, 30000, 60000, 300000]; // 5s, 10s, 30s, 1m, 5m
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

// Initialize sync manager
async function initSyncManager() {
  console.log('[Sync] Initializing sync manager...');
  
  // Initialize IndexedDB
  await OfflineDB.init();
  
  // Check connection status
  await checkConnectionStatus();
  
  // Setup event listeners
  setupEventListeners();
  
  // Start health check interval
  startHealthCheck();
  
  // Try initial sync if online
  if (connectionStatus === 'online') {
    setTimeout(async () => {
      console.log('[Sync] Initial sync on app start');
      await syncPendingProduk();
      await syncOfflineTransactions();
    }, 1000);
  }
  
  console.log('[Sync] Sync manager initialized');
}

// Setup event listeners for auto sync
function setupEventListeners() {
  // Online event
  window.addEventListener('online', async () => {
    console.log('[Sync] Network online event - starting auto sync');
    updateConnectionStatus('online');
    
    // Wait a bit for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Sync both queued transactions AND pending produk changes
    console.log('[Sync] Triggering syncOfflineTransactions');
    await syncOfflineTransactions();
    
    // Also sync pending produk
    console.log('[Sync] Triggering syncPendingProduk');
    await syncPendingProduk();
  });
  
  // Offline event  
  window.addEventListener('offline', () => {
    console.log('[Sync] Network offline event');
    updateConnectionStatus('offline');
  });
  
  // Visibility change (app comes to foreground)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      console.log('[Sync] App visible, checking connection...');
      const isOnline = await checkConnectionStatus();
      if (isOnline) {
        console.log('[Sync] Connection available, starting sync...');
        await syncOfflineTransactions();
        await syncPendingProduk();
      }
    }
  });
  
  // Register Background Sync if supported
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    console.log('[Sync] Background Sync API supported');
  } else {
    console.log('[Sync] Background Sync API not supported, using fallback');
  }
}

// Check connection status with health endpoint
async function checkConnectionStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    
    const isOnline = response.ok;
    updateConnectionStatus(isOnline ? 'online' : 'offline');
    return isOnline;
    
  } catch (error) {
    console.log('[Sync] Health check failed:', error.message);
    updateConnectionStatus('offline');
    return false;
  }
}

// Start periodic health check
function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(() => {
    checkConnectionStatus();
  }, HEALTH_CHECK_INTERVAL);
}

// Update connection status and UI
function updateConnectionStatus(status) {
  const oldStatus = connectionStatus;
  connectionStatus = status;
  
  if (oldStatus !== status) {
    console.log('[Sync] Connection status changed:', oldStatus, '->', status);
    updateConnectionUI(status);
    
    // Show notification on status change
    if (status === 'offline' && oldStatus === 'online') {
      showOfflineBanner();
    } else if (status === 'online' && oldStatus === 'offline') {
      hideOfflineBanner();
    }
  }
}

// Update connection UI in header
function updateConnectionUI(status) {
  const netIndicator = document.getElementById('net');
  if (!netIndicator) return;
  
  if (status === 'online') {
    netIndicator.textContent = 'Online';
    netIndicator.style.color = 'var(--brand)';
  } else if (status === 'offline') {
    netIndicator.textContent = 'Offline';
    netIndicator.style.color = 'var(--muted)';
  } else if (status === 'syncing') {
    netIndicator.textContent = 'Menyinkronkan...';
    netIndicator.style.color = 'var(--accent)';
  }
  
  // Update with queue count if exists
  updateQueueCountDisplay();
}

// Show offline banner
function showOfflineBanner() {
  // Remove existing banner if any
  const existing = document.getElementById('offline-banner');
  if (existing) existing.remove();
  
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: var(--warn);
    color: #fff;
    padding: 12px 16px;
    text-align: center;
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;
  banner.innerHTML = '📡 Anda sedang offline. Penjualan tetap tersimpan dan akan dikirim saat online.';
  
  document.body.prepend(banner);
  
  // Auto hide after 5 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.transition = 'opacity 0.3s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 300);
    }
  }, 5000);
}

// Hide offline banner
function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  }
}

// Update queue count display
async function updateQueueCountDisplay() {
  try {
    const count = await OfflineDB.getQueueCount();
    const netIndicator = document.getElementById('net');
    
    if (count > 0 && netIndicator) {
      netIndicator.textContent = `${count} menunggu dikirim`;
      netIndicator.style.color = 'var(--accent)';
    } else if (count === 0 && connectionStatus === 'online' && netIndicator) {
      netIndicator.textContent = 'Online';
      netIndicator.style.color = 'var(--brand)';
    }
  } catch (error) {
    console.error('[Sync] Error updating queue count:', error);
  }
}

// Main sync function
async function syncOfflineTransactions() {
  if (syncInProgress) {
    console.log('[Sync] Sync already in progress, skipping');
    return;
  }
  
  console.log('[Sync] === Starting syncOfflineTransactions ===');
  console.log('[Sync] Current connection status:', connectionStatus);
  
  // Check if we're actually online
  if (connectionStatus !== 'online') {
    console.log('[Sync] Not online according to status, checking connection...');
    const isOnline = await checkConnectionStatus();
    if (!isOnline) {
      console.log('[Sync] Connection check failed, skipping sync');
      return;
    }
    console.log('[Sync] Connection check passed, proceeding...');
  }
  
  try {
    syncInProgress = true;
    updateConnectionStatus('syncing');
    
    // Reset failed transactions back to pending so they get retried
    if (OfflineDB.resetFailedTransactions) {
      await OfflineDB.resetFailedTransactions();
    }
    
    const pendingTransactions = await OfflineDB.getPendingTransactions();
    
    console.log(`[Sync] Found ${pendingTransactions.length} pending transactions in queue`);
    
    if (pendingTransactions.length === 0) {
      console.log('[Sync] No pending transactions');
      syncInProgress = false;
      updateConnectionStatus('online');
      // Still sync pending produk changes even if no transaction queue
      await syncPendingProduk();
      if (window.loadProduk) await window.loadProduk();
      if (window.render && window.S) window.render();
      updateQueueCountDisplay();
      return;
    }
    
    console.log(`[Sync] Starting sync of ${pendingTransactions.length} transactions...`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Sync transactions sequentially
    for (const transaction of pendingTransactions) {
      try {
        await OfflineDB.updateTransactionStatus(transaction.id, 'syncing');
        
        // Send to server
        const response = await fetch('/api/transaksi', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: USER_ID,
            transaksi: {
              id: transaction.id, // UUID from client
              timestamp: transaction.timestamp,
              items: transaction.items,
              total: transaction.total,
              subtotal: transaction.subtotal,
              diskon: transaction.diskon || 0,
              diskon_persen: transaction.diskon_persen || 0,
              diskon_nominal: transaction.diskon_nominal || 0,
              ppn: transaction.ppn || 0,
              ppn_persen: transaction.ppn_persen || 0,
              metode_bayar: transaction.metode,
              kasir: transaction.kasir,
              void: false,
              bayar: transaction.bayar,
              kembalian: transaction.kembalian
            }
          })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          // Success - remove from queue
          await OfflineDB.removeFromQueue(transaction.id);
          successCount++;
          console.log('[Sync] Transaction synced successfully:', transaction.id);
        } else {
          // Failed - update status
          await OfflineDB.updateTransactionStatus(
            transaction.id, 
            'failed', 
            result.error || 'Unknown error'
          );
          failCount++;
          console.error('[Sync] Transaction sync failed:', transaction.id, result.error);
        }
        
      } catch (error) {
        console.error('[Sync] Error syncing transaction:', transaction.id, error);
        await OfflineDB.updateTransactionStatus(
          transaction.id,
          'failed',
          error.message
        );
        failCount++;
      }
    }
    
    console.log(`[Sync] Sync completed: ${successCount} success, ${failCount} failed`);
    
    // Clear optimistic stock if all synced
    if (successCount > 0 && failCount === 0) {
      await OfflineDB.clearOptimisticStock();
    }
    
    // Refresh UI data
    if (successCount > 0) {
      await refreshDataAfterSync();
      showSyncSuccessBanner(successCount);
    }
    
    // Schedule retry if there are failures
    if (failCount > 0) {
      scheduleRetry(failCount);
    }
    
  } catch (error) {
    console.error('[Sync] Sync error:', error);
  } finally {
    syncInProgress = false;
    updateConnectionStatus('online');
    updateQueueCountDisplay();
  }
}

// Refresh data from server after successful sync
async function refreshDataAfterSync() {
  console.log('[Sync] Refreshing data after sync...');
  
  try {
    // Sync pending produk/stok changes saved offline
    await syncPendingProduk();
    
    // Reload products to get updated stock
    if (window.loadProduk) {
      await window.loadProduk();
    }
    
    // Reload transactions
    if (window.loadTransaksi) {
      await window.loadTransaksi();
    }
    
    // Refresh current view
    if (window.render && window.S) {
      window.render();
    }
    
  } catch (error) {
    console.error('[Sync] Error refreshing data:', error);
  }
}

// Sync pending produk changes that were saved offline
async function syncPendingProduk() {
  try {
    // USER_ID is exposed as window.USER_ID from dashboard.html
    const userId = window.USER_ID;
    if (!userId) return;
    
    const pendingKey = 'offline_produk_pending_' + userId;
    const produkKey = 'offline_produk_' + userId;
    
    const hasPending = localStorage.getItem(pendingKey) === 'true';
    if (!hasPending) return;
    
    const produkJson = localStorage.getItem(produkKey);
    if (!produkJson) {
      localStorage.removeItem(pendingKey);
      return;
    }
    
    const produk = JSON.parse(produkJson);
    console.log('[Sync] Syncing pending produk changes to server...');
    
    const response = await fetch('/api/produk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, produk })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('[Sync] Pending produk synced successfully');
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(produkKey);
      // Update in-memory state with confirmed server data
      if (window.S) {
        window.S.prod = produk;
      }
    } else {
      console.error('[Sync] Failed to sync pending produk:', result);
    }
  } catch (error) {
    console.error('[Sync] Error syncing pending produk:', error);
  }
}

// Show success banner
function showSyncSuccessBanner(count) {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: var(--brand);
    color: #fff;
    padding: 12px 16px;
    text-align: center;
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;
  banner.textContent = `✓ Semua transaksi sudah terkirim (${count})`;
  
  document.body.prepend(banner);
  
  setTimeout(() => {
    banner.style.transition = 'opacity 0.3s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  }, 3000);
}

// Schedule retry with exponential backoff
function scheduleRetry(attemptNumber) {
  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
  }
  
  const delayIndex = Math.min(attemptNumber - 1, SYNC_RETRY_DELAYS.length - 1);
  const delay = SYNC_RETRY_DELAYS[delayIndex];
  
  console.log(`[Sync] Scheduling retry in ${delay}ms (attempt ${attemptNumber})`);
  
  syncRetryTimeout = setTimeout(() => {
    syncOfflineTransactions();
  }, delay);
}

// Register Background Sync (if supported)
async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-transactions');
      console.log('[Sync] Background Sync registered');
    } catch (error) {
      console.error('[Sync] Background Sync registration failed:', error);
    }
  }
}

// Export functions to global scope
window.syncOfflineTransactions = syncOfflineTransactions;
window.initSyncManager = initSyncManager;
window.checkConnectionStatus = checkConnectionStatus;
window.getConnectionStatus = () => connectionStatus;

console.log('[Sync] Sync manager module loaded');
