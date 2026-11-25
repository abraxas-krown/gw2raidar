// The Account page (frontend/src/partials/account.html): on the left, tabs for the percentile colours, the
// password, the email, linking another GW2 account and privacy; on the right, the user and their linked accounts
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { keys } from '../../api/queries';
import type { EncounterRow, Session } from '../../api/types';
import { formatDate } from '../../lib/format';
import { PALETTES, percentileStyle, type Palette } from '../../lib/percentiles';
import { updateSettings, useSettings } from '../../lib/settings';
import { useSession } from '../../session/SessionProvider';
import { Button, FieldLabel, Input } from '../../ui/controls';
import { Tabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { useTooltip } from '../../ui/Tooltip';
import styles from './Account.module.css';

type Tab = 'appearance' | 'password' | 'email' | 'api_key' | 'privacy';

const TABS: [Tab, string][] = [
  ['appearance', 'Appearance'],
  ['password', 'Change Password'],
  ['email', 'Email'],
  ['api_key', 'Add API Key'],
  ['privacy', 'Privacy'],
];

const API_KEY_PATTERN =
  '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{20}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$';

const PALETTE_NAMES: Record<Palette, string> = { default: 'Default', rainbow: 'Rainbow', colorblind: 'Colorblind' };

// the browser's own validation, with the current site's messages
const withMessage = (message: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
  const input = event.target;
  input.setCustomValidity('');
  if (input.validity.patternMismatch) input.setCustomValidity(message);
};

const escapeRegExp = (text: string) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

// the session as the account forms change it (initial.json's data)
function useUpdateSession() {
  const queryClient = useQueryClient();
  return (update: (session: Session) => Session) =>
    queryClient.setQueryData<Session>(keys.initial, session => session && update(session));
}

export function AccountPage() {
  const [tab, setTab] = React.useState<Tab>('appearance');
  const session = useSession();

  return (
    <div className={styles.account}>
      <div>
        <Tabs tabs={TABS} current={tab} onChange={setTab} />
        {tab === 'appearance' && <Appearance />}
        {tab === 'password' && <ChangePassword />}
        {tab === 'email' && <ChangeEmail />}
        {tab === 'api_key' && <AddApiKey />}
        {tab === 'privacy' && <Privacy />}
      </div>
      <div>
        <h2 className="m-0">Profile: <strong>{session.username}</strong></h2>
        <MemberSince />
        <LinkedAccounts />
        <p>
          Note that GW2 Raidar only requires the keys to authenticate your ownership of a GW2 account. Therefore, you
          only need the default "account" permission.
        </p>
      </div>
    </div>
  );
}

// When the user joined: known once Personal Stats has loaded (profile.json), as on the current site
function MemberSince() {
  const queryClient = useQueryClient();
  const profile = queryClient.getQueriesData<{ joined_at?: number }>({ queryKey: ['profile'] }).find(([, data]) => data)?.[1];
  return <div><span className="ignore">Member since</span> {formatDate(profile?.joined_at)}</div>;
}

// ---- the percentile colours
function Appearance() {
  const { palette = 'default' } = useSettings();
  return (
    <form onSubmit={event => event.preventDefault()}>
      <h5 className={styles.smallBottom}>Percentile colors</h5>
      <p className={styles.choices}>
        {PALETTES.map(id => (
          <React.Fragment key={id}>
          <label>
            <input
              type="radio"
              name="palette"
              value={id}
              checked={palette === id}
              onChange={() => updateSettings(s => ({ ...s, palette: id }))}
            />{' '}
            {PALETTE_NAMES[id]}
          </label>
          &nbsp;
          </React.Fragment>
        ))}
      </p>
      <div className={styles.swatches} role="img" aria-label="The colours of the percentiles from 0 to 100">
        {Array.from({ length: 101 }, (_, p) => (
          <span key={p} className="pctl" style={{ ...percentileStyle(p, palette), border: 'none' }}>&nbsp;</span>
        ))}
      </div>
    </form>
  );
}

// ---- the password
function ChangePassword() {
  const notify = useToast();
  const [fields, setFields] = React.useState({ old: '', password: '', password2: '' });
  const change = useMutation({ mutationFn: api.changePassword });

  const set = (name: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [name]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    change.mutate({ old_password: fields.old, new_password1: fields.password, new_password2: fields.password2 }, {
      onSuccess: () => {
        notify('Password changed', 'success');
        setFields({ old: '', password: '', password2: '' });
      },
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form onSubmit={submit}>
      <div className={styles.field}>
        <FieldLabel htmlFor="old-password">Old Password</FieldLabel>
        <Input
          id="old-password"
          type="password"
          placeholder="Old password"
          autoComplete="current-password"
          value={fields.old}
          onChange={e => { set('old')(e); withMessage('Please use at least 8 characters')(e); }}
          required
          pattern=".{8,}"
        />
      </div>
      <div className={styles.field}>
        <FieldLabel htmlFor="new-password">Change Password</FieldLabel>
        <Input
          id="new-password"
          type="password"
          placeholder="Change password"
          autoComplete="new-password"
          value={fields.password}
          onChange={set('password')}
          required
        />
      </div>
      <div className={styles.field}>
        <FieldLabel htmlFor="new-password2">Confirm Password</FieldLabel>
        <Input
          id="new-password2"
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          value={fields.password2}
          onChange={e => { set('password2')(e); withMessage('Please make sure the password fields match')(e); }}
          required
          pattern={escapeRegExp(fields.password)}
        />
      </div>
      <Button type="submit" variant="primary" disabled={change.isPending}>Save</Button>
    </form>
  );
}

// ---- the email (empty removes it)
function ChangeEmail() {
  const notify = useToast();
  const session = useSession();
  const updateSession = useUpdateSession();
  const [email, setEmail] = React.useState(session.email || '');
  const change = useMutation({ mutationFn: api.changeEmail });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    change.mutate(email, {
      onSuccess: response => {
        notify(response.email ? 'Email saved' : 'Email removed', 'success');
        updateSession(s => ({ ...s, email: response.email }));
      },
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form className={styles.row} onSubmit={submit}>
      <Input type="email" placeholder="Email address" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Button type="submit" variant="primary" block disabled={change.isPending}>Save</Button>
    </form>
  );
}

// ---- linking another GW2 account
function AddApiKey() {
  const notify = useToast();
  const queryClient = useQueryClient();
  const updateSession = useUpdateSession();
  const [apiKey, setApiKey] = React.useState('');
  const add = useMutation({ mutationFn: api.addAPIKey });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    add.mutate(apiKey, {
      onSuccess: response => {
        notify(`API key for ${response.account_name} added`, 'success');
        setApiKey('');
        // shown masked, as initial.json shows the others
        const masked = apiKey.slice(0, 8) + apiKey.slice(8, -12).replace(/[0-9a-zA-Z]/g, 'X') + apiKey.slice(-12);
        updateSession(s => {
          const accounts = (s.accounts || []).filter(account => account.name !== response.account_name);
          return { ...s, accounts: [...accounts, { name: response.account_name, api_key: masked }] };
        });
        // the backend answers with the user's encounters, which now include that account's
        if (response.encounters) queryClient.setQueryData(keys.encounters, response.encounters);
      },
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form onSubmit={submit}>
      <div className={styles.row}>
        <Input
          placeholder="Enter GW2 API key named 'gw2raidar' to link another account"
          autoComplete="off"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); withMessage('Please paste a valid GW2 API key')(e); }}
          required
          pattern={API_KEY_PATTERN}
        />
        <Button type="submit" variant="primary" block disabled={add.isPending}>Save</Button>
      </div>
      <div className={styles.help}>
        <h3>How do I get GW2 API Key?</h3>
        <ol>
          <li>Go to <a target="arenanet account applications" href="https://account.arena.net/applications">ArenaNet Account Applications</a> and authenticate</li>
          <li>Click the "New Key" button</li>
          <li>Name your new API key. The name must include the phrase "GW2RAIDAR" in it</li>
          <li>GW2 Raidar only requires "account" permission</li>
          <li>Click the "Create API Key" button</li>
          <li>Your API key will now show; copy it, and paste it into the form above</li>
        </ol>
        <h3>It says my Account is already registered to another user</h3>
        <p>
          This means that an API key associated with your account has been used already by another GW2 Raidar user to
          link your GW2 account. You will need to remove the API key in question (shown in the error message) from your
          GW2 Account, and possibly create a new API key, in order to prove your ownership of that GW2 account and
          register your GW2 Raidar account.
        </p>
      </div>
    </form>
  );
}

// ---- who sees the user's names
const PRIVACY: [number, string, string][] = [
  [1, 'Private', 'Display your account and character names to no-one but yourself'],
  [2, 'Squad', 'Display your account and character names only to participants in your specific encounter'],
  [3, 'Public', 'Show your account and character names to everyone'],
];

function Privacy() {
  const notify = useToast();
  const session = useSession();
  const updateSession = useUpdateSession();
  const tooltip = useTooltip();
  const set = useMutation({ mutationFn: api.setPrivacy });

  const choose = (privacy: number) => {
    updateSession(s => ({ ...s, privacy }));
    set.mutate(privacy, {
      onSuccess: () => notify('Privacy updated.', 'success'),
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <form className={styles.privacy} onSubmit={event => event.preventDefault()}>
      <div className={styles.privacyChoice}>Privacy:</div>
      {PRIVACY.map(([value, label, title]) => (
        <div key={value} className={styles.privacyChoice} {...tooltip(title, { pos: 'bottom' })}>
          <input
            type="radio"
            name="privacy"
            id={`privacy-${value}`}
            checked={session.privacy === value}
            onChange={() => choose(value)}
          />{' '}
          <label htmlFor={`privacy-${value}`}>{label}</label>
        </div>
      ))}
    </form>
  );
}

// ---- the GW2 accounts linked to the user, by their API keys
function LinkedAccounts() {
  const notify = useToast();
  const session = useSession();
  const queryClient = useQueryClient();
  const updateSession = useUpdateSession();
  const remove = useMutation({ mutationFn: api.removeAPIKey });
  const accounts = session.accounts || [];

  const onRemove = (name: string) => {
    if (!confirm(`Remove the API key for ${name}? That GW2 account will be unlinked from your user, and its encounters will no longer be shown here.`)) return;
    remove.mutate(name, {
      onSuccess: response => {
        notify(`API key for ${response.account_name} removed`, 'success');
        updateSession(s => ({ ...s, accounts: (s.accounts || []).filter(a => a.name !== response.account_name) }));
        queryClient.setQueryData<EncounterRow[]>(keys.encounters, rows => rows?.filter(e => e.account !== response.account_name));
      },
      onError: error => notify(error.message, 'danger'),
    });
  };

  return (
    <table className={styles.table}>
      <tbody>
        <tr>
          <th>Linked account</th>
          <th>API key</th>
          {accounts.length > 1 && <th />}
        </tr>
        {accounts.map(account => (
          <tr key={account.name}>
            <td>{account.name}</td>
            <td>{account.api_key}</td>
            {accounts.length > 1 && (
              <td className="text-right">
                <Button small className={styles.danger} onClick={() => onRemove(account.name)} disabled={remove.isPending}>
                  Remove
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
