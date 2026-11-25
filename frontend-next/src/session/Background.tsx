// What runs on every page while the app is open (the current frontend's script.js does the same):
// - log files dropped anywhere on the page are uploaded (signed-in users), and the Upload page shows them;
// - every 30 seconds, poll.json tells what became of the uploads, and whether the backend has a new version, in
//   which case the page reloads after a countdown.
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api/endpoints';
import { keys } from '../api/queries';
import type { EncounterRow } from '../api/types';
import { addFiles, forgetUploads, uploadNotified } from '../lib/uploads';
import { useToast } from '../ui/Toast';
import { useBootstrap, useSession } from './SessionProvider';

const POLL_MS = 30000;
const RESTART_SECONDS = 8;

interface CountdownProps {
  seconds: number;
}

// the seconds left, counting down
function Countdown({ seconds }: CountdownProps) {
  const [left, setLeft] = React.useState(seconds);
  React.useEffect(() => {
    const timer = window.setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{left}</>;
}

export function Background() {
  const session = useSession();
  const { version } = useBootstrap();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useToast();
  const username = session.username;

  // ---- dropping log files on the page uploads them
  React.useEffect(() => {
    const onDrag = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.effectAllowed = username ? 'copyMove' : 'none';
      event.dataTransfer.dropEffect = username ? 'copy' : 'none';
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      if (!username || !event.dataTransfer) return;
      if (addFiles(event.dataTransfer.files, username)) navigate('/uploads');
    };
    document.addEventListener('dragover', onDrag);
    document.addEventListener('dragenter', onDrag);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDrag);
      document.removeEventListener('dragenter', onDrag);
      document.removeEventListener('drop', onDrop);
    };
  }, [username, navigate]);

  // a different user (or none) has their own uploads
  React.useEffect(() => forgetUploads, [username]);

  // ---- polling for processed uploads and a new backend version
  React.useEffect(() => {
    if (!username) return;
    let lastId = session.last_notification_id;
    let timer: number | undefined;
    let stopped = false;

    const restart = () => {
      notify(<>Server was upgraded, client will restart in <Countdown seconds={RESTART_SECONDS} />s</>, 'warning', RESTART_SECONDS * 1000);
      window.setTimeout(() => window.location.reload(), RESTART_SECONDS * 1000);
    };

    const poll = () => {
      api.poll(lastId).then(data => {
        if (stopped) return;
        if (data.last_id) lastId = data.last_id;
        data.notifications.forEach(notification => {
          uploadNotified(notification);
          // a loaded encounter list stays current; one not loaded yet will include the encounter
          if (notification.type === 'upload') {
            queryClient.setQueryData<EncounterRow[]>(keys.encounters, rows => {
              if (!rows) return rows;
              const others = rows.filter(row => row.id !== notification.encounter_id);
              return notification.encounter ? [...others, notification.encounter] : others;
            });
          }
        });
        if (data.version !== version.id) {
          stopped = true;
          restart();
        }
      }, () => {
        // a failed poll is tried again at the next one
      }).finally(() => {
        if (!stopped) timer = window.setTimeout(poll, POLL_MS);
      });
    };
    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [username, session.last_notification_id, version.id, queryClient, notify]);

  return null;
}
