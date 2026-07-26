'use client';

/**
 * The current user, for client components.
 *
 * MOUNTING RULE, AND IT IS A RULE: the provider is mounted by the SERVER PAGE that
 * owns the client subtree, never by `src/app/layout.tsx`.
 *
 *     const user = await currentUser();
 *     return <ViewerProvider value={toViewer(user)}><Draw /></ViewerProvider>;
 *
 * Mounting it in the root layout would mean calling `auth()` there, which makes
 * every route in the app dynamic -- including `/terms` and `/privacy`, the two
 * pages a stranger loads before they have a session and the two that Google's
 * Branding page links to. Paying that to deliver a flag two components want is the
 * wrong trade, and it is invisible until you read the build's route table.
 *
 * `next-auth/react`'s `SessionProvider` and `useSession` are NOT used anywhere in
 * this project and should not be introduced. They add the library to the client
 * bundle and a `/api/auth/session` fetch on mount, to deliver data the server
 * already had in hand.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Viewer } from './server';

export type { Viewer };

/*
 * Two levels of "nothing": `undefined` means no provider was mounted, `null` means
 * one was mounted with no signed-in user. Collapsing them would make a missing
 * provider indistinguishable from a signed-out visitor, and the first is a bug
 * while the second is a state /login renders every day.
 */
const ViewerContext = createContext<Viewer | null | undefined>(undefined);

export function ViewerProvider({
  value,
  children,
}: {
  value: Viewer | null;
  children: ReactNode;
}) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/**
 * For signed-in subtrees. Throws rather than returning a placeholder.
 *
 * A component that needs a user id and silently gets `undefined` writes rows keyed
 * on nothing. Failing loudly at the boundary is the cheaper failure.
 */
export function useViewer(): Viewer {
  const v = useContext(ViewerContext);
  if (v === undefined) {
    throw new Error('useViewer() outside a ViewerProvider -- the owning server page must mount it');
  }
  if (v === null) {
    throw new Error('useViewer() with no signed-in user -- use useOptionalViewer() here');
  }
  return v;
}

/** For subtrees that also render signed-out: /login, /terms, /privacy. */
export function useOptionalViewer(): Viewer | null {
  return useContext(ViewerContext) ?? null;
}
