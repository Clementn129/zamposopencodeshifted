// Offline storage utilities using IndexedDB and localStorage

const DB_NAME = 'zampos_db';
const DB_VERSION = 4; // Bumped for resilient cache refresh

interface OfflineSale {
  id: string;
  businessId: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    costPrice?: number | null;
    discountType?: string | null;
    discountValue?: number;
    taxCategory?: 'taxable' | 'zero_rated' | 'exempt';
  }>;
  subtotal: number;
  total: number;
  discountAmount?: number;
  discountType?: string | null;
  paymentMethod: string;
  createdAt: string;
  synced: boolean;
  taxAmount?: number;
  taxableAmount?: number;
  zeroRatedAmount?: number;
  exemptAmount?: number;
  customerName?: string | null;
  customerTpin?: string | null;
  customerPhone?: string | null;
  amountPaid?: number;
  dueDate?: string | null;
}

interface OfflineStockUpdate {
  id: string;
  productId: string;
  businessId: string;
  stockChange: number; // positive for add, negative for subtract
  createdAt: string;
  synced: boolean;
}

interface OfflineProduct {
  id: string;
  businessId: string;
  name: string;
  price: number;
  costPrice: number | null;
  stock: number;
  minimumStock: number;
  category: string | null;
  isActive: boolean;
  taxCategory?: 'taxable' | 'zero_rated' | 'exempt';
  imageUrl?: string | null;        // signed/public URL when available, else storage path
  imagePath?: string | null;       // raw storage object path (e.g. "{businessId}/{filename}")
  parentId?: string | null;
  variantLabel?: string | null;
}

interface SubscriptionCache {
  expiresAt: string;
  status: string;
  lastSyncAt: string;
  isLocked: boolean;
}

interface CachedBusiness {
  id: string;
  name: string;
  paymentCode: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  isLocked: boolean;
  lastSyncAt: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

let dbInstance: IDBDatabase | null = null;

// Initialize IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // Return cached instance if available
    if (dbInstance && dbInstance.objectStoreNames.length > 0) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores
      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('synced', 'synced', { unique: false });
        salesStore.createIndex('businessId', 'businessId', { unique: false });
      }

      if (!db.objectStoreNames.contains('products')) {
        const productsStore = db.createObjectStore('products', { keyPath: 'id' });
        productsStore.createIndex('businessId', 'businessId', { unique: false });
      }

      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart', { keyPath: 'productId' });
      }

      if (!db.objectStoreNames.contains('stockUpdates')) {
        const stockStore = db.createObjectStore('stockUpdates', { keyPath: 'id' });
        stockStore.createIndex('synced', 'synced', { unique: false });
        stockStore.createIndex('businessId', 'businessId', { unique: false });
        stockStore.createIndex('productId', 'productId', { unique: false });
      }

      if (!db.objectStoreNames.contains('business')) {
        db.createObjectStore('business', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('debtors')) {
        const debtorsStore = db.createObjectStore('debtors', { keyPath: 'id' });
        debtorsStore.createIndex('businessId', 'businessId', { unique: false });
      }
    };
  });
};

// Get database instance
const getDB = async (): Promise<IDBDatabase> => {
  return await initDB();
};

// Sales operations
export const saveOfflineSale = async (sale: OfflineSale): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales'], 'readwrite');
    const store = transaction.objectStore('sales');
    const request = store.add(sale);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getUnsyncedSales = async (businessId: string): Promise<OfflineSale[]> => {
  if (!businessId) return [];

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales'], 'readonly');
    const store = transaction.objectStore('sales');
    const request = store.getAll();

    request.onsuccess = () => {
      const sales = request.result.filter((s) => s.synced !== true && s.businessId === businessId);
      resolve(sales);
    };
    request.onerror = () => reject(request.error);
  });
};

