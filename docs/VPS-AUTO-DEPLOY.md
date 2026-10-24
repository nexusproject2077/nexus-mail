# Nexus Mail: automatic deployment to VPS

This deploys **only the static frontend** to the document root served by
`https://mail.mmi25b11.mmi-troyes.fr`. It does not restart the backend,
change `backend/.env`, or modify SQLite.

## One-time setup

1. Identify the **actual Apache/Nginx document root** for the `mail` subdomain
   on the VPS (e.g. inspect its VirtualHost config). Do not guess it.
   Ensure that the SSH deployment user can write to that dedicated directory.
2. Create a dedicated SSH key for GitHub Actions on a trusted machine or the VPS:
   `ssh-keygen -t ed25519 -f ~/.ssh/nexus-mail-deploy -C nexus-mail-actions`.
   Add the **public** key to the deployment user's `~/.ssh/authorized_keys`.
   Keep the **private** key only in GitHub Actions Secrets.
3. In GitHub repository Settings > Secrets and variables > Actions, add:

| Secret | Value |
| --- | --- |
| `NEXUS_MAIL_VPS_HOST` | VPS SSH hostname or IP |
| `NEXUS_MAIL_VPS_USER` | SSH deployment username |
| `NEXUS_MAIL_VPS_SSH_KEY` | Entire private SSH key |
| `NEXUS_MAIL_VPS_KNOWN_HOSTS` | Verified SSH host public key entry (from `ssh-keyscan`, verified against server fingerprint out of band) |
| `NEXUS_MAIL_FRONTEND_DIR` | Absolute path to the dedicated mail subdomain's web root |

**Do not put your backend `.env`, OAuth secrets, SQLite files, or your SSH
private key into the repository.** GitHub Actions Secrets are configured in
GitHub settings, not committed.

4. Run the workflow **Deploy Nexus Mail to VPS** manually once in Actions,
   then check the site in a private tab. Every subsequent push to `main`
   will build and upload the frontend automatically.

The workflow intentionally does **not** use `rsync --delete` to avoid
accidentally removing unrelated files if a document root is misconfigured.
Old hashed assets can be cleaned later once the directory is confirmed to be
dedicated exclusively to the static frontend.

GitHub Pages deployment remains independent and unchanged.
