// Logging in, registering and logging out: each replaces the session the app shows (the initial.json query).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type LoginResponse } from '../api/endpoints';
import { keys } from '../api/queries';
import type { Session } from '../api/types';

function sessionFrom(response: LoginResponse): Session {
  // Django has set the new CSRF cookie itself (the client reads it from there)
  const { csrftoken: _csrf, page: _page, ...session } = response;
  return session;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // what the backend shows depends on who asks (their list, and names hidden by players' privacy settings)
  const forgetUserData = () => {
    queryClient.removeQueries({ queryKey: keys.encounters });
    queryClient.removeQueries({ queryKey: ['encounter'] });
  };

  const signedIn = (response: LoginResponse) => {
    // a different user may have signed in: their encounter list is loaded when the Encounters page asks for it
    forgetUserData();
    queryClient.setQueryData(keys.initial, sessionFrom(response));
  };

  const login = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
    onSuccess: signedIn,
  });

  const register = useMutation({
    mutationFn: api.register,
    onSuccess: signedIn,
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      // to Help first (the router navigates asynchronously): on a page for signed-in users, the guest would
      // otherwise be sent to log in
      await navigate('/info-help');
      forgetUserData();
      queryClient.setQueryData<Session>(keys.initial, { username: '', email: '' });
    },
  });

  return { login, register, logout };
}
