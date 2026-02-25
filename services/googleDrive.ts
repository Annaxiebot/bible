/**
 * googleDrive.ts
 * 
 * Google Drive API client for Scripture Scholar data sync.
 * Uses Google Identity Services (GIS) and Google API Client Library (GAPI).
 * 
 * Features:
 * - OAuth 2.0 authentication
 * - Folder management (Scripture Scholar/)
 * - JSON file operations (notes, bookmarks, etc.)
 * - Binary file operations (photos)
 * - Offline capability (graceful degradation)
 */

import { FileMetadata } from './types';

// OAuth 2.0 configuration
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// App folder name
const APP_FOLDER_NAME = 'Scripture Scholar';

// File names
export const DRIVE_FILES = {
  NOTES: 'notes.json',
  BOOKMARKS: 'bookmarks.json',
  ANNOTATIONS: 'annotations.json',
  SETTINGS: 'settings.json',
  READING_HISTORY: 'reading-history.json',
  READING_PLANS: 'reading-plans.json',
  VERSE_DATA: 'verse-data.json',
  LAST_SYNC: '.last-sync.json',
} as const;

// Folder names
const PHOTOS_FOLDER = 'photos';
const BIBLE_CACHE_FOLDER = 'bible-cache';

// State
interface DriveState {
  isInitialized: boolean;
  isSignedIn: boolean;
  accessToken: string | null;
  folderId: string | null;
  userEmail: string | null;
  lastError: string | null;
}

class GoogleDriveService {
  private state: DriveState = {
    isInitialized: false,
    isSignedIn: false,
    accessToken: null,
    folderId: null,
    userEmail: null,
    lastError: null,
  };

  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private gapiInited = false;
  private gisInited = false;
  private subscribers: Array<(state: DriveState) => void> = [];

  // =====================================================
  // INITIALIZATION
  // =====================================================

