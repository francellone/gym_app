# Instructivo — múltiples cuentas de GitHub en una Mac

Guía **general** (no específica de gym_app) para manejar varios repos con
distintas cuentas de GitHub, una por laburo, en macOS. Pensada para moverla
a un repo propio de "configuraciones" cuando quieras.

Acompaña al script `git-multi-account.sh` (guardado en `~/git-multi-account.sh`).

---

## Modelo

- **Una cuenta / clave SSH por LABURO** (no por proyecto). Cada laburo puede
  tener N repos.
- **Un email por laburo**, aplicado automáticamente por carpeta con `includeIf`.
- Cada repo "se casa" con su cuenta vía el **alias SSH** de su remoto.
- Resultado: nunca más el error `403 ... denied` por cruzar cuentas, y cada
  commit sale con el email correcto sin que tengas que acordarte.

Organización de repos sugerida en disco (por laburo):

```
~/Code/
  personal/   → cuenta personal · francellone@gmail.com
  acme/       → cuenta de Acme   · franco@acme.com
  gov/        → cuenta -gov      · franco@gov.ar
```

---

## Alta de un laburo nuevo (una sola vez por laburo)

```bash
source ~/git-multi-account.sh    # carga las funciones en la terminal

setup_account <shortname> <email> "Franco Cellone" ~/Code/<shortname>
# ej:
setup_account personal francellone@gmail.com "Franco Cellone" ~/Code/personal
```

Eso, de forma idempotente:
1. crea la clave `~/.ssh/id_<shortname>` (si no existe) y la carga al llavero,
2. agrega el `Host github-<shortname>` a `~/.ssh/config`,
3. escribe `~/.gitconfig-<shortname>` con nombre + email,
4. agrega el `includeIf` para `~/Code/<shortname>/` en `~/.gitconfig`,
5. imprime y copia al portapapeles la **clave pública**.

Después: pegá esa clave pública en **la cuenta de GitHub que corresponde**
(Settings → SSH and GPG keys → New SSH key). Title = algo tipo
`MacBook Air — <shortname>`; Key type = Authentication Key.

Verificá:

```bash
verify_account <shortname>
# debe decir: "Hi <usuario>! You've successfully authenticated..."
```

La primera vez pregunta por la autenticidad de github.com → escribí `yes`
(fingerprint oficial ED25519: SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU).

---

## Enganchar un repo a su laburo (por proyecto)

Dentro del repo:

```bash
attach_repo github-<shortname> <owner>/<repo>
# ej:
attach_repo github-personal francellone/gym_app
```

Cambia el remoto `origin` al alias SSH del laburo y te muestra con qué
nombre/email va a commitear.

---

## Flujo diario de commit + push

```bash
git add <archivos>        # o git add -A (ojo con archivos sueltos sin trackear)
git commit -m "mensaje"
git push
```

- El commit usa el email del laburo (por el `includeIf` de la carpeta).
- El push usa la clave SSH del alias del remoto.

---

## Notas / troubleshooting

- **`403 ... denied to <otra-cuenta>`**: el repo está usando la cuenta
  equivocada. Verificá el remoto (`git remote -v`) y reasignalo con
  `attach_repo`. (En HTTPS el llavero cachea una sola cuenta por host; por eso
  usamos SSH con alias.)
- **`cd: too many arguments`**: pegaste una línea con comentario `# ...`. zsh
  no lo interpreta como comentario en modo interactivo → sacá el comentario.
- **Clave privada vs pública**: la pública es `~/.ssh/id_<name>.pub` (se
  comparte, se pega en GitHub). La privada es `~/.ssh/id_<name>` (**nunca** se
  comparte).
- **El `includeIf` solo pone el email solo** si el repo está bajo la carpeta
  declarada. Para un repo fuera de `~/Code/<laburo>/`, o lo movés, o fijás la
  identidad a mano en ese repo:
  `git config user.email <email>` / `git config user.name "..."`.
- **Passphrase**: el script crea las claves sin passphrase para ser
  no-interactivo. Si querés passphrase, sacá el `-N ""` del `ssh-keygen`; con
  `UseKeychain yes` macOS la recuerda igual.
