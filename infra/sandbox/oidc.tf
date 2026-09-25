variable "gitlab_oidc_provider_arn" {
  type        = string
  default     = null
  description = "Existing gitlab.com IAM OIDC provider; null creates no CI role."
}
variable "gitlab_project_path" {
  type        = string
  default     = null
  description = "Exact case-sensitive GitLab namespace/project, required with an OIDC provider."
}
resource "aws_iam_role" "ci" {
  count = var.gitlab_oidc_provider_arn == null ? 0 : 1
  name  = "OpsCompass-SandboxCI"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow"
    Principal = { Federated = var.gitlab_oidc_provider_arn }
    Action    = "sts:AssumeRoleWithWebIdentity"
    Condition = { StringEquals = {
      "gitlab.com:aud" = "sts.amazonaws.com"
      "gitlab.com:sub" = "project_path:${coalesce(var.gitlab_project_path, "UNCONFIGURED")}:ref_type:branch:ref:main"
    } }
  }] })
  lifecycle {
    precondition {
      condition     = var.gitlab_project_path != null && can(regex("^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$", var.gitlab_project_path))
      error_message = "Configure the exact GitLab project path before creating its CI role."
    }
  }
}
resource "aws_iam_role_policy_attachment" "ci_deploy" {
  count      = length(aws_iam_role.ci)
  role       = aws_iam_role.ci[0].name
  policy_arn = aws_iam_policy.deploy.arn
}
resource "aws_iam_role_policy_attachment" "ci_observe" {
  count      = length(aws_iam_role.ci)
  role       = aws_iam_role.ci[0].name
  policy_arn = aws_iam_policy.observe.arn
}
output "ci_role_arn" { value = try(aws_iam_role.ci[0].arn, null) }
