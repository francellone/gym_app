-- ============================================================================
-- ARCHIVADO POR ERROR — NO RE-APLICAR EN gym_app
-- ============================================================================
-- Aplicado contra el proyecto Supabase `bvexjanqmfypmtgoapbt` el 2026-05-19
-- a las 13:47:17 UTC-3 por error. Pertenece al proyecto "Aplicación para
-- clubes deportivos". Rolleado a las 14:00:08 por la migración
-- `20260519140008_rollback_multiclub_tables.sql`.
--
-- Ver README.md en esta carpeta para contexto completo.
-- ============================================================================

-- Función updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabla users (esquema final: dni nullable, nombre/apellido nullable, onboarding_completado incluido)
CREATE TABLE IF NOT EXISTS public.users (
  id                    UUID PRIMARY KEY,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  auth_provider         VARCHAR(50),
  provider_user_id      VARCHAR(255),
  dni                   VARCHAR(20) UNIQUE,
  nombre                VARCHAR(100),
  apellido              VARCHAR(100),
  telefono              VARCHAR(30),
  fecha_nacimiento      DATE,
  posicion_preferida    VARCHAR(100),
  respuestas_onboarding JSONB,
  onboarding_completado BOOLEAN NOT NULL DEFAULT FALSE,
  estado_cuenta         VARCHAR(20) NOT NULL DEFAULT 'activa'
                          CHECK (estado_cuenta IN ('activa','suspendida','baja')),
  fecha_alta            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_id_fk_auth_users FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_dni   ON public.users(dni);

DROP TRIGGER IF EXISTS trg_users_updated ON public.users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla global_roles (necesaria para las helper functions de RLS)
CREATE TABLE IF NOT EXISTS public.global_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_type  VARCHAR(50) NOT NULL CHECK (role_type IN ('owner_app','support')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_type)
);

-- Tabla clubs (necesaria para club_memberships y club_role_assignments)
CREATE TABLE IF NOT EXISTS public.clubs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  VARCHAR(200) NOT NULL,
  descripcion             TEXT,
  sede_principal          VARCHAR(255),
  colores_institucionales JSONB,
  configuracion_visual    JSONB,
  estado                  VARCHAR(20) NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo','inactivo','suspendido')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_clubs_updated ON public.clubs;
CREATE TRIGGER trg_clubs_updated BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla club_memberships (necesaria para helper functions)
CREATE TABLE IF NOT EXISTS public.club_memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  estado        VARCHAR(20) NOT NULL DEFAULT 'activo'
                  CHECK (estado IN ('pendiente','activo','suspendido','baja')),
  fecha_alta    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_baja    DATE,
  observaciones TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, club_id)
);
CREATE INDEX IF NOT EXISTS idx_club_memb_user ON public.club_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_club_memb_club ON public.club_memberships(club_id);
DROP TRIGGER IF EXISTS trg_club_memb_updated ON public.club_memberships;
CREATE TRIGGER trg_club_memb_updated BEFORE UPDATE ON public.club_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla club_role_assignments (necesaria para helper functions)
CREATE TABLE IF NOT EXISTS public.club_role_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  club_id               UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  role_type             VARCHAR(50) NOT NULL
                          CHECK (role_type IN (
                            'club_admin','club_manager','coach','player',
                            'referee','stats_operator','treasurer','viewer','candidate_player'
                          )),
  fecha_desde           DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_hasta           DATE,
  otorgado_por_user_id  UUID REFERENCES public.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, club_id, role_type)
);
CREATE INDEX IF NOT EXISTS idx_roles_user_club ON public.club_role_assignments(user_id, club_id);
