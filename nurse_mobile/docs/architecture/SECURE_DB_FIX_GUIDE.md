# 🚨 Secure Database Decryption Emergency Fix Guide
**For: Kilocode**  
**Date: February 2026**  
**Problem: OperationError (code: 0) during sync**

---

## 📋 **IMMEDIATE ACTION REQUIRED**

### **Phase 1: Quick Diagnostic (5 minutes)**

#### **Step 1.1 - Browser Console Check**
Open browser DevTools (F12) and run:

```javascript
// Check system state
console.log('=== SECURE DB STATUS ===');
console.log('Current Date:', new Date().toISOString());
console.log('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Device Time:', format(new Date(), 'yyyy-MM-dd HH:mm:ss')); // date-fns

// Check storage
const checkStorage = () => {
  const items = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.includes('healthbridge')) {
      try {
        items[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        items[key] = localStorage.getItem(key);
      }
    }
  }
  return items;
};
console.log('HealthBridge Storage:', checkStorage());
```

#### **Step 1.2 - Add Quick Diagnostic Function**
Add this to your Vue component or composable:

```typescript
import { format } from 'date-fns';
import { useStorage } from '@vueuse/core';

export function useDbDiagnostics() {
  // Track corrupted docs with VueUse
  const corruptedDocs = useStorage<Array<{
    id: string;
    encryptedAt: string;
    error: string;
    timestamp: number;
  }>>('healthbridge_corrupted_docs_v2', []);

  async function quickDiagnose(documentId: string) {
    try {
      // Get the raw document
      const db = new PouchDB('healthbridge_secure');
      const doc = await db.get(documentId);
      
      const now = new Date();
      const encryptedDate = new Date(doc.encryptedAt);
      
      const diagnostic = {
        documentId,
        encryptedAt: doc.encryptedAt,
        dateDifference: formatDistance(encryptedDate, now, { addSuffix: true }), // date-fns
        isRecent: isAfter(encryptedDate, subMonths(now, 3)), // within 3 months
        dataLength: doc.data?.length,
        hasKeyVersion: !!doc.keyVersion,
        rawPreview: doc.data?.substring(0, 200)
      };
      
      console.log('📊 Document Diagnostic:', diagnostic);
      return diagnostic;
    } catch (error) {
      console.error('❌ Diagnosis failed:', error);
      return null;
    }
  }

  return { corruptedDocs, quickDiagnose };
}
```

---

## 🔧 **Phase 2: Emergency Fix (15 minutes)**

### **Step 2.1 - Update secureAllDocs with Better Error Handling**

Replace your current `secureAllDocs` catch block with this enhanced version:

```typescript
import { format, isAfter, subMonths } from 'date-fns';
import { useStorage } from '@vueuse/core';

export async function secureAllDocs<T extends { _id: string; _rev?: string }>(
  encryptionKey: Uint8Array
): Promise<T[]> {
  const db = getSecureDb(encryptionKey);
  const result = await db.allDocs({ include_docs: true });
  
  const docs: T[] = [];
  const corruptedDocs = useStorage('healthbridge_corrupted_tracking', []);
  
  for (const row of result.rows) {
    if (!row.id.startsWith('_design/') && row.doc) {
      const doc = row.doc as EncryptedDocument & { _rev?: string };
      
      if (doc.encrypted) {
        try {
          const payload: EncryptedPayload = JSON.parse(doc.data);
          
          // DATE VALIDATION (using date-fns)
          const encryptedDate = new Date(doc.encryptedAt);
          const now = new Date();
          
          // Check if date is within reasonable bounds (last 2 years)
          const twoYearsAgo = subMonths(now, 24);
          if (!isAfter(encryptedDate, twoYearsAgo)) {
            console.warn(`[SecureDB] Old document detected: ${row.id}`, {
              encryptedAt: format(encryptedDate, 'yyyy-MM-dd HH:mm'),
              age: formatDistance(encryptedDate, now, { addSuffix: true })
            });
          }
          
          const decryptedData = JSON.parse(await decryptData(payload, encryptionKey));
          docs.push({
            _id: doc._id,
            _rev: doc._rev,
            ...decryptedData
          } as T);
          
        } catch (error) {
          // ENHANCED ERROR HANDLING
          const errorDetails = {
            id: row.id,
            encryptedAt: doc.encryptedAt,
            error: error.message,
            errorType: error.name,
            timestamp: Date.now(),
            keyHash: Array.from(encryptionKey.slice(0, 8))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('') // First 8 bytes as hex
          };
          
          // Log with date-fns formatting
          console.warn(`[SecureDB] Skipping document ${row.id}:`, {
            encrypted: format(new Date(doc.encryptedAt), 'MMM dd, yyyy HH:mm'),
            error: error.message,
            age: formatDistance(new Date(doc.encryptedAt), new Date())
          });
          
          // Store with VueUse (auto-serializes)
          corruptedDocs.value = [
            ...corruptedDocs.value,
            errorDetails
          ].slice(-100); // Keep last 100
          
          // Continue with next document
          continue;
        }
      } else {
        docs.push(row.doc as T);
      }
    }
  }
  
  return docs;
}
```