export const markSaleAsSynced = async (saleId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales'], 'readwrite');
    const store = transaction.objectStore('sales');
    const getRequest = store.get(saleId);

    getRequest.onsuccess = () => {
      const sale = getRequest.result;
      if (sale) {
        sale.synced = true;
        const putRequest = store.put(sale);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

// Products cache
export const cacheProducts = async (products: OfflineProduct[]): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['products'], 'readwrite');
    const store = transaction.objectStore('products');
    const clearRequest = store.clear();

    clearRequest.onerror = () => reject(clearRequest.error);
    clearRequest.onsuccess = () => {
      products.forEach((product) => {
        store.put(product);
      });
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedProducts = async (businessId: string): Promise<OfflineProduct[]> => {
  if (!businessId) return [];

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['products'], 'readonly');
    const store = transaction.objectStore('products');
    const index = store.index('businessId');
    const request = index.getAll(IDBKeyRange.only(businessId));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const updateCachedProductStock = async (productId: string, newStock: number): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['products'], 'readwrite');
    const store = transaction.objectStore('products');
    const getRequest = store.get(productId);

    getRequest.onsuccess = () => {
      const product = getRequest.result;
      if (product) {
        product.stock = newStock;
        const putRequest = store.put(product);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

// Subscription cache using localStorage (simpler for critical data)
export const cacheSubscription = (data: SubscriptionCache): void => {
  localStorage.setItem('zampos_subscription', JSON.stringify({
    ...data,
    cachedAt: new Date().toISOString()
  }));
};

export const getCachedSubscription = (): (SubscriptionCache & { cachedAt: string }) | null => {
  const data = localStorage.getItem('zampos_subscription');
  if (!data) return null;
  return JSON.parse(data);
};

// Anti-tamper: Store server time reference
export const cacheServerTime = (serverTime: Date): void => {
  const localTime = new Date();
  const offset = serverTime.getTime() - localTime.getTime();
  localStorage.setItem('zampos_time_offset', offset.toString());
  localStorage.setItem('zampos_last_server_sync', serverTime.toISOString());
};

export const getAdjustedTime = (): Date => {
  const offsetStr = localStorage.getItem('zampos_time_offset');
  if (!offsetStr) return new Date();
  
  const offset = parseInt(offsetStr, 10);
  return new Date(Date.now() + offset);
};

export const getLastServerSync = (): Date | null => {
  const lastSync = localStorage.getItem('zampos_last_server_sync');
  if (!lastSync) return null;
  return new Date(lastSync);
};

// Check if offline too long (35 days max)
export const isOfflineTooLong = (maxDays: number = 35): boolean => {
  const lastSync = getLastServerSync();
  if (!lastSync) return false;
  
  const now = new Date();
  const diffDays = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > maxDays;
};

// Cart operations
interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export const saveCartItem = async (item: CartItem): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cart'], 'readwrite');
    const store = transaction.objectStore('cart');
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getCart = async (): Promise<CartItem[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cart'], 'readonly');
    const store = transaction.objectStore('cart');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const clearCart = async (): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cart'], 'readwrite');
    const store = transaction.objectStore('cart');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const removeCartItem = async (productId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cart'], 'readwrite');
    const store = transaction.objectStore('cart');
    const request = store.delete(productId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Stock update operations for offline mode
export const saveOfflineStockUpdate = async (update: OfflineStockUpdate): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['stockUpdates'], 'readwrite');
    const store = transaction.objectStore('stockUpdates');
    const request = store.add(update);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getUnsyncedStockUpdates = async (businessId: string): Promise<OfflineStockUpdate[]> => {
  if (!businessId) return [];

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['stockUpdates'], 'readonly');
    const store = transaction.objectStore('stockUpdates');
    const request = store.getAll();

    request.onsuccess = () => {
      const updates = request.result.filter((u) => u.synced !== true && u.businessId === businessId);
      resolve(updates);
    };
    request.onerror = () => reject(request.error);
  });
};

export const markStockUpdateAsSynced = async (updateId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['stockUpdates'], 'readwrite');
    const store = transaction.objectStore('stockUpdates');
    const getRequest = store.get(updateId);

    getRequest.onsuccess = () => {
      const update = getRequest.result;
      if (update) {
        update.synced = true;
        const putRequest = store.put(update);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

// Generate unique offline ID
export const generateOfflineId = (): string => {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Business cache operations
export const cacheBusiness = async (business: CachedBusiness): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['business'], 'readwrite');
    const store = transaction.objectStore('business');
    const clearRequest = store.clear();

    clearRequest.onerror = () => reject(clearRequest.error);
    clearRequest.onsuccess = () => {
      store.put(business);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedBusiness = async (): Promise<CachedBusiness | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['business'], 'readonly');
    const store = transaction.objectStore('business');
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result;
      resolve(results.length > 0 ? results[0] : null);
    };
    request.onerror = () => reject(request.error);
  });
};

// Debtors cache operations
interface CachedDebtor {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string | null;
  amountOwed: number;
  amountPaid: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

export const cacheDebtors = async (debtors: CachedDebtor[]): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['debtors'], 'readwrite');
    const store = transaction.objectStore('debtors');
    const clearRequest = store.clear();

    clearRequest.onerror = () => reject(clearRequest.error);
    clearRequest.onsuccess = () => {
      debtors.forEach((debtor) => {
        store.put(debtor);
      });
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedDebtors = async (businessId: string): Promise<CachedDebtor[]> => {
  if (!businessId) return [];

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['debtors'], 'readonly');
    const store = transaction.objectStore('debtors');
    const index = store.index('businessId');
    const request = index.getAll(IDBKeyRange.only(businessId));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const updateCachedDebtor = async (debtor: CachedDebtor): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['debtors'], 'readwrite');
    const store = transaction.objectStore('debtors');
    const request = store.put(debtor);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Initialize DB on module load to ensure stores exist
initDB().catch(console.error);
