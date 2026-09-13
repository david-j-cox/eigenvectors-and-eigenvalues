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
            still uploading. Keep this page open a few more moments; this
            message goes away on its own when it finishes. Only if it is still
            here after a couple of minutes, save a copy with the button below
            and email it to the address in the consent form. Your completion
            code above is valid either way, so you can be paid regardless.
          </p>
          <button onClick={onDownload}>Download my data</button>
        </>
      )}
    </main>
  );
}
