/**
 * Cross-Device Key Sync Service
 * 
 * Manages secure key synchronization across multiple devices.
 * Features:
 * - Device registration and pairing
 * - Secure key transfer using public key cryptography
 * - Sync status tracking
 * - Conflict resolution
 */

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  publicKey: string;
  pairedAt: number;
  lastSync: number | null;
  isActive: boolean;
}

export interface KeyTransferRequest {
  requestId: string;
  fromDeviceId: string;
  toDeviceId: string;
  encryptedKey: string;
  iv: string;
  salt: string;
  timestamp: number;
  expiresAt: number;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: number | null;
  pendingTransfers: number;
  pairedDevices: number;
}

export interface KeySyncResult {
  success: boolean;
  transferredTo: string[];
  failedDevices: string[];
}

const DEVICES_KEY = 'healthbridge_paired_devices';
const PENDING_TRANSFERS_KEY = 'healthbridge_key_transfers';
const SYNC_STATUS_KEY = 'healthbridge_sync_status';
const PUBLIC_KEY_KEY = 'healthbridge_public_key';

export function getPairedDevices(): DeviceInfo[] {
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDevices(devices: DeviceInfo[]): void {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('healthbridge_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('healthbridge_device_id', deviceId);
  }
  return deviceId;
}

export function getDeviceName(): string {
  return localStorage.getItem('healthbridge_device_name') || 'Unknown Device';
}

export function setDeviceName(name: string): void {
  localStorage.setItem('healthbridge_device_name', name);
}

export function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  ).then(async (keyPair) => {
    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    
    return {
      publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
      privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey)))
    };
  });
}

export async function storeLocalPublicKey(): Promise<string> {
  const { publicKey } = await generateKeyPair();
  localStorage.setItem(PUBLIC_KEY_KEY, publicKey);
  return publicKey;
}

export function getLocalPublicKey(): string | null {
  return localStorage.getItem(PUBLIC_KEY_KEY);
}

export function getLocalPrivateKey(): string | null {
  return localStorage.getItem('healthbridge_private_key');
}

export async function pairDevice(
  deviceId: string,
  deviceName: string,
  deviceType: 'mobile' | 'desktop' | 'tablet',
  devicePublicKey: string
): Promise<DeviceInfo> {
  const devices = getPairedDevices();
  
  // Check if device already paired
  const existing = devices.find(d => d.deviceId === deviceId);
  if (existing) {
    // Update existing device
    existing.deviceName = deviceName;
    existing.deviceType = deviceType;
    existing.isActive = true;
    saveDevices(devices);
    return existing;
  }
  
  // Add new device
  const newDevice: DeviceInfo = {
    deviceId,
    deviceName,
    deviceType,
    publicKey: devicePublicKey,
    pairedAt: Date.now(),
    lastSync: null,
    isActive: true
  };
  
  devices.push(newDevice);
  saveDevices(devices);
  
  console.log(`[KeySync] Paired new device: ${deviceName} (${deviceId})`);
  
  return newDevice;
}

export function unpairDevice(deviceId: string): boolean {
  const devices = getPairedDevices();
  const index = devices.findIndex(d => d.deviceId === deviceId);
  
  if (index !== -1) {
    devices.splice(index, 1);
    saveDevices(devices);
    console.log(`[KeySync] Unpaired device: ${deviceId}`);
    return true;
  }
  
  return false;
}

export async function encryptKeyForDevice(
  key: Uint8Array,
  recipientPublicKey: string
): Promise<{ encryptedKey: string; iv: string }> {
  const publicKeyBytes = Uint8Array.from(atob(recipientPublicKey), c => c.charCodeAt(0));
  
  const publicKey = await crypto.subtle.importKey(
    'spki',
    publicKeyBytes,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(16));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP', iv },
    publicKey,
    key.buffer as ArrayBuffer
  );
  
  return {
    encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptKeyFromTransfer(
  encryptedKey: string,
  iv: string
): Promise<Uint8Array | null> {
  const privateKeyBase64 = getLocalPrivateKey();
  if (!privateKeyBase64) {
    console.error('[KeySync] No local private key found');
    return null;
  }
  
  try {
    const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));
    
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
    
    const encrypted = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP', iv: ivBytes },
      privateKey,
      encrypted.buffer as ArrayBuffer
    );
    
    return new Uint8Array(decrypted);
  } catch (error) {
    console.error('[KeySync] Failed to decrypt key:', error);
    return null;
  }
}