  /**
   * Initialize Google API and Identity Services.
   * Call this once on app startup.
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) return;

    if (!CLIENT_ID) {
      return;
    }

    try {
      await this.loadGapi();
      await this.loadGis();

      this.state.isInitialized = true;
      this.notifySubscribers();
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : 'Initialization failed';
      this.notifySubscribers();
    }
  }

  private async loadGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof gapi !== 'undefined' && gapi.client) {
        this.gapiInited = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });
            this.gapiInited = true;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(script);
    });
  }

  private async loadGis(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts) {
        this.gisInited = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: '', // Will be set during signIn
        });
        this.gisInited = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  /**
   * Sign in with Google OAuth.
   * Opens popup for user consent.
   */
  async signIn(): Promise<void> {
    if (!this.state.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient.callback = async (response: google.accounts.oauth2.TokenResponse) => {
          if (response.error !== undefined) {
            this.state.lastError = response.error;
            this.notifySubscribers();
            reject(new Error(response.error));
            return;
          }

          this.state.accessToken = response.access_token;
          gapi.client.setToken({ access_token: response.access_token });
          this.state.isSignedIn = true;
          this.state.lastError = null;

          try {
            const userInfo = await this.getUserInfo();
            this.state.userEmail = userInfo.email;
          } catch {
            // Non-fatal: email is optional
          }

          try {
            this.state.folderId = await this.ensureAppFolder();
          } catch (error) {
            this.notifyError(error instanceof Error ? error.message : 'Failed to create app folder');
          }

          this.notifySubscribers();
          resolve();
        };

        // Request access token
        if (gapi.client.getToken() === null) {
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          this.tokenClient.requestAccessToken({ prompt: '' });
        }
      } catch (error) {
        this.state.lastError = error instanceof Error ? error.message : 'Sign in failed';
        this.notifySubscribers();
        reject(error);
      }
    });
  }

  /**
   * Sign out and revoke access.
   */
  async signOut(): Promise<void> {
    const token = gapi.client.getToken();
    if (token !== null) {
      google.accounts.oauth2.revoke(token.access_token, () => {});
      gapi.client.setToken(null);
    }

    this.state.isSignedIn = false;
    this.state.accessToken = null;
    this.state.folderId = null;
    this.state.userEmail = null;
    this.notifySubscribers();
  }

  /**
   * Check if user is signed in.
   */
  isSignedIn(): boolean {
    return this.state.isSignedIn && this.state.accessToken !== null;
  }

  /**
   * Get current user email.
   */
  getUserEmail(): string | null {
    return this.state.userEmail;
  }

  /**
   * Get user info from Google.
   */
  private async getUserInfo(): Promise<{ email: string; name: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${this.state.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  // =====================================================
  // FOLDER MANAGEMENT
  // =====================================================

  /**
   * Ensure the app folder exists. Creates it if needed.
   * Returns the folder ID.
   */
  private async ensureAppFolder(): Promise<string> {
    if (this.state.folderId) {
      return this.state.folderId;
    }

    // Search for existing folder
    const response = await gapi.client.drive.files.list({
      q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      this.state.folderId = files[0].id;
      return files[0].id;
    }

    // Create new folder
    const createResponse = await gapi.client.drive.files.create({
      resource: {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    this.state.folderId = createResponse.result.id;
    return createResponse.result.id;
  }

  /**
   * Ensure a subfolder exists within the app folder.
   */
  private async ensureSubfolder(name: string): Promise<string> {
    const parentId = await this.ensureAppFolder();

    // Search for existing subfolder
    const response = await gapi.client.drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      return files[0].id;
    }

    // Create new subfolder
    const createResponse = await gapi.client.drive.files.create({
      resource: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });

    return createResponse.result.id;
  }

  // =====================================================
  // JSON FILE OPERATIONS
  // =====================================================

  /**
   * Read a JSON file from Drive.
   * Returns null if file doesn't exist.
   */
  async readFile<T = unknown>(filename: string): Promise<T | null> {
    const folderId = await this.ensureAppFolder();

    // Find file
    const response = await gapi.client.drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.result.files;
    if (!files || files.length === 0) {
      return null; // File doesn't exist
    }

    // Download file content
    const fileId = files[0].id;
    const downloadResponse = await gapi.client.drive.files.get({
      fileId,
      alt: 'media',
    });

    return JSON.parse(downloadResponse.body);
  }

  /**
   * Write a JSON file to Drive.
   * Creates new file or updates existing file.
   * Uses apiFetch for automatic 401 retry and notifies on error.
   */
  async writeFile<T = unknown>(filename: string, data: T): Promise<void> {
    try {
      const folderId = await this.ensureAppFolder();

      const listResponse = await gapi.client.drive.files.list({
        q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      const files = listResponse.result.files;
      const content = JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: 'application/json' });

      if (files && files.length > 0) {
        await this.updateExistingFile(files[0].id, blob);
      } else {
        await this.createNewFile(filename, folderId, blob);
      }

      this.state.lastError = null;
      this.notifySubscribers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file';
      this.notifyError(message);
      throw error;
    }
  }

  private async updateExistingFile(fileId: string, blob: Blob): Promise<void> {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({})], { type: 'application/json' }));
    form.append('file', blob);

    const response = await this.apiFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${this.state.accessToken}` },
        body: form,
      }
    );

    if (!response.ok) {
      throw new Error(`Drive update failed: ${response.status} ${response.statusText}`);
    }
  }

  private async createNewFile(filename: string, folderId: string, blob: Blob): Promise<void> {
    const metadata = JSON.stringify({
      name: filename,
      mimeType: 'application/json',
      parents: [folderId],
    });
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);

    const response = await this.apiFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.state.accessToken}` },
        body: form,
      }
    );

    if (!response.ok) {
      throw new Error(`Drive create failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Delete a file from Drive.
   */
  async deleteFile(filename: string): Promise<void> {
    const folderId = await this.ensureAppFolder();

    // Find file
    const response = await gapi.client.drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      await gapi.client.drive.files.delete({
        fileId: files[0].id,
      });
    }
  }

  /**
   * List all files in the app folder.
   */
  async listFiles(): Promise<FileMetadata[]> {
    const folderId = await this.ensureAppFolder();

    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      spaces: 'drive',
    });

    return (response.result.files || []).map((file: gapi.client.drive.File) => ({
      id: file.id || '',
      name: file.name || '',
      mimeType: file.mimeType || '',
      modifiedTime: file.modifiedTime || '',
      size: parseInt(file.size || '0', 10),
    }));
  }

  // =====================================================
  // PHOTO OPERATIONS
  // =====================================================

  /**
   * Upload a photo to the photos/ folder.
   */
  async uploadPhoto(blob: Blob, filename: string): Promise<void> {
    const photosFolderId = await this.ensureSubfolder(PHOTOS_FOLDER);

    const metadata = JSON.stringify({
      name: filename,
      mimeType: blob.type,
      parents: [photosFolderId],
    });
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);

    const response = await this.apiFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.state.accessToken}` },
        body: form,
      }
    );

    if (!response.ok) {
      throw new Error(`Photo upload failed: ${response.status}`);
    }
  }

  /**
   * Download a photo from the photos/ folder.
   */
  async downloadPhoto(filename: string): Promise<Blob> {
    const photosFolderId = await this.ensureSubfolder(PHOTOS_FOLDER);

    const listResponse = await gapi.client.drive.files.list({
      q: `name='${filename}' and '${photosFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });

    const files = listResponse.result.files;
    if (!files || files.length === 0) {
      throw new Error(`Photo not found: ${filename}`);
    }

    const fileId = files[0].id;
    const downloadResponse = await this.apiFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${this.state.accessToken}` },
      }
    );

    if (!downloadResponse.ok) {
      throw new Error(`Photo download failed: ${downloadResponse.status}`);
    }

    return downloadResponse.blob();
  }

  /**
   * List all photos in the photos/ folder.
   */
  async listPhotos(): Promise<string[]> {
    const photosFolderId = await this.ensureSubfolder(PHOTOS_FOLDER);

    const response = await gapi.client.drive.files.list({
      q: `'${photosFolderId}' in parents and trashed=false`,
      fields: 'files(name)',
      spaces: 'drive',
    });

    return (response.result.files || []).map((file: gapi.client.drive.File) => file.name || '');
  }

  // =====================================================
  // SYNC METADATA
  // =====================================================

  /**
   * Get last sync time from Drive.
   */
  async getLastSyncTime(): Promise<number | null> {
    try {
      const data = await this.readFile(DRIVE_FILES.LAST_SYNC);
      return data?.timestamp || null;
    } catch {
      return null;
    }
  }

  /**
   * Set last sync time in Drive.
   */
  async setLastSyncTime(timestamp: number): Promise<void> {
    await this.writeFile(DRIVE_FILES.LAST_SYNC, { timestamp });
  }

  // =====================================================
  // STATE SUBSCRIPTION
  // =====================================================

  /**
   * Subscribe to state changes.
   */
  subscribe(callback: (state: DriveState) => void): () => void {
    this.subscribers.push(callback);
    callback(this.state); // Call immediately with current state
    
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }

  /**
   * Set lastError in state and notify subscribers.
   */
  private notifyError(message: string): void {
    this.state.lastError = message;
    this.notifySubscribers();
  }

  /**
   * Fetch wrapper that handles 401/403 by re-authenticating and retrying once.
   */
  private async apiFetch(url: string, options: RequestInit): Promise<Response> {
    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
      await this.signIn();

      const retryOptions: RequestInit = {
        ...options,
        headers: {
          ...(options.headers as Record<string, string>),
          Authorization: `Bearer ${this.state.accessToken}`,
        },
      };
      return fetch(url, retryOptions);
    }

    return response;
  }

  /**
   * Get current state.
   */
  getState(): DriveState {
    return { ...this.state };
  }
}

// Singleton instance
export const googleDrive = new GoogleDriveService();

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  googleDrive.initialize().catch(() => {});
}
