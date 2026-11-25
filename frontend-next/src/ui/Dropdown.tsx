// A box that opens below its toggle on a click and closes on a click outside it or on Escape, as UIkit's
// uk-dropdown="mode: click"
import * as React from 'react';
import { cx } from './controls';
import styles from './Dropdown.module.css';

interface DropdownProps {
  // the toggle, given whether the box is open and a function that opens or closes it
  toggle: (open: boolean, setOpen: (open: boolean) => void) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
  boxClassName?: string;
  align?: 'left' | 'right';
}

export function Dropdown({ toggle, children, className, boxClassName, align = 'left' }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={root} className={cx(styles.dropdown, className)}>
      {toggle(open, setOpen)}
      {open && (
        <div className={cx(styles.box, align === 'right' && styles.right, boxClassName)}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