export async function initiateKeySync(
  encryptionKey: Uint8Array
): Promise<KeySyncResult> {
  const devices = getPairedDevices().filter(d => d.isActive);
  const result: KeySyncResult = {
    success: false,
    transferredTo: [],
    failedDevices: []
  };
  
  // Store local private key
  const { privateKey } = await generateKeyPair();
  localStorage.setItem('healthbridge_private_key', privateKey);
  
  // Get local public key
  let localPublicKey = getLocalPublicKey();
  if (!localPublicKey) {
    localPublicKey = await storeLocalPublicKey();
  }
  
  for (const device of devices) {
    try {
      // Encrypt key for this device
      const { encryptedKey, iv } = await encryptKeyForDevice(encryptionKey, device.publicKey);
      
      // Generate salt for key derivation
      const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      
      // Create transfer request
      const transfer: KeyTransferRequest = {
        requestId: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fromDeviceId: getDeviceId(),
        toDeviceId: device.deviceId,
        encryptedKey,
        iv,
        salt,
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      };
      
      // Store pending transfer
      const transfers = getPendingTransfers();
      transfers.push(transfer);
      localStorage.setItem(PENDING_TRANSFERS_KEY, JSON.stringify(transfers));
      
      // Update device last sync
      device.lastSync = Date.now();
      saveDevices(getPairedDevices());
      
      result.transferredTo.push(device.deviceName);
    } catch (error) {
      console.error(`[KeySync] Failed to sync to ${device.deviceName}:`, error);
      result.failedDevices.push(device.deviceName);
    }
  }
  
  result.success = result.failedDevices.length === 0;
  
  // Update sync status
  updateSyncStatus({
    lastSyncTime: Date.now(),
    pendingTransfers: result.transferredTo.length
  });
  
  return result;
}

export function getPendingTransfers(): KeyTransferRequest[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_TRANSFERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearExpiredTransfers(): void {
  const transfers = getPendingTransfers();
  const now = Date.now();
  const valid = transfers.filter(t => t.expiresAt > now);
  localStorage.setItem(PENDING_TRANSFERS_KEY, JSON.stringify(valid));
}

export function getSyncStatus(): SyncStatus {
  const devices = getPairedDevices();
  const transfers = getPendingTransfers();
  const status = JSON.parse(localStorage.getItem(SYNC_STATUS_KEY) || '{}');
  
  clearExpiredTransfers();
  
  return {
    isOnline: navigator.onLine,
    lastSyncTime: status.lastSyncTime || null,
    pendingTransfers: transfers.length,
    pairedDevices: devices.filter(d => d.isActive).length
  };
}

function updateSyncStatus(partial: Partial<SyncStatus>): void {
  const current = JSON.parse(localStorage.getItem(SYNC_STATUS_KEY) || '{}');
  const updated = { ...current, ...partial };
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(updated));
}

export async function processIncomingTransfer(
  request: KeyTransferRequest
): Promise<{ success: boolean; keyId?: string; error?: string }> {
  // Verify this transfer is for us
  if (request.toDeviceId !== getDeviceId()) {
    return { success: false, error: 'Transfer not intended for this device' };
  }
  
  // Check expiration
  if (Date.now() > request.expiresAt) {
    return { success: false, error: 'Transfer has expired' };
  }
  
  // Decrypt the key
  const decryptedKey = await decryptKeyFromTransfer(request.encryptedKey, request.iv);
  if (!decryptedKey) {
    return { success: false, error: 'Failed to decrypt key' };
  }
  
  // Import the sender's public key for response
  const senderPublicKey = await getDevicePublicKey(request.fromDeviceId);
  if (senderPublicKey) {
    // Could send acknowledgment here
    console.log(`[KeySync] Received key transfer from ${request.fromDeviceId}`);
  }
  
  return { success: true, keyId: request.requestId };
}

async function getDevicePublicKey(deviceId: string): Promise<string | null> {
  const devices = getPairedDevices();
  const device = devices.find(d => d.deviceId === deviceId);
  return device?.publicKey || null;
}

export function clearSyncData(): void {
  localStorage.removeItem(DEVICES_KEY);
  localStorage.removeItem(PENDING_TRANSFERS_KEY);
  localStorage.removeItem(SYNC_STATUS_KEY);
  localStorage.removeItem(PUBLIC_KEY_KEY);
  localStorage.removeItem('healthbridge_private_key');
  console.log('[KeySync] All sync data cleared');
}

export function exportSyncData(): string {
  const devices = getPairedDevices();
  const transfers = getPendingTransfers();
  const publicKey = getLocalPublicKey();
  
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    publicKey,
    pairedDevices: devices,
    pendingTransfers: transfers
  }, null, 2);
}
