import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { Button, Card, Input } from '../../ui/controls';
import { useToast } from '../../ui/Toast';
import styles from './AuthForm.module.css';

export function ResetPassword() {
  const [email, setEmail] = React.useState('');
  const notify = useToast();
  const reset = useMutation({ mutationFn: api.resetPassword });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    reset.mutate(email, {
      onSuccess: () => notify('Sending now.', 'primary'),
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Card panel className={styles.panel}>
        <fieldset>
          <legend className={styles.legend}>Reset your password</legend>
          <p className={styles.hint}>Enter the email address on your account and we'll send you a reset link.</p>
          <div className={styles.field}>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" autoFocus required />
          </div>
        </fieldset>
      </Card>
      <div className={styles.submit}>
        <Button type="submit" variant="default" block disabled={reset.isPending}>Send reset link</Button>
      </div>
      <p className={styles.after}><Link to="/login">Back to log in</Link></p>
    </form>
  );
}
