// IndexedDB Manager untuk Offline Queue
// Handles: Transaction queue, optimistic stock updates, sync status

const DB_NAME = 'BantuKasirDB';
const DB_VERSION = 1;
const QUEUE_STORE = 'transactionQueue';
const STOCK_STORE = 'optimisticStock';

let db = null;

// Initialize IndexedDB
async function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[OfflineDB] Error opening database:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('[OfflineDB] Database opened successfully');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[OfflineDB] Upgrading database...');
      
      // Create transaction queue store
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, { 
          keyPath: 'id' 
        });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        console.log('[OfflineDB] Created transaction queue store');
      }
      
      // Create optimistic stock store
      if (!db.objectStoreNames.contains(STOCK_STORE)) {
        const stockStore = db.createObjectStore(STOCK_STORE, { 
          keyPath: 'productId' 
        });
        console.log('[OfflineDB] Created optimistic stock store');
      }
    };
  });
}

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ===== TRANSACTION QUEUE OPERATIONS =====

// Add transaction to queue
async function addToQueue(transactionData) {
  if (!db) {
    console.log('[OfflineDB] DB not initialized, initializing now...');
    await initOfflineDB();
  }
  
  const transaction = {
    ...transactionData,
    id: transactionData.id || generateUUID(), // Use provided ID or generate new
    timestamp: transactionData.timestamp || Date.now(),
    status: 'pending', // pending, syncing, synced, failed
    retryCount: 0,
    createdAt: new Date().toISOString()
  };
  
  console.log('[OfflineDB] Adding transaction to queue:', transaction);
  
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([QUEUE_STORE], 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const request = store.add(transaction);
      
      request.onsuccess = () => {
        console.log('[OfflineDB] ✓ Transaction added to queue:', transaction.id);
        resolve(transaction);
      };
      
      request.onerror = () => {
        console.error('[OfflineDB] ✗ Error adding to queue:', request.error);
        reject(request.error);
      };
    } catch (error) {
      console.error('[OfflineDB] ✗ Transaction error:', error);
      reject(error);
    }
  });
}

// Get all pending transactions
async function getPendingTransactions() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll('pending');
    
    request.onsuccess = () => {
      const transactions = request.result.sort((a, b) => a.timestamp - b.timestamp);
      console.log('[OfflineDB] Found pending transactions:', transactions.length);
      resolve(transactions);
    };
    
    request.onerror = () => {
      console.error('[OfflineDB] Error getting pending transactions:', request.error);
      reject(request.error);
    };
  });
}

// Get all transactions in queue (including failed)
async function getAllQueuedTransactions() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const transactions = request.result.sort((a, b) => a.timestamp - b.timestamp);
      resolve(transactions);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Update transaction status
async function updateTransactionStatus(id, status, error = null) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const transaction = getRequest.result;
      
      if (transaction) {
        transaction.status = status;
        transaction.lastAttempt = Date.now();
        
        if (error) {
          transaction.error = error;
          transaction.retryCount = (transaction.retryCount || 0) + 1;
        }
        
        const updateRequest = store.put(transaction);
        
        updateRequest.onsuccess = () => {
          console.log('[OfflineDB] Transaction status updated:', id, status);
          resolve(transaction);
        };
        
        updateRequest.onerror = () => {
          reject(updateRequest.error);
        };
      } else {
        reject(new Error('Transaction not found'));
      }
    };
    
    getRequest.onerror = () => {
      reject(getRequest.error);
    };
  });
}

// Remove transaction from queue
async function removeFromQueue(id) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      console.log('[OfflineDB] Transaction removed from queue:', id);
      resolve();
    };
    
    request.onerror = () => {
      console.error('[OfflineDB] Error removing from queue:', request.error);
      reject(request.error);
    };
  });
}

// Clear all successfully synced transactions
async function clearSyncedTransactions() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log('[OfflineDB] Cleared synced transactions');
      resolve();
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ===== OPTIMISTIC STOCK OPERATIONS =====

// Update optimistic stock (decrease when selling offline)
async function updateOptimisticStock(productId, quantityChange, variantIndex = null) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STOCK_STORE], 'readwrite');
    const store = tx.objectStore(STOCK_STORE);
    const getRequest = store.get(productId);
    
    getRequest.onsuccess = () => {
      let stockData = getRequest.result || {
        productId,
        adjustments: {}
      };
      
      const key = variantIndex !== null ? `v_${variantIndex}` : 'main';
      stockData.adjustments[key] = (stockData.adjustments[key] || 0) + quantityChange;
      stockData.lastUpdated = Date.now();
      
      const putRequest = store.put(stockData);
      
      putRequest.onsuccess = () => {
        console.log('[OfflineDB] Optimistic stock updated:', productId, quantityChange);
        resolve(stockData);
      };
      
      putRequest.onerror = () => {
        reject(putRequest.error);
      };
    };
    
    getRequest.onerror = () => {
      reject(getRequest.error);
    };
  });
}

// Get optimistic stock adjustment
async function getOptimisticStock(productId) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STOCK_STORE], 'readonly');
    const store = tx.objectStore(STOCK_STORE);
    const request = store.get(productId);
    
    request.onsuccess = () => {
      resolve(request.result || null);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Clear optimistic stock after successful sync
async function clearOptimisticStock() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STOCK_STORE], 'readwrite');
    const store = tx.objectStore(STOCK_STORE);
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log('[OfflineDB] Cleared optimistic stock');
      resolve();
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ===== UTILITY FUNCTIONS =====

// Get queue count (only pending + failed, not already synced)
async function getQueueCount() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => {
      // Count items that still need to be sent (pending, syncing, or failed)
      const count = request.result.filter(
        item => item.status === 'pending' || item.status === 'syncing' || item.status === 'failed'
      ).length;
      resolve(count);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Reset failed transactions back to pending (so they can be retried)
async function resetFailedTransactions() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll('failed');
    
    request.onsuccess = () => {
      const failed = request.result;
      let pending = failed.length;
      
      if (pending === 0) {
        resolve(0);
        return;
      }
      
      let updated = 0;
      failed.forEach(item => {
        item.status = 'pending';
        item.error = null;
        const putRequest = store.put(item);
        putRequest.onsuccess = () => {
          updated++;
          if (updated === pending) {
            console.log(`[OfflineDB] Reset ${updated} failed transactions to pending`);
            resolve(updated);
          }
        };
        putRequest.onerror = () => {
          updated++;
          if (updated === pending) resolve(updated);
        };
      });
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Check if transaction ID exists (to prevent duplicates)
async function transactionExists(id) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.get(id);
    
    request.onsuccess = () => {
      resolve(request.result !== undefined);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Export functions
window.OfflineDB = {
  init: initOfflineDB,
  generateUUID,
  
  // Queue operations
  addToQueue,
  getPendingTransactions,
  getAllQueuedTransactions,
  updateTransactionStatus,
  removeFromQueue,
  clearSyncedTransactions,
  getQueueCount,
  transactionExists,
  resetFailedTransactions,
  
  // Stock operations
  updateOptimisticStock,
  getOptimisticStock,
  clearOptimisticStock
};

console.log('[OfflineDB] Module loaded');
