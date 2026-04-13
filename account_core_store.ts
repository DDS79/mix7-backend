import { dbQuery, withDbTransaction } from './db/client';
import type { AuthAccount, ActorProfile, AuthType } from './product_actor_auth_profile';
import type { Actor } from './product_domain_anchors';

type AccountCoreStore = {
  loadActorByBuyerRef: (buyerRef: string) => Promise<Actor | null>;
  loadActorById: (actorId: string) => Promise<Actor | null>;
  persistActor: (actor: Actor) => Promise<Actor>;
  loadAuthAccount: (
    actorId: string,
    authType: AuthType,
    loginRef: string,
  ) => Promise<AuthAccount | null>;
  loadAuthAccountById: (authAccountId: string) => Promise<AuthAccount | null>;
  persistAuthAccount: (account: AuthAccount) => Promise<AuthAccount>;
  loadActorProfile: (actorId: string) => Promise<ActorProfile | null>;
  persistActorProfile: (profile: ActorProfile) => Promise<ActorProfile>;
};

type ActorRow = {
  id: string;
  kind: Actor['kind'];
  status: Actor['status'];
  buyer_ref: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type AuthAccountRow = {
  id: string;
  actor_id: string;
  auth_type: AuthAccount['authType'];
  status: AuthAccount['status'];
  login_ref: string;
  verified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ActorProfileRow = {
  id: string;
  actor_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapActorRow(row: ActorRow): Actor {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    buyerRef: row.buyer_ref,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapAuthAccountRow(row: AuthAccountRow): AuthAccount {
  return {
    id: row.id,
    actorId: row.actor_id,
    authType: row.auth_type,
    status: row.status,
    loginRef: row.login_ref,
    verifiedAt: toIso(row.verified_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapActorProfileRow(row: ActorProfileRow): ActorProfile {
  return {
    id: row.id,
    actorId: row.actor_id,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function createMemoryAccountCoreStore(): AccountCoreStore & {
  resetForTests: () => void;
} {
  const actors = new Map<string, Actor>();
  const authAccounts = new Map<string, AuthAccount>();
  const profiles = new Map<string, ActorProfile>();

  return {
    loadActorByBuyerRef: async (buyerRef) => {
      for (const actor of actors.values()) {
        if (actor.buyerRef === buyerRef) {
          return actor;
        }
      }
      return null;
    },
    loadActorById: async (actorId) => actors.get(actorId) ?? null,
    persistActor: async (actor) => {
      actors.set(actor.id, actor);
      return actor;
    },
    loadAuthAccount: async (actorId, authType, loginRef) => {
      for (const account of authAccounts.values()) {
        if (
          account.actorId === actorId &&
          account.authType === authType &&
          account.loginRef === loginRef
        ) {
          return account;
        }
      }
      return null;
    },
    loadAuthAccountById: async (authAccountId) => authAccounts.get(authAccountId) ?? null,
    persistAuthAccount: async (account) => {
      authAccounts.set(account.id, account);
      return account;
    },
    loadActorProfile: async (actorId) => {
      for (const profile of profiles.values()) {
        if (profile.actorId === actorId) {
          return profile;
        }
      }
      return null;
    },
    persistActorProfile: async (profile) => {
      profiles.set(profile.id, profile);
      return profile;
    },
    resetForTests: () => {
      actors.clear();
      authAccounts.clear();
      profiles.clear();
    },
  };
}

function createPostgresAccountCoreStore(): AccountCoreStore {
  return {
    loadActorByBuyerRef: async (buyerRef) => {
      const result = await dbQuery<ActorRow>(
        `SELECT id, kind, status, buyer_ref, created_at, updated_at
         FROM actors
         WHERE buyer_ref = $1`,
        [buyerRef],
      );
      return result.rows[0] ? mapActorRow(result.rows[0]) : null;
    },
    loadActorById: async (actorId) => {
      const result = await dbQuery<ActorRow>(
        `SELECT id, kind, status, buyer_ref, created_at, updated_at
         FROM actors
         WHERE id = $1`,
        [actorId],
      );
      return result.rows[0] ? mapActorRow(result.rows[0]) : null;
    },
    persistActor: async (actor) =>
      withDbTransaction(async (client) => {
        const result = await client.query<ActorRow>(
          `INSERT INTO actors (id, kind, status, buyer_ref, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
           ON CONFLICT (buyer_ref)
           DO UPDATE SET
             kind = EXCLUDED.kind,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
           RETURNING id, kind, status, buyer_ref, created_at, updated_at`,
          [
            actor.id,
            actor.kind,
            actor.status,
            actor.buyerRef,
            actor.createdAt,
            actor.updatedAt,
          ],
        );
        return mapActorRow(result.rows[0]);
      }),
    loadAuthAccount: async (actorId, authType, loginRef) => {
      const result = await dbQuery<AuthAccountRow>(
        `SELECT id, actor_id, auth_type, status, login_ref, verified_at, created_at, updated_at
         FROM auth_accounts
         WHERE actor_id = $1 AND auth_type = $2 AND login_ref = $3`,
        [actorId, authType, loginRef],
      );
      return result.rows[0] ? mapAuthAccountRow(result.rows[0]) : null;
    },
    loadAuthAccountById: async (authAccountId) => {
      const result = await dbQuery<AuthAccountRow>(
        `SELECT id, actor_id, auth_type, status, login_ref, verified_at, created_at, updated_at
         FROM auth_accounts
         WHERE id = $1`,
        [authAccountId],
      );
      return result.rows[0] ? mapAuthAccountRow(result.rows[0]) : null;
    },
    persistAuthAccount: async (account) =>
      withDbTransaction(async (client) => {
        const result = await client.query<AuthAccountRow>(
          `INSERT INTO auth_accounts (
             id, actor_id, auth_type, status, login_ref, verified_at, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz)
           ON CONFLICT (actor_id, auth_type, login_ref)
           DO UPDATE SET
             status = EXCLUDED.status,
             verified_at = EXCLUDED.verified_at,
             updated_at = EXCLUDED.updated_at
           RETURNING id, actor_id, auth_type, status, login_ref, verified_at, created_at, updated_at`,
          [
            account.id,
            account.actorId,
            account.authType,
            account.status,
            account.loginRef,
            account.verifiedAt,
            account.createdAt,
            account.updatedAt,
          ],
        );
        return mapAuthAccountRow(result.rows[0]);
      }),
    loadActorProfile: async (actorId) => {
      const result = await dbQuery<ActorProfileRow>(
        `SELECT id, actor_id, display_name, phone, email, metadata, created_at, updated_at
         FROM actor_profiles
         WHERE actor_id = $1`,
        [actorId],
      );
      return result.rows[0] ? mapActorProfileRow(result.rows[0]) : null;
    },
    persistActorProfile: async (profile) =>
      withDbTransaction(async (client) => {
        const result = await client.query<ActorProfileRow>(
          `INSERT INTO actor_profiles (
             id, actor_id, display_name, phone, email, metadata, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)
           ON CONFLICT (actor_id)
           DO UPDATE SET
             display_name = EXCLUDED.display_name,
             phone = EXCLUDED.phone,
             email = EXCLUDED.email,
             metadata = EXCLUDED.metadata,
             updated_at = EXCLUDED.updated_at
           RETURNING id, actor_id, display_name, phone, email, metadata, created_at, updated_at`,
          [
            profile.id,
            profile.actorId,
            profile.displayName,
            profile.phone,
            profile.email,
            JSON.stringify(profile.metadata),
            profile.createdAt,
            profile.updatedAt,
          ],
        );
        return mapActorProfileRow(result.rows[0]);
      }),
  };
}

const memoryAccountCoreStore =
  process.env.NODE_ENV === 'test' ? createMemoryAccountCoreStore() : null;

export const accountCoreStore: AccountCoreStore =
  memoryAccountCoreStore ?? createPostgresAccountCoreStore();

export function resetAccountCoreStoreForTests() {
  memoryAccountCoreStore?.resetForTests();
}