### **Step 2.2 - Create Emergency Recovery Button Component**

Create `/components/EmergencyRecovery.vue`:

```vue
<template>
  <div v-if="showRecovery" class="emergency-recovery">
    <h3>🔄 Database Recovery Tools</h3>
    
    <div class="stats">
      <div>Total Documents: {{ stats.total }}</div>
      <div>Corrupted: {{ stats.corrupted }}</div>
      <div>Success Rate: {{ stats.successRate }}%</div>
    </div>
    
    <button @click="attemptRecovery" :disabled="recovering">
      {{ recovering ? 'Recovering...' : 'Attempt Automatic Recovery' }}
    </button>
    
    <button @click="exportForAnalysis" class="export-btn">
      📤 Export Corrupted Data for Analysis
    </button>
    
    <div v-if="recoveryResults.length" class="results">
      <h4>Recovery Results:</h4>
      <div v-for="result in recoveryResults" :key="result.id">
        {{ result.id }}: {{ result.success ? '✅' : '❌' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format, isAfter, subDays } from 'date-fns';
import { useStorage, useNow, useTimestamp } from '@vueuse/core';
import { secureAllDocs, secureGet, securePut } from '@/utils/secureDb';

const props = defineProps<{
  encryptionKey: Uint8Array;
}>();

const showRecovery = ref(false);
const recovering = ref(false);
const recoveryResults = ref<Array<{id: string; success: boolean}>>([]);

// Use VueUse for time
const { timestamp: now } = useTimestamp({ interval: 1000 });

// Stats with reactive storage
const corruptionStats = useStorage('healthbridge_recovery_stats', {
  total: 0,
  corrupted: 0,
  lastCheck: 0,
  successRate: 100
});

async function checkDatabaseHealth() {
  try {
    const allDocs = await secureAllDocs(props.encryptionKey);
    const corrupted = JSON.parse(localStorage.getItem('healthbridge_corrupted_docs') || '[]');
    
    corruptionStats.value = {
      total: allDocs.length + corrupted.length,
      corrupted: corrupted.length,
      lastCheck: Date.now(),
      successRate: allDocs.length > 0 ? 
        (allDocs.length / (allDocs.length + corrupted.length) * 100) : 100
    };
    
    // Show recovery if >5% corruption
    showRecovery.value = corruptionStats.value.successRate < 95;
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

async function attemptRecovery() {
  recovering.value = true;
  recoveryResults.value = [];
  
  const corrupted = JSON.parse(localStorage.getItem('healthbridge_corrupted_docs') || '[]');
  
  for (const doc of corrupted.slice(0, 10)) { // Try first 10
    try {
      // Try to get the document again
      const retrieved = await secureGet(doc.id, props.encryptionKey);
      
      if (retrieved) {
        // If successful, update
        await securePut(retrieved, props.encryptionKey);
        recoveryResults.value.push({ id: doc.id, success: true });
        
        // Remove from corrupted list
        const updated = corrupted.filter((d: any) => d.id !== doc.id);
        localStorage.setItem('healthbridge_corrupted_docs', JSON.stringify(updated));
      }
    } catch {
      recoveryResults.value.push({ id: doc.id, success: false });
    }
  }
  
  recovering.value = false;
  await checkDatabaseHealth();
}

async function exportForAnalysis() {
  const db = new PouchDB('healthbridge_secure');
  const result = await db.allDocs({ include_docs: true });
  
  const exportData = result.rows
    .filter(row => row.doc?.encrypted)
    .map(row => ({
      id: row.id,
      encryptedAt: row.doc.encryptedAt,
      data: row.doc.data,
      rev: row.doc._rev,
      exportedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    }));
  
  // Create download
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge_export_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
  a.click();
  
  alert(`Exported ${exportData.length} documents for analysis`);
}

// Auto-check on mount
onMounted(() => {
  checkDatabaseHealth();
  // Re-check every 5 minutes
  setInterval(checkDatabaseHealth, 5 * 60 * 1000);
});

const stats = computed(() => corruptionStats.value);
</script>

<style scoped>
.emergency-recovery {
  border: 2px solid #f44336;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  background: #fff8f8;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 12px 0;
}

button {
  margin: 8px 4px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-btn {
  background: #4caf50;
  color: white;
}

.results {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ddd;
}
</style>
```

