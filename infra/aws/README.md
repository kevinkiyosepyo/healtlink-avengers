# Deploying lookahead to AWS

One container (see `Dockerfile`) serves the frontend, Google sign-in and the opt-in cloud backup API. `template.yaml` creates:

| Resource | Why |
|---|---|
| **App Runner service** | Runs the container behind managed HTTPS with autoscaling and health checks. No VPC, load balancer or cluster to operate. |
| **DynamoDB table** (`user` + `id` keys, on-demand) | Cloud backup items. Encrypted at rest, point-in-time recovery on, deletion protection on, retained if the stack is deleted. |
| **Secrets Manager** (you create 3 secrets) | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, injected at runtime and never in the image or the template. |
| **IAM roles** | One lets App Runner pull from ECR; the runtime role can only touch this table and those three secrets. |

The researcher's OpenAI key is **not** part of the cloud setup. It still goes browser → api.openai.com directly.

## First deploy

1. **Secrets** (once):
   ```sh
   aws secretsmanager create-secret --name lookahead/auth-secret --secret-string "$(openssl rand -base64 32)"
   aws secretsmanager create-secret --name lookahead/google-id --secret-string "<client id>"
   aws secretsmanager create-secret --name lookahead/google-secret --secret-string "<client secret>"
   ```
   Note the three ARNs. Type the Google values yourself; don't paste them into chats or commits.
2. **Deploy** (Docker running, AWS CLI logged in):
   ```sh
   AUTH_URL=https://placeholder.example AUTH_SECRET_ARN=... GOOGLE_ID_ARN=... GOOGLE_SECRET_ARN=... infra/aws/deploy.sh
   ```
3. **Set the real origin:** take `ServiceUrl` from the output (or point a custom domain at it), re-run step 2 with `AUTH_URL` set to it, and add `<AUTH_URL>/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console.
4. **Check:** `curl <AUTH_URL>/api/account` should report `"configured": true` and `"cloudSync": true`.

Later deploys: re-run `deploy.sh`. Each push tags the image with the git SHA.

## Cost at hackathon scale

App Runner bills per vCPU-second while serving, plus a small idle charge; DynamoDB on-demand charges per request and GB stored. Light demo traffic is typically a few dollars a month. Set an AWS Budget alert anyway.

## Moving off Vercel

Vercel (`vercel.json`, `api/`) keeps serving the current live site until this is verified. Then update the Google OAuth redirect URI and remove the Vercel files in one change.
