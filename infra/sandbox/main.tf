terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]
  default_tags { tags = { Project = "ops-compass", Purpose = "isolated-sandbox" } }
}
variable "region" {
  type = string
  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.region))
    error_message = "Supply the reviewed AWS region."
  }
}
variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "Supply the expected AWS account."
  }
}
variable "instance_id" {
  type = string
  validation {
    condition     = can(regex("^i-[a-f0-9]{17}$", var.instance_id))
    error_message = "Supply the one reviewed sandbox instance."
  }
}
resource "aws_ecr_repository" "sandbox" {
  name                 = "ops-compass-sandbox"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

# No instance, VPC, runner, IAM attachment or existing workload is created/changed.
resource "aws_ssm_document" "release" {
  name            = "OpsCompass-SandboxRelease"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy or roll back only the labeled Ops Compass sandbox"
    parameters = {
      Action         = { type = "String", allowedValues = ["deploy", "rollback", "status"] }
      ImageDigest    = { type = "String", allowedPattern = "^[a-f0-9]{64}$" }
      SourceRevision = { type = "String", allowedPattern = "^[a-f0-9]{40}$" }
    }
    mainSteps = [{ action = "aws:runShellScript", name = "SandboxRelease", inputs = {
      timeoutSeconds = "600"
      runCommand = [
        "set -eu",
        "command -v python3 >/dev/null; command -v docker >/dev/null; command -v aws >/dev/null",
        "umask 077; work=$(mktemp -d /var/tmp/ops-compass-ssm.XXXXXX); trap 'rm -rf \"$work\"' EXIT",
        "export DOCKER_CONFIG=\"$work/docker\"; mkdir \"$DOCKER_CONFIG\"",
        "aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${aws_ecr_repository.sandbox.registry_id}.dkr.ecr.${var.region}.amazonaws.com",
        "printf '%s' '${base64encode(file("${path.module}/../../scripts/sandbox-release.py"))}' | base64 -d > \"$work/release.py\"",
        "python3 \"$work/release.py\" {{ Action }} --image '${aws_ecr_repository.sandbox.repository_url}@sha256:{{ ImageDigest }}' --revision '{{ SourceRevision }}'"
      ]
    } }]
  })
}
resource "aws_iam_policy" "observe" {
  name = "OpsCompass-Observe"
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = [
    "ec2:DescribeInstances", "cloudwatch:DescribeAlarms", "ssm:DescribeInstanceInformation"
  ], Resource = "*" }] })
}
resource "aws_iam_policy" "deploy" {
  name = "OpsCompass-SandboxDeploy"
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = "ssm:SendCommand", Resource = aws_ssm_document.release.arn },
    { Effect = "Allow", Action = "ssm:SendCommand", Resource = "arn:aws:ec2:${var.region}:${var.account_id}:instance/${var.instance_id}", Condition = { StringEquals = { "ssm:resourceTag/OpsCompassSandbox" = "true" } } },
    { Effect = "Allow", Action = "ssm:GetCommandInvocation", Resource = "*" },
    { Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:DescribeImages"], Resource = aws_ecr_repository.sandbox.arn }
  ] })
}
resource "aws_iam_policy" "host_pull" {
  name = "OpsCompass-SandboxPull"
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = aws_ecr_repository.sandbox.arn }
  ] })
}
output "repository_url" { value = aws_ecr_repository.sandbox.repository_url }
output "document_name" { value = aws_ssm_document.release.name }
output "observer_policy_arn" { value = aws_iam_policy.observe.arn }
output "deployer_policy_arn" { value = aws_iam_policy.deploy.arn }
output "host_pull_policy_arn" { value = aws_iam_policy.host_pull.arn }
