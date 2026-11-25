import * as React from 'react';
import { useAuth } from '../../session/useAuth';
import { Button, Card, Icon, Input } from '../../ui/controls';
import { useToast } from '../../ui/Toast';
import { useAfterLogin } from './Login';
import styles from './AuthForm.module.css';

const API_KEY_PATTERN =
  '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{20}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$';
const APPLICATIONS_URL = 'https://account.arena.net/applications';

// the browser's own validation, with the current site's messages
const withMessage = (message: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
  const input = event.target;
  input.setCustomValidity('');
  if (input.validity.patternMismatch) input.setCustomValidity(message);
};

const escapeRegExp = (text: string) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

export function Register() {
  const [fields, setFields] = React.useState({ invite_code: '', username: '', password: '', password2: '', api_key: '' });
  const { register } = useAuth();
  const notify = useToast();
  const afterLogin = useAfterLogin();

  const set = (name: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [name]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const { invite_code, username, password, api_key } = fields;
    register.mutate({ invite_code, username, password, api_key }, {
      onSuccess: afterLogin,
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Card panel className={styles.panel}>
        <fieldset>
          <legend className={styles.legend}>1. Invite code</legend>
          <p className={styles.hint}>Registration is invite-only. Enter the invite code you were given.</p>
          <div className={styles.field}>
            <Input value={fields.invite_code} onChange={set('invite_code')} placeholder="Invite code" autoComplete="off" autoFocus required />
          </div>
        </fieldset>
      </Card>

      <Card panel className={styles.panel}>
        <fieldset>
          <legend className={styles.legend}>2. Your login</legend>
          <p className={styles.hint}>Letters, numbers and ._+-@ for the username; at least 8 characters for the password.</p>
          <div className={styles.field}>
            <Input
              value={fields.username}
              onChange={e => { set('username')(e); withMessage('Please use letters, numbers, and ._+-@')(e); }}
              placeholder="Username"
              autoComplete="username"
              pattern="[\w.@+\-]+"
              required
            />
          </div>
          <div className={styles.field}>
            <Input
              value={fields.password}
              onChange={e => { set('password')(e); withMessage('Please use at least 8 characters')(e); }}
              placeholder="Password"
              type="password"
              autoComplete="new-password"
              pattern=".{8,}"
              required
            />
          </div>
          <div className={styles.field}>
            <Input
              value={fields.password2}
              onChange={e => { set('password2')(e); withMessage('Please make sure the password fields match')(e); }}
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              pattern={escapeRegExp(fields.password)}
              required
            />
          </div>
        </fieldset>
      </Card>

      <Card panel className={styles.panel}>
        <fieldset>
          <legend className={styles.legend}>3. Link your GW2 account</legend>
          <p className={styles.hint}>
            Create a key on <a href={APPLICATIONS_URL} target="gw2apps">ArenaNet's Applications page</a> with only
            the "account" permission. Its name must contain "<em>GW2Raidar</em>" (any case), e.g. "GW2Raidar" or
            "The key for GW2Raidar".
          </p>
          <div className={`${styles.field} ${styles.withIcon}`}>
            <a href={APPLICATIONS_URL} target="gw2apps" aria-label="ArenaNet's Applications page"><Icon name="link" /></a>
            <Input
              value={fields.api_key}
              onChange={e => { set('api_key')(e); withMessage('Please paste a valid GW2 API key')(e); }}
              placeholder="'gw2raidar' API key"
              autoComplete="off"
              pattern={API_KEY_PATTERN}
              required
            />
          </div>
        </fieldset>
      </Card>

      <div className={styles.submit}>
        <Button type="submit" variant="default" block disabled={register.isPending}>Register</Button>
      </div>
    </form>
  );
}
