/**
 * GitHub Webhook Normalizer
 *
 * Handles these GitHub event types:
 * - deployment_status: A deployment succeeded/failed
 * - workflow_run: A CI pipeline completed
 * - push: Code pushed to a branch
 * - pull_request: PR opened/merged/closed
 */

interface NormalizedEvent {
  source: 'github';
  eventType: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, any>;
  occurredAt: Date;
}

export function normalizeGitHub(eventType: string, payload: any): NormalizedEvent | null {
  switch (eventType) {
    case 'deployment_status':
      return normalizeDeploymentStatus(payload);
    case 'workflow_run':
      return normalizeWorkflowRun(payload);
    case 'push':
      return normalizePush(payload);
    case 'pull_request':
      return normalizePullRequest(payload);
    default:
      return normalizeGenericGitHub(eventType, payload);
  }
}

function normalizeDeploymentStatus(payload: any): NormalizedEvent {
  const state = payload.deployment_status?.state || 'unknown';
  const env = payload.deployment?.environment || 'unknown';
  const repo = payload.repository?.full_name || 'unknown';
  const creator = payload.deployment?.creator?.login || 'unknown';
  const sha = payload.deployment?.sha?.substring(0, 7) || '';

  const severityMap: Record<string, 'info' | 'warning' | 'error'> = {
    success: 'info',
    pending: 'info',
    in_progress: 'info',
    failure: 'error',
    error: 'error',
  };

  return {
    source: 'github',
    eventType: 'deployment',
    title: `Deployment ${state} — ${env}`,
    description: `${repo} deployed to ${env} by ${creator} (${sha})`,
    severity: severityMap[state] || 'info',
    metadata: {
      state,
      environment: env,
      repository: repo,
      creator,
      sha,
      url: payload.deployment_status?.target_url || null,
    },
    occurredAt: new Date(payload.deployment_status?.created_at || Date.now()),
  };
}

function normalizeWorkflowRun(payload: any): NormalizedEvent {
  const run = payload.workflow_run || {};
  const conclusion = run.conclusion || 'in_progress';
  const name = run.name || 'Unknown workflow';
  const repo = payload.repository?.full_name || 'unknown';
  const branch = run.head_branch || 'unknown';
  const actor = run.actor?.login || 'unknown';

  const severityMap: Record<string, 'info' | 'warning' | 'error'> = {
    success: 'info',
    failure: 'error',
    cancelled: 'warning',
    skipped: 'info',
    timed_out: 'error',
    in_progress: 'info',
  };

  const titleMap: Record<string, string> = {
    success: 'CI pipeline passed',
    failure: 'CI pipeline failed',
    cancelled: 'CI pipeline cancelled',
    timed_out: 'CI pipeline timed out',
    in_progress: 'CI pipeline running',
  };

  return {
    source: 'github',
    eventType: 'workflow_run',
    title: titleMap[conclusion] || `Workflow: ${conclusion}`,
    description: `${name} on ${repo}/${branch} by ${actor}`,
    severity: severityMap[conclusion] || 'info',
    metadata: {
      workflowName: name,
      conclusion,
      repository: repo,
      branch,
      actor,
      runId: run.id,
      runNumber: run.run_number,
      url: run.html_url || null,
    },
    occurredAt: new Date(run.updated_at || run.created_at || Date.now()),
  };
}

function normalizePush(payload: any): NormalizedEvent {
  const repo = payload.repository?.full_name || 'unknown';
  const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
  const pusher = payload.pusher?.name || 'unknown';
  const commitCount = payload.commits?.length || 0;
  const headCommit = payload.head_commit?.message || '';

  return {
    source: 'github',
    eventType: 'push',
    title: `Pushed to ${branch}`,
    description: `${pusher} pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${repo}/${branch}: "${headCommit}"`,
    severity: 'info',
    metadata: {
      repository: repo,
      branch,
      pusher,
      commitCount,
      headCommitMessage: headCommit,
      headCommitSha: payload.head_commit?.id?.substring(0, 7) || '',
      compareUrl: payload.compare || null,
    },
    occurredAt: new Date(payload.head_commit?.timestamp || Date.now()),
  };
}

function normalizePullRequest(payload: any): NormalizedEvent {
  const action = payload.action || 'unknown';
  const pr = payload.pull_request || {};
  const repo = payload.repository?.full_name || 'unknown';
  const title = pr.title || 'Untitled PR';
  const author = pr.user?.login || 'unknown';
  const number = pr.number || 0;

  return {
    source: 'github',
    eventType: 'pull_request',
    title: `PR #${number} ${action}: ${title}`,
    description: `${author} ${action} pull request #${number} on ${repo}`,
    severity: action === 'closed' && pr.merged ? 'info' : 'info',
    metadata: {
      action,
      number,
      title,
      author,
      repository: repo,
      merged: pr.merged || false,
      url: pr.html_url || null,
    },
    occurredAt: new Date(pr.updated_at || pr.created_at || Date.now()),
  };
}

function normalizeGenericGitHub(eventType: string, payload: any): NormalizedEvent {
  const repo = payload.repository?.full_name || 'unknown';
  const sender = payload.sender?.login || 'unknown';

  return {
    source: 'github',
    eventType,
    title: `GitHub event: ${eventType}`,
    description: `${eventType} event on ${repo} by ${sender}`,
    severity: 'info',
    metadata: {
      repository: repo,
      sender,
      action: payload.action || null,
    },
    occurredAt: new Date(),
  };
}