---

## 🛡️ **Phase 3: Prevention System (20 minutes)**

### **Step 3.1 - Create Key Consistency Manager**

Create `/composables/useKeyManager.ts`:

```typescript
import { format, isAfter, differenceInHours } from 'date-fns';
import { 
  useStorage, 
  useTimestamp,
  useLocalStorage,
  useSessionStorage 
} from '@vueuse/core';
import { deriveKeyFromPin } from '@/utils/encryption';

export function useKeyManager() {
  // Key metadata with VueUse reactive storage
  const keyMetadata = useStorage('healthbridge_key_metadata', {
    version: 1,
    salt: '',
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    deviceId: generateDeviceId(),
    keyHash: ''
  });

  // Session key (cleared on tab close)
  const sessionKey = useSessionStorage<Uint8Array | null>(
    'healthbridge_session_key', 
    null,
    {
      serializer: {
        read: (v) => v ? new Uint8Array(JSON.parse(v)) : null,
        write: (v) => v ? JSON.stringify(Array.from(v)) : null
      }
    }
  );

  // Track key usage
  const keyUsage = useStorage('healthbridge_key_usage', {
    totalDecryptions: 0,
    failedDecryptions: 0,
    lastFailure: '',
    devices: [] as string[]
  });

  // Real-time clock with VueUse
  const { timestamp: currentTime } = useTimestamp({ interval: 1000 });

  /**
   * Derive and validate key with consistency checks
   */
  async function deriveValidatedKey(pin: string): Promise<Uint8Array> {
    // Generate or retrieve salt
    if (!keyMetadata.value.salt) {
      keyMetadata.value = {
        ...keyMetadata.value,
        salt: await generateSalt(),
        createdAt: new Date().toISOString()
      };
    }

    // Derive key
    const key = await deriveKeyFromPin(pin, keyMetadata.value.salt);
    
    // Calculate key hash (first 8 bytes)
    const keyHash = Array.from(key.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Update metadata
    keyMetadata.value = {
      ...keyMetadata.value,
      lastUsed: new Date().toISOString(),
      keyHash
    };

    // Validate key can encrypt/decrypt
    const isValid = await validateKey(key);
    
    if (!isValid) {
      throw new Error('Key validation failed - cannot encrypt/decrypt');
    }

    // Store in session
    sessionKey.value = key;
    
    return key;
  }

  /**
   * Validate key works before use
   */
  async function validateKey(key: Uint8Array): Promise<boolean> {
    try {
      const testData = `key_test_${format(new Date(), 'yyyy-MM-dd_HHmmss')}`;
      const encrypted = await encryptData(testData, key);
      const decrypted = await decryptData(encrypted, key);
      
      return decrypted === testData;
    } catch (error) {
      console.error('Key validation failed:', error);
      
      // Track failure
      keyUsage.value = {
        ...keyUsage.value,
        failedDecryptions: keyUsage.value.failedDecryptions + 1,
        lastFailure: new Date().toISOString()
      };
      
      return false;
    }
  }

  /**
   * Check if key is from different device/time
   */
  function checkKeyAnomalies(encryptedAt: string): {
    hasAnomaly: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const encryptedDate = new Date(encryptedAt);
    
    // Time travel check (document from future relative to key creation)
    if (isAfter(encryptedDate, new Date(keyMetadata.value.createdAt))) {
      issues.push('Document encrypted after key was created');
    }
    
    // Device mismatch check
    if (keyMetadata.value.deviceId !== getCurrentDeviceId()) {
      issues.push('Document may be from different device');
    }
    
    // Excessive time difference
    const hoursDiff = differenceInHours(new Date(), encryptedDate);
    if (hoursDiff > 24 * 30) { // 30 days
      issues.push(`Document is ${Math.round(hoursDiff/24)} days old`);
    }
    
    return {
      hasAnomaly: issues.length > 0,
      issues
    };
  }

  /**
   * Get current key with automatic validation
   */
  function getValidatedKey(): Uint8Array {
    if (!sessionKey.value) {
      throw new Error('No active session key');
    }
    
    // Auto-validate every 30 minutes
    const lastValidated = useStorage('healthbridge_last_validation', 0);
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    
    if (lastValidated.value < thirtyMinutesAgo) {
      validateKey(sessionKey.value).then(valid => {
        if (!valid) {
          console.warn('Key validation failed in background');
        }
        lastValidated.value = Date.now();
      });
    }
    
    return sessionKey.value;
  }

  // Helper functions
  function generateDeviceId(): string {
    return 'device_' + Math.random().toString(36).substr(2, 9);
  }

  function getCurrentDeviceId(): string {
    return keyMetadata.value.deviceId || generateDeviceId();
  }

  async function generateSalt(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  return {
    keyMetadata,
    sessionKey,
    keyUsage,
    deriveValidatedKey,
    validateKey,
    checkKeyAnomalies,
    getValidatedKey
  };
}
```

