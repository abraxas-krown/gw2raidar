// The upload queue (the Upload page's list): files are uploaded one at a time; once uploaded, the backend
// analyses them, and poll.json says when each is done (see session/Background.tsx)
import { api } from '../api/endpoints';
import type { Notification } from '../api/types';
import { createStore, useStore } from './store';

export interface UploadEntry {
  name: string;
  uploadedBy: string;
  file?: File;
  // 0-100 while uploading; 100 once the backend has it (it is then analysed)
  progress?: number;
  uploadId?: number;
  // true once analysed, false on an error
  success?: boolean;
  error?: string;
  encounterUrlId?: string;
}

interface UploadState {
  entries: UploadEntry[];
  // what new uploads are given
  category: string;
  tags: string;
}

export const uploadStore = createStore<UploadState>({ entries: [], category: '', tags: '' });
export const useUploads = () => useStore(uploadStore);

const LOG_FILE = /\.(evtc|evtc\.zip|zevtc)$/;

let uploading = false;

function update(name: string, change: Partial<UploadEntry>) {
  uploadStore.set(state => ({
    ...state,
    entries: state.entries.map(entry => (entry.name === name ? { ...entry, ...change } : entry)),
  }));
}

// the next queued file, uploaded (with progress), then the one after it
function startNext() {
  if (uploading) return;
  const entry = uploadStore.get().entries.find(e => e.file && e.progress === undefined);
  if (!entry || !entry.file) return;
  uploading = true;
  const { category, tags } = uploadStore.get();
  const form = new FormData();
  form.set('file', entry.file);
  if (category) form.set('category', category);
  if (tags) form.set('tags', tags);
  update(entry.name, { progress: 0 });
  api.upload(form, event => update(entry.name, { progress: Math.round((100 * event.loaded) / event.total) }))
    .then(
      response => update(entry.name, { file: undefined, progress: 100, uploadId: response.upload_id }),
      error => update(entry.name, { file: undefined, success: false, error: error.message }),
    )
    .finally(() => {
      uploading = false;
      startNext();
    });
}

// Queues the log files among `files` (others are ignored); a file of the same name is uploaded again
export function addFiles(files: Iterable<File>, uploadedBy: string): number {
  const logs = Array.from(files).filter(file => LOG_FILE.test(file.name));
  if (!logs.length) return 0;
  uploadStore.set(state => {
    let entries = state.entries;
    for (const file of logs) {
      const entry: UploadEntry = { name: file.name, uploadedBy, file };
      entries = entries.some(e => e.name === file.name)
        ? entries.map(e => (e.name === file.name ? entry : e))
        : [...entries, entry];
    }
    return { ...state, entries };
  });
  startNext();
  return logs.length;
}

// What poll.json reported about an upload
export function uploadNotified(notification: Notification) {
  if (notification.type === 'upload') {
    const done: UploadEntry = {
      name: notification.filename,
      uploadedBy: notification.uploaded_by,
      progress: 100,
      uploadId: notification.upload_id,
      success: true,
      encounterUrlId: notification.encounter_url_id,
    };
    uploadStore.set(state => ({
      ...state,
      entries: state.entries.some(e => e.name === notification.filename)
        ? state.entries.map(e => (e.name === notification.filename ? { ...e, ...done } : e))
        : [...state.entries, done],
    }));
  } else if (notification.type === 'upload_error') {
    uploadStore.set(state => ({
      ...state,
      entries: state.entries.map(e =>
        e.uploadId === notification.upload_id ? { ...e, success: false, error: notification.error } : e),
    }));
  }
}

export const forgetUploads = () => uploadStore.set(state => ({ ...state, entries: [] }));
