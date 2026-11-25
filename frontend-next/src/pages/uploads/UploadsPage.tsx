// The Upload page (frontend/src/partials/uploads.html): the category and tags new uploads get, the uploads of
// this visit and their state, and a file input (dropping files anywhere on the site works too)
import * as React from 'react';
import { useNavigate } from 'react-router';
import { addFiles, uploadStore, useUploads, type UploadEntry } from '../../lib/uploads';
import { useBootstrap, useSession } from '../../session/SessionProvider';
import { cx, Select } from '../../ui/controls';
import { TagsInput } from '../../ui/TagsInput';
import styles from './Uploads.module.css';

interface StatusProps {
  entry: UploadEntry;
}

function Status({ entry }: StatusProps) {
  if (entry.success) return <>Success</>;
  if (entry.success === false) return <>{entry.error || 'Error'}</>;
  if (entry.progress !== undefined) {
    return entry.progress < 100
      ? <>Uploading {entry.progress}% (Don't leave this page)</>
      : <>Analysing (This will finish even if you leave the website)</>;
  }
  return <>Queued</>;
}

export function UploadsPage() {
  const { entries, category, tags } = useUploads();
  const bootstrap = useBootstrap();
  const session = useSession();
  const navigate = useNavigate();

  const onFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files, session.username);
    event.target.value = '';
  };

  return (
    <>
      <div className={styles.options}>
        <Select
          className={styles.category}
          value={category}
          onChange={e => uploadStore.set({ category: e.target.value })}
          aria-label="Category"
        >
          <option value="">No category</option>
          {Object.entries(bootstrap.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <TagsInput className={styles.tags} value={tags} onChange={value => uploadStore.set({ tags: value })} placeholder="Tags" />
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.quarter}>File</th>
            <th className={styles.quarter}>Uploader</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr
              key={entry.name}
              className={cx(entry.success && entry.encounterUrlId && styles.link)}
              onClick={entry.success && entry.encounterUrlId ? () => navigate(`/encounter/${entry.encounterUrlId}`) : undefined}
            >
              <td className={cx(entry.success === true && 'text-success', entry.success === false && 'text-danger')}>{entry.name}</td>
              <td>{entry.uploadedBy}</td>
              <td><Status entry={entry} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        <input className={styles.file} type="file" accept=".evtc,.zip,.zevtc" multiple onChange={onFiles} aria-label="Log files to upload" />
      </p>
      <p>
        To upload: Drag and drop <code>.zevtc</code>, <code>.evtc</code> or <code>.evtc.zip</code> anywhere into GW2
        Raidar, or use the file upload form.
      </p>
      <p>
        Processing may take a few minutes, however once a log is in a status of "Analysing", it will be processed even
        if you leave the website.
      </p>
      <p className={styles.warning}>
        <strong>Note that refreshing or closing the page will cancel any pending uploads.</strong>
      </p>
    </>
  );
}
