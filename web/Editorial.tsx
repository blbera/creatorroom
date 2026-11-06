import React from 'react';
import type { Project, Pack } from '../src/domain';
import { cx } from './ui';

const briefText = (brief?: string) => {
  if (!brief) return '';
  try {
    const value = JSON.parse(brief);
    return typeof value.title === 'string' ? value.title : brief;
  } catch {
    return brief;
  }
};

export const SlackCommand = ({ command }: { command: string }) => {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(false);
  return (
    <div className="my-2 flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 text-[11px] wrap-anywhere">{command}</code>
      <button
        className="shrink-0 text-[10px]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy for Slack'}
      </button>
      {error && (
        <span role="status" className={cx('micro')}>
          Select and copy the command manually.
        </span>
      )}
    </div>
  );
};

export const Editorial = ({ project, pack }: { project: Project; pack?: Pack }) => {
  const events = project.history ?? [];
  const visible = events.filter(
    (event) => !event.version || !pack || event.version <= pack.version,
  );
  const creatorRequest = pack ? pack.creatorRequest : project.creatorRequest;
  const brief = pack ? pack.brief : project.brief;
  return (
    <section
      className="editorial mb-7 rounded-lg border border-line bg-[#fffef9] p-5"
      aria-label="Editorial direction and history"
    >
      <div className={cx('section-heading')}>
        <h2>How this version was made</h2>
        <span>DECISIONS THROUGH SWITCH</span>
      </div>
      <div className="grid gap-4 text-sm min-[801px]:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold">Creator direction</h3>
          <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {creatorRequest || 'No original Slack brief was recorded for this version.'}
          </p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold">Chosen creative angle</h3>
          <p className="leading-relaxed wrap-anywhere">
            {briefText(brief) ||
              (pack ? 'Not recorded in this existing version.' : 'Choose an angle in Slack.')}
          </p>
        </div>
      </div>
      {pack?.fixesFinding && (
        <p className="mt-4 text-xs">
          This revision addresses {pack.fixesFinding.findingId} from v{pack.fixesFinding.version}:{' '}
          {pack.fixesFinding.explanation}. See the new review for the outcome.
        </p>
      )}
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-semibold">
          Editorial history · {visible.length} recorded events
        </summary>
        {visible.length ? (
          <ol className="mt-3 grid max-h-72 gap-3 overflow-auto" aria-label="Editorial events">
            {visible.map((event) => (
              <li key={event.id} className="border-l-2 border-[#bccba7] pl-3 text-xs">
                <div className="flex flex-wrap gap-x-3 text-[10px] text-muted">
                  <strong>{event.actor}</strong>
                  <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                  {event.version && <span>v{event.version}</span>}
                </div>
                <p className="mt-1 leading-relaxed whitespace-pre-wrap wrap-anywhere">
                  {event.label}
                </p>
                <details className="mt-1 text-[10px] text-muted">
                  <summary>Source Switch message</summary>
                  <code className="wrap-anywhere">{event.messageId}</code>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-xs text-muted">
            History recording starts with new Slack actions. Existing pack and approval records are
            preserved; earlier conversations have not been reconstructed.
          </p>
        )}
      </details>
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-semibold">
          Creator-confirmed terminology · {project.glossary?.length ?? 0}
        </summary>
        <p className="my-2 text-xs text-muted">
          Project guidance for future drafts and revisions. Original captions and direct quotes
          remain unchanged.
        </p>
        <ul className="grid gap-2 text-xs">
          {project.glossary?.map((g) => (
            <li key={g.from}>
              <strong>
                {g.from} → {g.to}
              </strong>
              <span className="ml-2 text-muted">
                Confirmed {new Date(g.at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
        <SlackCommand
          command={`@producer project ${project.id} glossary "original spelling" => "preferred spelling"`}
        />
      </details>
    </section>
  );
};
