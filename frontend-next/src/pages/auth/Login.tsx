import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../session/useAuth';
import { Button, Card, Input } from '../../ui/controls';
import { useToast } from '../../ui/Toast';
import styles from './AuthForm.module.css';

// where to go once signed in: the page that sent the user here, or the default page
export function useAfterLogin() {
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from;
  return () => navigate(from || '/info-releasenotes', { replace: true });
}

export function Login() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const { login } = useAuth();
  const notify = useToast();
  const afterLogin = useAfterLogin();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate({ username, password }, {
      onSuccess: afterLogin,
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Card panel className={styles.panel}>
        <fieldset>
          <legend className={styles.legend}>Log in</legend>
          <p className={styles.hint}>Use your username, or your email if you've set one.</p>
          <div className={styles.field}>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username or email"
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className={styles.field}>
            <Input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <p className={styles.forgot}><Link to="/reset_pw">Forgot password?</Link></p>
        </fieldset>
      </Card>
      <div className={styles.submit}>
        <Button type="submit" variant="default" block disabled={login.isPending}>Log in</Button>
      </div>
      <p className={styles.after}>Have an invite code? <Link to="/register">Register</Link></p>
    </form>
  );
}
