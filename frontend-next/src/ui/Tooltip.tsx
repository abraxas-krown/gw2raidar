// Tooltips, as UIkit's uk-tooltip: one floating box for the page, placed next to whatever the pointer is on.
// They work on any element, SVG shapes included, through the handlers tooltip() returns:
//
//   const tooltip = useTooltip();
//   <rect {...tooltip(<><h5>Boss DPS</h5>…</>, { pos: 'bottom-left', delay: 350 })} />
import * as React from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export type TooltipPos = 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-center' | 'top-left';

export interface TooltipOptions {
  pos?: TooltipPos;
  delay?: number;
}

interface Shown {
  content: React.ReactNode;
  target: DOMRect;
  pos: TooltipPos;
}

interface TooltipApi {
  show(content: React.ReactNode, target: Element, options: TooltipOptions): void;
  hide(): void;
}

const TooltipContext = React.createContext<TooltipApi | null>(null);

const OFFSET = 10;

export interface TooltipProviderProps {
  children: React.ReactNode;
}

export function TooltipProvider({ children }: TooltipProviderProps) {
  const [shown, setShown] = React.useState<Shown | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const box = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<{ left: number; top: number } | null>(null);

  const api = React.useRef<TooltipApi>({
    show(content, target, { pos = 'top', delay = 0 }) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setPlace(null);
        setShown({ content, target: target.getBoundingClientRect(), pos });
      }, delay);
    },
    hide() {
      window.clearTimeout(timer.current);
      setShown(null);
    },
  }).current;

  // placed once rendered, when its size is known; kept inside the window
  React.useLayoutEffect(() => {
    if (!shown || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    const t = shown.target;
    let left: number;
    let top: number;
    switch (shown.pos) {
      case 'bottom-left': left = t.left; top = t.bottom + OFFSET; break;
      case 'bottom': case 'bottom-center': left = t.left + t.width / 2 - width / 2; top = t.bottom + OFFSET; break;
      case 'top-left': left = t.left; top = t.top - height - OFFSET; break;
      case 'left': left = t.left - width - OFFSET; top = t.top + t.height / 2 - height / 2; break;
      case 'right': left = t.right + OFFSET; top = t.top + t.height / 2 - height / 2; break;
      default: left = t.left + t.width / 2 - width / 2; top = t.top - height - OFFSET;
    }
    left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
    if (top < 4) top = t.bottom + OFFSET;
    if (top + height > window.innerHeight - 4) top = Math.max(4, t.top - height - OFFSET);
    setPlace({ left, top });
  }, [shown]);

  // the page scrolling moves the element away from its tooltip
  React.useEffect(() => {
    if (!shown) return;
    const hide = () => api.hide();
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [shown, api]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {shown && createPortal(
        <div
          ref={box}
          className={styles.tooltip}
          role="tooltip"
          style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0 }}
        >
          {shown.content}
        </div>,
        document.body,
      )}
    </TooltipContext.Provider>
  );
}

// Handlers to spread on an element: the tooltip shows while the pointer is on it
export function useTooltip() {
  const api = React.useContext(TooltipContext);
  return React.useCallback((content: React.ReactNode, options: TooltipOptions = {}) => {
    if (!api || content == null || content === '') return {};
    return {
      onMouseEnter: (event: React.MouseEvent<Element>) => api.show(content, event.currentTarget, options),
      onMouseLeave: () => api.hide(),
      onMouseDown: () => api.hide(),
    };
  }, [api]);
}
