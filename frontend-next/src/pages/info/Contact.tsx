// The Contact Us page (frontend/src/partials/info_contact.html): a message to the site's team by email. A link
// can fill in the subject (the encounter page's "Found an error?").
import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { api } from '../../api/endpoints';
import { useSignedIn } from '../../session/SessionProvider';
import { Button, Input } from '../../ui/controls';
import { useToast } from '../../ui/Toast';
import styles from './Info.module.css';

export function Contact() {
  const signedIn = useSignedIn();
  const notify = useToast();
  const subject = (useLocation().state as { subject?: string } | null)?.subject ?? '';
  const empty = { name: '', email: '', subject, body: '' };
  const [fields, setFields] = React.useState(empty);
  const send = useMutation({ mutationFn: api.contact });

  const set = (name: keyof typeof fields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(f => ({ ...f, [name]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // signed-in users are known to the backend; guests say who they are
    const { name, email, ...message } = fields;
    send.mutate(signedIn ? message : fields, {
      onSuccess: () => {
        notify('Email sent', 'success');
        setFields({ ...empty, subject: '' });
      },
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <article className={styles.page}>
      <h2>Contact</h2>
      <p>Use the form below to send us an email, alternatively you can reach us via our <a href="http://discord.gg/8j43kAc">Discord</a></p>
      <form className={styles.contact} onSubmit={submit}>
        {!signedIn && (
          <>
            <div className={styles.field}>
              <Input className={styles.medium} value={fields.name} onChange={set('name')} required placeholder="Your name" />
            </div>
            <div className={styles.field}>
              <Input className={styles.medium} type="email" value={fields.email} onChange={set('email')} required placeholder="Your email" />
            </div>
          </>
        )}
        <div className={styles.field}>
          <Input value={fields.subject} onChange={set('subject')} required placeholder="Subject" />
        </div>
        <div className={styles.field}>
          <textarea className={styles.textarea} rows={10} placeholder="Email text" required value={fields.body} onChange={set('body')} />
        </div>
        <div className={styles.field}>
          <Button type="submit" variant="primary" disabled={send.isPending}>Contact us!</Button>
        </div>
      </form>
    </article>
  );
}
