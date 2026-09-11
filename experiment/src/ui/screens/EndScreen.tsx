interface Props {
  points: number;
  completionCode: string;
  pending: number;
  onDownload: () => void;
}

export function EndScreen({ points, completionCode, pending, onDownload }: Props) {
  return (
    <main className="centered prose">
      <h1>Finished</h1>
      <p>
        You earned <strong>{points}</strong> points. Thank you for taking part.
      </p>
      <p>
        Your completion code is <code className="code">{completionCode}</code>.
        Enter it in Prolific to be paid.
      </p>
      {pending > 0 && (
        <>
          <p className="warning">
            {pending === 1
              ? 'One response is'
              : `${pending} responses are`}{' '}
            still uploading. Please keep this page open for a few more moments
            &mdash; this message will disappear on its own once it finishes. If
            it is still here after a minute, use the button below and email the
            file to the researcher.
          </p>
          <button onClick={onDownload}>Download my data</button>
        </>
      )}
    </main>
  );
}
