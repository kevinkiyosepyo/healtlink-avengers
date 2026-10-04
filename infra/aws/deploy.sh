#!/usr/bin/env bash
# Build the container, push it to ECR and deploy/update the CloudFormation stack.
# Prerequisites: AWS CLI v2 logged in (aws sso login / aws configure), Docker
# running, and three Secrets Manager secrets (see infra/aws/README.md).
#
# Usage: AUTH_URL=https://... AUTH_SECRET_ARN=... GOOGLE_ID_ARN=... GOOGLE_SECRET_ARN=... infra/aws/deploy.sh
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STACK="${STACK_NAME:-lookahead}"
REPO="${ECR_REPO:-lookahead}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
: "${AUTH_URL:?set AUTH_URL to the public https origin}"
: "${AUTH_SECRET_ARN:?}" "${GOOGLE_ID_ARN:?}" "${GOOGLE_SECRET_ARN:?}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPO}:${TAG}"

aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" --image-scanning-configuration scanOnPush=true >/dev/null
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# App Runner runs x86_64.
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file infra/aws/template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ImageUri="$IMAGE" AuthUrl="$AUTH_URL" \
    AuthSecretArn="$AUTH_SECRET_ARN" GoogleClientIdArn="$GOOGLE_ID_ARN" GoogleClientSecretArn="$GOOGLE_SECRET_ARN"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query "Stacks[0].Outputs" --output table
