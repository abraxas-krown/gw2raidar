// A list of tags edited as chips (the tags-input widget of the current frontend): typing a comma or Enter adds
// the tag being typed, Backspace in an empty field removes the last one. The value is comma-separated.
import * as React from 'react';
import { cx } from './controls';
import styles from './TagsInput.module.css';

const split = (value: string) => value.split(',').map(tag => tag.trim()).filter(Boolean);

export interface TagsInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export function TagsInput({ value, onChange, placeholder, readOnly, className }: TagsInputProps) {
  const [draft, setDraft] = React.useState('');
  const tags = split(value);

  const commit = (text: string) => {
    const added = split(text).filter(tag => !tags.includes(tag));
    if (added.length) onChange([...tags, ...added].join(','));
    setDraft('');
  };
  const remove = (index: number) => onChange(tags.filter((_, i) => i !== index).join(','));

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      remove(tags.length - 1);
    }
  };

  return (
    <div className={cx(styles.tags, className)}>
      {tags.map((tag, index) => (
        <span key={tag} className={styles.tag}>
          {tag}
          {!readOnly && (
            <button type="button" className={styles.remove} aria-label={`Remove ${tag}`} onClick={() => remove(index)}>×</button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          className={styles.input}
          value={draft}
          placeholder={tags.length ? '' : placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && commit(draft)}
        />
      )}
    </div>
  );
}
