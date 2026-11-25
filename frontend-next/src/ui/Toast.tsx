// Notifications at the top of the page, as UIkit.notification showed them: they close on a click or after a while
import * as React from 'react';
import styles from './Toast.module.css';

export type ToastStatus = 'primary' | 'success' | 'warning' | 'danger';

interface Toast {
  id: number;
  message: React.ReactNode;
  status: ToastStatus;
}

type Notify = (message: React.ReactNode, status?: ToastStatus, timeout?: number) => void;

const ToastContext = React.createContext<Notify>(() => {});

export interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const close = React.useCallback((id: number) => setToasts(list => list.filter(toast => toast.id !== id)), []);

  const notify = React.useCallback<Notify>((message, status = 'primary', timeout = 5000) => {
    const id = nextId.current++;
    setToasts(list => [...list, { id, message, status }]);
    window.setTimeout(() => close(id), timeout);
  }, [close]);

  const value = React.useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.status]}`} onClick={() => close(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => React.useContext(ToastContext);
