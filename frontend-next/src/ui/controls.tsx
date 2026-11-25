// Small building blocks with the site's look: buttons, form controls, badges, labels, cards and icons
import * as React from 'react';
import styles from './controls.module.css';

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plain' | 'default' | 'primary';
  small?: boolean;
  block?: boolean;
  active?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'plain', small, block, active, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        styles.button,
        variant === 'default' && styles.default,
        variant === 'primary' && styles.primary,
        small && styles.small,
        block && styles.block,
        active && styles.active,
        className,
      )}
      {...props}
    />
  );
});

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

export function ButtonGroup({ className, ...props }: ButtonGroupProps) {
  return <div className={cx(styles.group, className)} {...props} />;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(styles.input, className)} {...props} />;
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, ...props }: SelectProps) {
  return <select className={cx(styles.select, className)} {...props} />;
}

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return <label className={cx(styles.label, className)} {...props} />;
}

type BadgeTone = 'primary' | 'success' | 'danger' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  bold?: boolean;
}

export function Badge({ tone = 'primary', bold, className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(styles.badge, bold && styles.bold, tone !== 'primary' && styles[tone], className)}
      {...props}
    />
  );
}

export const badgeClass = (tone: BadgeTone = 'primary', bold = false) =>
  cx(styles.badge, bold && styles.bold, tone !== 'primary' && styles[tone]);

export interface ModeTagProps {
  mode?: string | null;
}

// The encounter's mode: CM or LCM
export function ModeTag({ mode }: ModeTagProps) {
  if (!mode) return null;
  const modeClass = mode === 'CM' ? styles.modeCM : mode === 'LCM' ? styles.modeLCM : undefined;
  return <span className={cx(styles.tag, modeClass)}>{mode}</span>;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  panel?: boolean;
}

export function Card({ panel, className, ...props }: CardProps) {
  return <div className={cx(styles.card, panel && styles.panel, className)} {...props} />;
}

export interface IconProps extends React.HTMLAttributes<HTMLElement> {
  name: string;
}

// A Material icon by its ligature name
export function Icon({ name, className, ...props }: IconProps) {
  return (
    <i className={cx('material-icons', className)} aria-hidden="true" {...props}>
      {name}
    </i>
  );
}

// The commander tag before a commander's name
export function CommanderTag() {
  return (
    <svg className="commander-tag" viewBox="0 0 16 16" role="img" aria-label="Commander">
      <title>Commander</title>
      <path d="M2 2h12v5.5L8 14 2 7.5z" />
    </svg>
  );
}

export interface PlayerNameProps {
  name?: string | null;
  commander?: boolean;
  as?: 'h5' | 'span';
  className?: string;
}

// A player's name, the commander tag before it; PRIVATE (glitching) when the player hides it
export function PlayerName({ name, commander, as: Tag = 'h5', className }: PlayerNameProps): React.ReactNode {
  if (!name) {
    return <Tag className={cx('private m-0', className)} data-text="PRIVATE">PRIVATE</Tag>;
  }
  return (
    <Tag className={cx('m-0 truncate', className)}>
      {commander && <CommanderTag />}
      {name}
    </Tag>
  );
}