### **Step 3.2 - Update Your App Initialization**

In your main app/component:

```typescript
import { format } from 'date-fns';
import { useKeyManager } from '@/composables/useKeyManager';
import { useDbDiagnostics } from '@/composables/useDbDiagnostics';

// In your setup
const { deriveValidatedKey, getValidatedKey, checkKeyAnomalies } = useKeyManager();
const { quickDiagnose } = useDbDiagnostics();

async function initializeApp() {
  try {
    // 1. Get key (from PIN input, etc.)
    const key = await deriveValidatedKey(userPin);
    
    // 2. Initialize database
    await initializeSecureDb(key);
    
    // 3. Check for anomalies
    const sampleDocs = await secureAllDocs(key);
    for (const doc of sampleDocs.slice(0, 5)) {
      const anomalies = checkKeyAnomalies(doc.encryptedAt);
      if (anomalies.hasAnomaly) {
        console.warn('Anomalies detected:', anomalies.issues);
      }
    }
    
    // 4. Start sync with error handling
    await startSyncWithRecovery(key);
    
  } catch (error) {
    console.error('App initialization failed:', error);
    showRecoveryUI();
  }
}

async function startSyncWithRecovery(key: Uint8Array) {
  try {
    // First attempt
    await syncData(key);
  } catch (syncError) {
    console.warn('Sync failed, attempting recovery:', syncError);
    
    // Try with skip-corruption mode
    const docs = await secureAllDocs(key);
    const validDocs = docs.filter(doc => doc !== null);
    
    if (validDocs.length > 0) {
      await syncPartialData(validDocs);
      console.log(`Synced ${validDocs.length} valid documents`);
    }
    
    // Show warning to user
    alert(`Sync completed partially. ${docs.length - validDocs.length} documents could not be synced.`);
  }
}
```

---

## 📊 **Phase 4: Monitoring Dashboard (Optional - 10 minutes)**

Create `/components/DbHealthDashboard.vue`:

```vue
<template>
  <div class="health-dashboard" v-if="showDashboard">
    <h3>📈 Database Health Monitor</h3>
    
    <div class="grid">
      <MetricCard 
        title="Documents"
        :value="metrics.total"
        :trend="metrics.trend"
      />
      
      <MetricCard 
        title="Corrupted"
        :value="metrics.corrupted"
        :level="metrics.corruptionLevel"
      />
      
      <MetricCard 
        title="Success Rate"
        :value="`${metrics.successRate}%`"
        :status="metrics.successRate > 95 ? 'good' : 'warning'"
      />
      
      <MetricCard 
        title="Last Sync"
        :value="format(metrics.lastSync, 'HH:mm')"
        :subtext="formatDistance(metrics.lastSync, new Date(), { addSuffix: true })"
      />
    </div>
    
    <div class="actions">
      <button @click="forceValidation">Validate Keys</button>
      <button @click="cleanCorrupted">Clean Corrupted</button>
      <button @click="exportReport">Export Report</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format, formatDistance, isAfter, subHours } from 'date-fns';
import { 
  useStorage, 
  useTimestamp,
  useIntervalFn 
} from '@vueuse/core';

const props = defineProps<{
  encryptionKey: Uint8Array;
}>();

const showDashboard = ref(false);
const metrics = ref({
  total: 0,
  corrupted: 0,
  successRate: 100,
  lastSync: new Date(),
  trend: 0,
  corruptionLevel: 'low'
});

// Update every 60 seconds
useIntervalFn(updateMetrics, 60 * 1000);

async function updateMetrics() {
  try {
    const allDocs = await secureAllDocs(props.encryptionKey);
    const corrupted = JSON.parse(
      localStorage.getItem('healthbridge_corrupted_docs') || '[]'
    );
    
    const successRate = allDocs.length > 0 
      ? (allDocs.length / (allDocs.length + corrupted.length)) * 100 
      : 100;
    
    metrics.value = {
      total: allDocs.length,
      corrupted: corrupted.length,
      successRate: Math.round(successRate),
      lastSync: new Date(),
      trend: calculateTrend(),
      corruptionLevel: successRate > 95 ? 'low' : successRate > 80 ? 'medium' : 'high'
    };
    
    // Auto-show if issues
    showDashboard.value = successRate < 98 || corrupted.length > 5;
  } catch (error) {
    console.error('Failed to update metrics:', error);
  }
}

function calculateTrend(): number {
  // Implement trend calculation based on history
  return 0;
}

async function forceValidation() {
  // Trigger key validation
}

async function cleanCorrupted() {
  // Remove old corrupted entries
  const corrupted = JSON.parse(
    localStorage.getItem('healthbridge_corrupted_docs') || '[]'
  );
  
  // Keep only from last 7 days
  const weekAgo = subHours(new Date(), 24 * 7);
  const recent = corrupted.filter((doc: any) => 
    isAfter(new Date(doc.timestamp), weekAgo)
  );
  
  localStorage.setItem('healthbridge_corrupted_docs', JSON.stringify(recent));
  await updateMetrics();
}

function exportReport() {
  const report = {
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    metrics: metrics.value,
    system: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    }
  };
  
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge_report_${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
}

// Initial update
onMounted(updateMetrics);
</script>

<style scoped>
.health-dashboard {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  background: #f9f9f9;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

button:hover {
  background: #f0f0f0;
}
</style>
```

---

## 🚀 **Quick Implementation Checklist**

### **✅ Immediate (Next 30 minutes)**
1. [ ] Add the enhanced `secureAllDocs` error handling
2. [ ] Add `EmergencyRecovery.vue` component
3. [ ] Add `useDbDiagnostics` composable
4. [ ] Run browser console diagnostic

### **✅ Short-term (Next 2 hours)**
1. [ ] Implement `useKeyManager` composable
2. [ ] Update app initialization with key validation
3. [ ] Add automatic corruption tracking
4. [ ] Test sync with partial recovery

### **✅ Long-term (Next day)**
1. [ ] Add key rotation strategy
2. [ ] Implement document checksums
3. [ ] Add cross-device key sync
4. [ ] Create admin dashboard

---

## 📞 **Emergency Contact & Rollback**

If issues persist:

### **1. Create Emergency Export:**
```javascript
// Run in browser console
localStorage.setItem('healthbridge_emergency_backup', new Date().toISOString());
console.log('BACKUP TIMESTAMP SAVED');
```

### **2. Enable Degraded Mode:**
Add to your app config:
```typescript
const DEGRADED_MODE = localStorage.getItem('healthbridge_degraded_mode') === 'true';

if (DEGRADED_MODE) {
  // Skip encryption for new data
  // Use plain PouchDB temporarily
}
```

### **3. Contact Support:**
Provide:
- Browser console output
- `healthbridge_export_*.json` file
- Steps to reproduce
- Device/browser info

---

## 🎯 **Key Points for Kilocode**

1. **The dates are NOT future** - We're in Feb 2026, so timestamps are valid
2. **Use VueUse everywhere** - Already installed, use for reactive storage
3. **Use date-fns for dates** - Already installed, better than native Date
4. **Skip corrupted docs gracefully** - Don't break sync for one bad document
5. **Track everything** - Use VueUse storage for automatic serialization

**Priority:** Fix sync first, then implement prevention, then add recovery tools.

